import { all, get, run, scalar } from '../db.js';
import { badRequest, conflict, HttpError, notFound } from '../lib/http.js';
import { nowStr, slugify } from '../lib/utils.js';
import {
  batchUpdateImages,
  deleteImages,
  listDeletedImages,
  listDuplicateGroups,
  listImages,
  purgeImages,
  restoreImages,
  serializeMany,
  setImagesStatus,
  stats,
  statsTrend,
  updateImage,
  IMAGE_STATUS,
} from '../services/images.js';
import {
  getSiteConfig,
  setSiteConfig,
  getStorageConfig,
  getAppearanceConfig,
  setAppearanceConfig,
  resetFooterColumns,
  getCommentConfig,
  setCommentConfig,
  getSearchConfig,
  setSearchConfig,
  getEmailConfig,
  setEmailConfig,
  isEmailConfigured,
} from '../services/settings.js';
import { deleteComment, listAllComments } from '../services/comments.js';
import {
  createPack,
  deletePack,
  deleteSticker,
  listPacksWithStickers,
  setPackIcon,
  updatePack,
  uploadStickers,
} from '../services/stickers.js';
import {
  batchGenerateInviteCodes,
  createInviteCode,
  deleteInviteCode,
  listInviteCodes,
} from '../services/invites.js';
import { sendMail, testEmail, reviewNotificationEmail } from '../services/mail.js';
import { createLocalStorage } from '../services/storage/local.js';
import { listSearchTerms } from '../services/search.js';
import { listTaskRuns, listTasks, runTask } from '../services/tasks.js';
import { listAuditLogs, logAuditFromRequest } from '../services/audit.js';
import { listReports, setReportStatus, pendingReportCount } from '../services/reports.js';
import { extFromFilename, formatBytes, makeAvatar } from '../services/media.js';
import { hashPassword, randomId } from '../lib/crypto.js';
import {
  PERMISSIONS,
  ROLES,
  getRolePermissions,
  setRolePermissions,
} from '../services/roles.js';
import {
  countAdmins,
  deleteUser,
  getUserRow,
  listUsers,
  serializeUser,
  updateAvatar,
  updatePasswordHash,
  updateProfile,
  updateUserRole,
  updateUserStatus,
} from '../services/users.js';

/** 生成不重复的 slug（可排除自身 id） */
function uniqueSlug(table, base, excludeId = null) {
  const seed = slugify(base);
  let candidate = seed;
  let i = 2;
  for (;;) {
    const row = get(`SELECT id FROM ${table} WHERE slug = ?`, [candidate]);
    if (!row || row.id === excludeId) return candidate;
    candidate = `${seed}-${i}`;
    i += 1;
  }
}

/** 解析批量操作的 id 数组 */
function parseIds(value) {
  const list = (Array.isArray(value) ? value : [value])
    .map((item) => Number(item))
    .filter((n) => Number.isInteger(n) && n > 0);
  return [...new Set(list)];
}

export default async function adminRoutes(app) {
  // 各接口按自身所需的权限点单独守卫
  const guard = (permission) => ({ onRequest: [app.requirePermission(permission)] });
  const backoffice = { onRequest: [app.requireBackoffice] };

  // 统一记录后台写操作（须在本插件内所有路由注册之前声明，才会对它们生效）
  app.addHook('onResponse', async (req, reply) => {
    try {
      logAuditFromRequest(req, reply);
    } catch (err) {
      req.log.error(err, '写入操作日志失败');
    }
  });

  /* ================================ 概览统计 ================================ */
  app.get('/api/admin/stats', backoffice, async () => {
    const s = stats();
    return { ...s, totalSizeText: formatBytes(s.totalSize), pendingReports: pendingReportCount() };
  });

  // 近 30 天逐日趋势（下载 / 浏览 / 注册）
  app.get('/api/admin/stats-trend', backoffice, async (req) => {
    return { days: statsTrend(req.query?.days || 30) };
  });

  /* ================================ 举报管理 ================================ */
  const reportGuard = guard('manageImages');
  app.get('/api/admin/reports', reportGuard, async (req) =>
    listReports({
      status: req.query?.status,
      page: req.query?.page,
      pageSize: req.query?.pageSize,
    }),
  );
  app.post('/api/admin/reports/:id/action', reportGuard, async (req) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new HttpError(400, '举报 ID 不合法');
    setReportStatus(id, (req.body || {}).status);
    return { ok: true };
  });

  /* ================================ 分类管理 ================================ */
  const taxonomyGuard = guard('manageTaxonomy');

  // 一级分类的壁纸数包含其下二级分类，与前台分类页口径一致
  const categoryList = () =>
    all(
      `SELECT c.id, c.name, c.slug, c.description, c.sort_order,
              c.parent_id, c.show_in_nav, c.show_on_home, c.display_style, c.show_in_all,
              (SELECT COUNT(*) FROM images i
                WHERE i.deleted_at = ''
                  AND (i.category_id = c.id
                   OR i.category_id IN (SELECT id FROM categories WHERE parent_id = c.id))) AS count
       FROM categories c
       ORDER BY c.sort_order ASC, c.id ASC`,
    ).map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: r.description,
      sortOrder: r.sort_order,
      parentId: r.parent_id,
      showInNav: Boolean(r.show_in_nav),
      showOnHome: Boolean(r.show_on_home),
      displayStyle: normalizeStyleKey(r.display_style),
      showInAll: Boolean(r.show_in_all),
      count: r.count,
    }));

  /** 展示样式：pc 宽高自适应 / mobile 竖图适配 / small 小图模式（一排最多 8 个） */
  const DISPLAY_STYLES = new Set(['pc', 'mobile', 'small']);

  /** 把库里的样式值收敛到合法枚举，非法值回退 pc */
  function normalizeStyleKey(value) {
    return DISPLAY_STYLES.has(value) ? value : 'pc';
  }

  function normalizeDisplayStyle(value, fallback = 'pc') {
    const style = String(value || '').trim();
    if (!style) return fallback;
    if (!DISPLAY_STYLES.has(style)) throw badRequest('展示样式只能是 PC、手机或小图');
    return style;
  }

  /** 二级分类的展示样式始终跟随其一级分类 */
  const styleOf = (categoryId) =>
    normalizeStyleKey(
      get('SELECT display_style FROM categories WHERE id = ?', [categoryId])?.display_style,
    );

  /** 上级分类校验：最多两级，上级必须是一级分类 */
  function normalizeParentId(value, selfId) {
    if (value === null || value === undefined || value === '') return null;
    const parentId = Number(value);
    if (!Number.isInteger(parentId) || parentId <= 0) throw badRequest('上级分类不合法');
    if (selfId && parentId === Number(selfId)) throw badRequest('不能把分类设为自己的上级');
    const parent = get('SELECT id, parent_id FROM categories WHERE id = ?', [parentId]);
    if (!parent) throw notFound('上级分类不存在');
    if (parent.parent_id) throw badRequest('最多支持两级分类，二级分类不能作为上级');
    if (selfId && get('SELECT id FROM categories WHERE parent_id = ? LIMIT 1', [Number(selfId)])) {
      throw badRequest('该分类下已有二级分类，不能再设为二级分类');
    }
    return parentId;
  }

  app.get('/api/admin/categories', taxonomyGuard, async () => categoryList());

  app.post('/api/admin/categories', taxonomyGuard, async (req) => {
    const { name, slug, description, sortOrder, parentId, showInNav, showOnHome, displayStyle, showInAll } =
      req.body || {};
    if (!String(name || '').trim()) throw badRequest('请填写分类名称');
    const finalSlug = uniqueSlug('categories', slug || name);
    if (get('SELECT id FROM categories WHERE slug = ?', [finalSlug])) throw conflict('该 slug 已被占用');
    const finalParentId = normalizeParentId(parentId, null);
    // 二级分类的展示样式跟随一级分类，不单独设置
    const finalStyle = finalParentId
      ? styleOf(finalParentId)
      : normalizeDisplayStyle(displayStyle, 'pc');
    const now = nowStr();
    const { lastInsertRowid } = run(
      `INSERT INTO categories
         (name, slug, description, sort_order, parent_id, show_in_nav, show_on_home, display_style,
          show_in_all, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        String(name).trim(),
        finalSlug,
        description || '',
        Number(sortOrder) || 0,
        finalParentId,
        showInNav ? 1 : 0,
        showOnHome ? 1 : 0,
        finalStyle,
        showInAll === false ? 0 : 1,
        now,
        now,
      ],
    );
    return categoryList().find((c) => c.id === lastInsertRowid);
  });

  app.patch('/api/admin/categories/:id', taxonomyGuard, async (req) => {
    const id = Number(req.params.id);
    const current = get('SELECT * FROM categories WHERE id = ?', [id]);
    if (!current) throw notFound('分类不存在');

    const { name, slug, description, sortOrder, parentId, showInNav, showOnHome, displayStyle, showInAll } =
      req.body || {};
    const nextName = name === undefined ? current.name : String(name).trim();
    if (!nextName) throw badRequest('分类名称不能为空');
    const nextSlug =
      slug === undefined || String(slug).trim() === ''
        ? current.slug
        : uniqueSlug('categories', slug, id);
    const nextParentId =
      parentId === undefined ? current.parent_id : normalizeParentId(parentId, id);
    const nextStyle = nextParentId
      ? styleOf(nextParentId)
      : normalizeDisplayStyle(displayStyle, current.display_style);
    const now = nowStr();

    run(
      `UPDATE categories
       SET name = ?, slug = ?, description = ?, sort_order = ?, parent_id = ?,
           show_in_nav = ?, show_on_home = ?, display_style = ?, show_in_all = ?, updated_at = ?
       WHERE id = ?`,
      [
        nextName,
        nextSlug,
        description === undefined ? current.description : String(description),
        sortOrder === undefined ? current.sort_order : Number(sortOrder) || 0,
        nextParentId,
        showInNav === undefined ? current.show_in_nav : showInNav ? 1 : 0,
        showOnHome === undefined ? current.show_on_home : showOnHome ? 1 : 0,
        nextStyle,
        showInAll === undefined ? current.show_in_all : showInAll ? 1 : 0,
        now,
        id,
      ],
    );

    // 一级分类切换样式后，其下二级分类同步跟随
    if (nextStyle !== current.display_style) {
      run('UPDATE categories SET display_style = ?, updated_at = ? WHERE parent_id = ?', [
        nextStyle,
        now,
        id,
      ]);
    }
    return categoryList().find((c) => c.id === id);
  });

  app.delete('/api/admin/categories/:id', taxonomyGuard, async (req) => {
    const id = Number(req.params.id);
    const current = get('SELECT id FROM categories WHERE id = ?', [id]);
    if (!current) throw notFound('分类不存在');
    if (get('SELECT id FROM categories WHERE parent_id = ? LIMIT 1', [id])) {
      throw badRequest('该分类下还有二级分类，请先删除二级分类');
    }
    // 解除壁纸关联，而不是级联删除壁纸
    run('UPDATE images SET category_id = NULL WHERE category_id = ?', [id]);
    run('DELETE FROM categories WHERE id = ?', [id]);
    return { ok: true };
  });

  /* ================================ 标签管理 ================================ */
  const tagList = () =>
    all(
      `SELECT t.id, t.name, t.slug,
              (SELECT COUNT(*) FROM image_tags it WHERE it.tag_id = t.id) AS count
       FROM tags t
       ORDER BY t.name ASC`,
    ).map((r) => ({ id: r.id, name: r.name, slug: r.slug, count: r.count }));

  app.get('/api/admin/tags', taxonomyGuard, async () => tagList());

  app.post('/api/admin/tags', taxonomyGuard, async (req) => {
    const { name, slug } = req.body || {};
    const trimmed = String(name || '').trim();
    if (!trimmed) throw badRequest('请填写标签名称');

    // 同名标签直接复用，避免「输入即建标签」产生重复项
    const existing = get('SELECT id FROM tags WHERE name = ? COLLATE NOCASE', [trimmed]);
    if (existing) return tagList().find((t) => t.id === existing.id);

    const finalSlug = uniqueSlug('tags', slug || trimmed);
    const now = nowStr();
    const { lastInsertRowid } = run(
      'INSERT INTO tags (name, slug, created_at, updated_at) VALUES (?, ?, ?, ?)',
      [trimmed, finalSlug, now, now],
    );
    return tagList().find((t) => t.id === lastInsertRowid);
  });

  app.patch('/api/admin/tags/:id', taxonomyGuard, async (req) => {
    const id = Number(req.params.id);
    const current = get('SELECT * FROM tags WHERE id = ?', [id]);
    if (!current) throw notFound('标签不存在');
    const { name, slug } = req.body || {};
    const nextName = name === undefined ? current.name : String(name).trim();
    if (!nextName) throw badRequest('标签名称不能为空');
    const nextSlug =
      slug === undefined || String(slug).trim() === '' ? current.slug : uniqueSlug('tags', slug, id);

    run('UPDATE tags SET name = ?, slug = ?, updated_at = ? WHERE id = ?', [
      nextName,
      nextSlug,
      nowStr(),
      id,
    ]);
    return tagList().find((t) => t.id === id);
  });

  app.delete('/api/admin/tags/:id', taxonomyGuard, async (req) => {
    const id = Number(req.params.id);
    if (!get('SELECT id FROM tags WHERE id = ?', [id])) throw notFound('标签不存在');
    run('DELETE FROM image_tags WHERE tag_id = ?', [id]);
    run('DELETE FROM tags WHERE id = ?', [id]);
    return { ok: true };
  });

  /* ================================ 壁纸管理 ================================ */
  const imageGuard = guard('manageImages');
  // 审核员也要能查看列表（但改删仍需「管理壁纸」）
  const imageListGuard = guard(['manageImages', 'auditImages']);

  app.get('/api/admin/images', imageListGuard, async (req) => {
    const q = req.query || {};
    return listImages({
      page: q.page,
      pageSize: q.pageSize || q.page_size,
      category: q.category,
      tag: q.tag,
      q: q.q,
      orientation: q.orientation,
      sort: q.sort,
      // status 为空串表示全部，支持逗号分隔多状态
      status: q.status === undefined || q.status === '' ? undefined : q.status,
      withUploader: true,
    });
  });

  // 存量重复图：按 dHash 相近分组，后台可批量清理（删除同样先移入回收站）
  app.get('/api/admin/images/duplicates', imageListGuard, async (req) => {
    const q = req.query || {};
    return listDuplicateGroups({ threshold: q.threshold, limit: q.limit });
  });

  app.get('/api/admin/images/:id', imageListGuard, async (req) => {
    const row = get(
      `SELECT i.*, c.name AS category_name, c.slug AS category_slug,
              u.username AS uploader_username, u.nickname AS uploader_nickname
       FROM images i
       LEFT JOIN categories c ON c.id = i.category_id
       LEFT JOIN users u ON u.id = i.user_id
       WHERE i.id = ? AND i.deleted_at = ''`,
      [Number(req.params.id)],
    );
    if (!row) throw notFound('壁纸不存在');
    return serializeMany([row])[0];
  });

  app.patch('/api/admin/images/:id', imageGuard, async (req) => {
    const id = Number(req.params.id);
    const body = req.body || {};
    if (!get("SELECT id FROM images WHERE id = ? AND deleted_at = ''", [id])) {
      throw notFound('壁纸不存在');
    }
    if (body.title !== undefined && !String(body.title).trim()) throw badRequest('标题不能为空');
    return updateImage(id, body);
  });

  app.delete('/api/admin/images/:id', imageGuard, async (req) => {
    const deleted = await deleteImages([Number(req.params.id)]);
    if (deleted === 0) throw notFound('壁纸不存在');
    return { ok: true };
  });

  app.post('/api/admin/images/batch-delete', imageGuard, async (req) => {
    const ids = parseIds(req.body?.ids);
    if (ids.length === 0) throw badRequest('请选择要删除的壁纸');
    const deleted = await deleteImages(ids);
    return { ok: true, deleted };
  });

  /* ================================ 回收站（软删除） ================================ */
  // 回收站只保留最近 30 天，超期的由每日维护任务彻底删除（见 services/tasks.js）

  app.get('/api/admin/images/trash', imageListGuard, async (req) => {
    const q = req.query || {};
    return listDeletedImages({
      page: q.page,
      pageSize: q.pageSize || q.page_size,
      q: q.q,
    });
  });

  /** 从回收站恢复 */
  app.post('/api/admin/images/restore', imageGuard, async (req) => {
    const ids = parseIds(req.body?.ids);
    if (ids.length === 0) throw badRequest('请选择要恢复的壁纸');
    const restored = restoreImages(ids);
    return { ok: true, restored };
  });

  /** 彻底删除（含存储文件），不可恢复 */
  app.post('/api/admin/images/purge', imageGuard, async (req) => {
    const ids = parseIds(req.body?.ids);
    if (ids.length === 0) throw badRequest('请选择要彻底删除的壁纸');
    const purged = await purgeImages(ids);
    return { ok: true, purged };
  });

  /** 批量编辑：分类 / 状态 / 标签增删，至少提交一项改动 */
  app.post('/api/admin/images/batch-update', imageGuard, async (req) => {
    const body = req.body || {};
    const ids = parseIds(body.ids);
    if (ids.length === 0) throw badRequest('请选择要修改的壁纸');
    if (
      body.categoryId === undefined &&
      body.status === undefined &&
      !body.addTagIds?.length &&
      !body.removeTagIds?.length
    ) {
      throw badRequest('没有需要修改的内容');
    }
    const updated = batchUpdateImages(ids, body);
    return { ok: true, updated };
  });

  /* ================================ 内容审核 ================================ */
  const auditGuard = guard('auditImages');

  /** 待审队列（默认只看待审核，可传 status=2,3 查看历史） */
  app.get('/api/admin/audit', auditGuard, async (req) => {
    const q = req.query || {};
    return listImages({
      page: q.page,
      pageSize: q.pageSize,
      q: q.q,
      status: q.status === undefined || q.status === '' ? String(IMAGE_STATUS.pending) : q.status,
      sort: q.sort || 'latest',
      withUploader: true,
    });
  });

  /** 审核结果邮件通知：给投稿人的邮箱发通知（SMTP 未配置或无邮箱则跳过，不影响审核主流程） */
  function notifyReview(ids, { approved, reason = '' }) {
    if (!isEmailConfigured() || ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    const rows = all(
      `SELECT images.id, images.title, users.email
       FROM images LEFT JOIN users ON users.id = images.user_id
       WHERE images.id IN (${placeholders})`,
      ids,
    );
    for (const row of rows) {
      if (!row?.email) continue;
      sendMail({
        to: row.email,
        ...reviewNotificationEmail({ approved, title: row.title, imageId: row.id, reason }),
      }).catch(() => {});
    }
  }

  /** 审核通过：待审核 → 已发布 */
  app.post('/api/admin/audit/approve', auditGuard, async (req) => {
    const ids = parseIds(req.body?.ids);
    if (ids.length === 0) throw badRequest('请选择要通过的壁纸');
    const changed = setImagesStatus(ids, IMAGE_STATUS.published);
    notifyReview(ids, { approved: true });
    return { ok: true, changed };
  });

  /** 审核驳回：待审核/已发布 → 已驳回，必须写原因（创作者中心会展示给投稿人） */
  app.post('/api/admin/audit/reject', auditGuard, async (req) => {
    const ids = parseIds(req.body?.ids);
    if (ids.length === 0) throw badRequest('请选择要驳回的壁纸');
    const reason = String(req.body?.reason || '').trim();
    if (!reason) throw badRequest('请填写驳回原因，投稿人需要知道哪里不合格');
    const changed = setImagesStatus(ids, IMAGE_STATUS.rejected, reason);
    notifyReview(ids, { approved: false, reason });
    return { ok: true, changed };
  });

  /* ================================ 用户管理 ================================ */
  const userGuard = guard('manageUsers');

  app.get('/api/admin/users', userGuard, async (req) => {
    const q = req.query || {};
    return listUsers({
      q: q.q,
      role: q.role,
      status: q.status === undefined || q.status === '' ? undefined : q.status,
      page: q.page,
      pageSize: q.pageSize || q.page_size,
    });
  });

  /** 调整用户组 */
  app.patch('/api/admin/users/:id/role', userGuard, async (req) => {
    const id = Number(req.params.id);
    const target = getUserRow(id);
    if (!target) throw notFound('用户不存在');

    const { role } = req.body || {};
    if (!ROLES.some((item) => item.key === role)) throw badRequest('用户组不存在');
    if (id === req.authUser.id) throw badRequest('不能修改自己的用户组');
    if (target.role === 'admin' && role !== 'admin' && countAdmins() <= 1) {
      throw badRequest('站点至少需要保留一名管理员');
    }
    return serializeUser(updateUserRole(id, role));
  });

  /** 启用 / 封禁账号 */
  app.patch('/api/admin/users/:id/status', userGuard, async (req) => {
    const id = Number(req.params.id);
    const target = getUserRow(id);
    if (!target) throw notFound('用户不存在');

    const status = Number(req.body?.status) === 1 ? 1 : 0;
    if (id === req.authUser.id) throw badRequest('不能封禁自己的账号');
    if (status === 0 && target.role === 'admin' && countAdmins() <= 1) {
      throw badRequest('站点至少需要保留一名管理员');
    }
    return serializeUser(updateUserStatus(id, status));
  });

  app.delete('/api/admin/users/:id', userGuard, async (req) => {
    const id = Number(req.params.id);
    const target = getUserRow(id);
    if (!target) throw notFound('用户不存在');
    if (id === req.authUser.id) throw badRequest('不能删除自己的账号');
    if (target.role === 'admin' && countAdmins() <= 1) throw badRequest('站点至少需要保留一名管理员');
    deleteUser(id);
    return { ok: true };
  });

  /** 编辑用户资料：昵称 / 签名 / 可选重置密码 */
  app.patch('/api/admin/users/:id', userGuard, async (req) => {
    const id = Number(req.params.id);
    const target = getUserRow(id);
    if (!target) throw notFound('用户不存在');

    const body = req.body || {};
    const nickname = body.nickname === undefined ? target.nickname : String(body.nickname).trim();
    if (!nickname) throw badRequest('昵称不能为空');
    if (nickname.length > 24) throw badRequest('昵称不能超过 24 个字符');

    const bio = body.bio === undefined ? target.bio || '' : String(body.bio).trim();
    if (bio.length > 200) throw badRequest('签名不能超过 200 个字符');

    updateProfile(id, { nickname, bio });

    // 密码非空才重置，留空表示不改
    if (body.password !== undefined && String(body.password) !== '') {
      const password = String(body.password);
      if (password.length < 6) throw badRequest('密码至少 6 位');
      updatePasswordHash(id, hashPassword(password));
    }
    return serializeUser(getUserRow(id));
  });

  /** 编辑用户头像：与前台头像一致，存本机 avatars/ 目录 */
  app.post('/api/admin/users/:id/avatar', userGuard, async (req) => {
    const id = Number(req.params.id);
    const target = getUserRow(id);
    if (!target) throw notFound('用户不存在');

    const part = await req.file();
    if (!part) throw badRequest('请选择头像图片');

    const buffer = await part.toBuffer();
    if (!buffer.length) throw badRequest('头像文件为空');
    if (buffer.length > 5 * 1024 * 1024) throw badRequest('头像不能超过 5MB');
    if (!String(part.mimetype || '').startsWith('image/')) throw badRequest('头像必须是图片文件');

    const squared = await makeAvatar(buffer);
    const ext = squared ? 'webp' : extFromFilename(part.filename) || 'jpg';
    const key = `avatars/${id}-${randomId(6)}.${ext}`;

    const adapter = createLocalStorage(getStorageConfig().local);
    await adapter.put(key, squared || buffer);

    const previous = target.avatar || '';
    const updated = updateAvatar(id, `/uploads/${key}`);
    // 旧头像只清理本机 avatars/ 下的文件，外链一律不动
    if (previous.startsWith('/uploads/avatars/')) {
      await adapter.remove(previous.slice('/uploads/'.length)).catch(() => {});
    }
    return serializeUser(updated);
  });

  /* ============================== 用户组权限 ============================== */
  const roleGuard = guard('manageRoles');

  const rolePayload = () => ({
    roles: ROLES,
    permissions: PERMISSIONS,
    matrix: getRolePermissions(),
  });

  app.get('/api/admin/roles', roleGuard, async () => rolePayload());

  app.put('/api/admin/roles', roleGuard, async (req) => {
    setRolePermissions(req.body || {});
    return rolePayload();
  });

  /* ================================ 站点设置 ================================ */
  const settingsGuard = guard('manageSettings');

  app.get('/api/admin/site', settingsGuard, async () => getSiteConfig());

  app.put('/api/admin/site', settingsGuard, async (req) => {
    const body = req.body || {};
    if (body.title !== undefined && !String(body.title).trim()) throw badRequest('站点标题不能为空');
    return setSiteConfig(body);
  });

  /* ================================ 邮箱设置（SMTP） ================================ */
  app.get('/api/admin/email', settingsGuard, async () => getEmailConfig());

  app.put('/api/admin/email', settingsGuard, async (req) => setEmailConfig(req.body || {}));

  /** 发送测试邮件：可选传 to，默认发到配置里的发件邮箱 */
  app.post('/api/admin/email/test', settingsGuard, async (req) => {
    const cfg = getEmailConfig();
    if (!cfg.host || !cfg.user) throw badRequest('请先填写 SMTP 服务器与账号');
    const to = String((req.body || {}).to || '').trim() || cfg.fromEmail || cfg.user;
    try {
      await sendMail({ to, ...testEmail() });
    } catch (err) {
      throw new HttpError(500, err.message || '发送失败');
    }
    return { ok: true, to };
  });

  /* ================================ 邀请码管理 ================================ */
  app.get('/api/admin/invite-codes', settingsGuard, async () => listInviteCodes());

  app.post('/api/admin/invite-codes', settingsGuard, async (req) => createInviteCode(req.body || {}));

  app.post('/api/admin/invite-codes/batch', settingsGuard, async (req) => batchGenerateInviteCodes(req.body || {}));

  app.delete('/api/admin/invite-codes/:id', settingsGuard, async (req) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw badRequest('邀请码 ID 不合法');
    return deleteInviteCode(id);
  });

  /* ================================ 外观管理 ================================ */
  // 首页 Banner 布局 + 页脚栏目，与「站点设置」同属 manageSettings 权限
  app.get('/api/admin/appearance', settingsGuard, async () => getAppearanceConfig());

  app.put('/api/admin/appearance', settingsGuard, async (req) => setAppearanceConfig(req.body || {}));

  /** 页脚默认栏目，供后台「恢复默认」使用 */
  app.get('/api/admin/appearance/footer-defaults', settingsGuard, async () => ({
    columns: resetFooterColumns(),
  }));

  /** 上传 Banner 背景图：固定存本机 uploads/banners/ */
  app.post('/api/admin/appearance/banner', settingsGuard, async (req) => {
    const part = await req.file();
    if (!part) throw badRequest('请选择图片文件');

    const buffer = await part.toBuffer();
    if (buffer.length === 0) throw badRequest('图片内容为空');
    if (buffer.length > 5 * 1024 * 1024) throw badRequest('Banner 图片不能超过 5MB');
    if (!String(part.mimetype || '').startsWith('image/')) throw badRequest('Banner 必须是图片文件');

    const key = `banners/${Date.now().toString(36)}-${randomId(6)}.${extFromFilename(part.filename) || 'jpg'}`;
    const adapter = createLocalStorage(getStorageConfig().local);
    await adapter.put(key, buffer);

    // 只清理本机 banners/ 下的旧图，外链一律不动
    const previous = getAppearanceConfig().banner.image;
    if (previous.startsWith('/uploads/banners/')) {
      await adapter.remove(previous.slice('/uploads/'.length)).catch(() => {});
    }
    return { url: `/uploads/${key}` };
  });

  /** 上传站点 Logo：固定存本机 uploads/logo/，前台导航栏显示 */
  app.post('/api/admin/appearance/logo', settingsGuard, async (req) => {
    const part = await req.file();
    if (!part) throw badRequest('请选择图片文件');

    const buffer = await part.toBuffer();
    if (buffer.length === 0) throw badRequest('图片内容为空');
    if (buffer.length > 2 * 1024 * 1024) throw badRequest('Logo 图片不能超过 2MB');
    if (!String(part.mimetype || '').startsWith('image/')) throw badRequest('Logo 必须是图片文件');

    const key = `logo/${Date.now().toString(36)}-${randomId(6)}.${extFromFilename(part.filename) || 'png'}`;
    const adapter = createLocalStorage(getStorageConfig().local);
    await adapter.put(key, buffer);

    // 只清理本机 logo/ 下的旧图，外链一律不动
    const previous = getAppearanceConfig().logo || '';
    if (previous.startsWith('/uploads/logo/')) {
      await adapter.remove(previous.slice('/uploads/'.length)).catch(() => {});
    }
    return { url: `/uploads/${key}` };
  });

  /* ================================ 评论设置 ================================ */
  // 只保留两个开关；表情包本体在「表情包」管理页维护
  app.get('/api/admin/comment-settings', settingsGuard, async () => getCommentConfig());

  app.put('/api/admin/comment-settings', settingsGuard, async (req) =>
    setCommentConfig(req.body || {}),
  );

  /* ================================ 搜索设置 ================================ */
  // 后台维护的热门搜索词，前台搜索框聚焦时展示
  app.get('/api/admin/search-settings', settingsGuard, async () => getSearchConfig());

  app.put('/api/admin/search-settings', settingsGuard, async (req) =>
    setSearchConfig(req.body || {}),
  );

  // 搜索词统计：前台每次带关键词的搜索都会累加，可据此挑选热门搜索词
  app.get('/api/admin/search-terms', settingsGuard, async (req) =>
    listSearchTerms({ limit: req.query?.limit }),
  );

  /* ================================ 表情包管理 ================================ */
  // 可创建多套表情包（名字 + icon 图），每套内自己上传图片
  app.get('/api/admin/sticker-packs', settingsGuard, async () => listPacksWithStickers());

  app.post('/api/admin/sticker-packs', settingsGuard, async (req) =>
    createPack(req.body || {}),
  );

  app.patch('/api/admin/sticker-packs/:id', settingsGuard, async (req) =>
    updatePack(Number(req.params.id), req.body || {}),
  );

  app.delete('/api/admin/sticker-packs/:id', settingsGuard, async (req) => {
    const result = deletePack(Number(req.params.id));
    return { ...result, packs: listPacksWithStickers() };
  });

  /** 上传/替换套装 icon 图 */
  app.post('/api/admin/sticker-packs/:id/icon', settingsGuard, async (req) =>
    setPackIcon(Number(req.params.id), await req.file()),
  );

  /** 批量上传表情包（一次最多 50 张，见 config.maxFiles） */
  app.post('/api/admin/sticker-packs/:id/stickers', settingsGuard, async (req) => {
    // 必须在遍历时就把分片读成 Buffer：req.files() 给出的是流，
    // 若只收集不消费，multipart 解析器读不完请求体，请求会一直挂住
    const parts = [];
    for await (const part of req.files()) {
      try {
        parts.push({
          filename: part.filename,
          mimetype: part.mimetype,
          buffer: await part.toBuffer(),
        });
      } catch {
        // 单个文件读取失败（如超过大小限制）不影响其余文件
      }
    }
    return uploadStickers(Number(req.params.id), parts);
  });

  app.delete('/api/admin/stickers/:id', settingsGuard, async (req) =>
    deleteSticker(Number(req.params.id)),
  );

  /* ================================ 评论管理 ================================ */
  // 评论免审核，直接在后台删除违规内容
  const commentGuard = guard('manageImages');

  app.get('/api/admin/comments', commentGuard, async (req) => {
    const q = req.query || {};
    return listAllComments({
      page: q.page,
      pageSize: q.pageSize || q.page_size,
      q: q.q,
      imageId: q.imageId,
    });
  });

  app.delete('/api/admin/comments/:id', commentGuard, async (req) =>
    deleteComment(Number(req.params.id)),
  );

  /* ============================== 维护任务 ============================== */
  // 数据库备份 / 孤儿文件清理 / 缩略图重建 / 老数据回填，按 manageSettings 权限放行
  app.get('/api/admin/tasks', settingsGuard, async () => ({ tasks: listTasks() }));

  app.get('/api/admin/task-runs', settingsGuard, async (req) =>
    listTaskRuns(req.query?.limit),
  );

  app.post('/api/admin/tasks/:key/run', settingsGuard, async (req) =>
    runTask(String(req.params.key), { trigger: 'manual' }),
  );

  /* ============================== 操作日志 ============================== */
  // 后台写操作的留痕，按 manageSettings 权限查看
  app.get('/api/admin/audit-logs', settingsGuard, async (req) => {
    const q = req.query || {};
    return listAuditLogs({ page: q.page, pageSize: q.pageSize || q.page_size, q: q.q });
  });

  /* ============================== 其他辅助信息 ============================== */
  app.get('/api/admin/overview', backoffice, async () => ({
    categories: Number(scalar('SELECT COUNT(*) FROM categories') ?? 0),
    tags: Number(scalar('SELECT COUNT(*) FROM tags') ?? 0),
  }));
}
