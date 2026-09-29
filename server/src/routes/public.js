import { ZipArchive } from 'archiver';
import { all, get, run, scalar } from '../db.js';
import { HttpError } from '../lib/http.js';
import {
  canAccessOriginal,
  getSiteConfig,
  getAppearanceConfig,
  getStorageConfig,
  getCommentConfig,
  getSearchConfig,
} from '../services/settings.js';
import { createComment, listComments } from '../services/comments.js';
import { recordSearchTerm } from '../services/search.js';
import { createReport } from '../services/reports.js';
import { publicStickerPacks } from '../services/stickers.js';
import {
  getImageById,
  incrementDownloads,
  incrementViews,
  listImages,
  packItems,
  packRows,
  randomImages,
  relatedImages,
  searchSimilar,
} from '../services/images.js';
import { getAccount, createRemoteStorage, listAccounts } from '../services/storage/index.js';
import { createLocalStorage } from '../services/storage/local.js';
import { attachmentHeader, contentTypeForExt, extFromFilename, perceptualHash } from '../services/media.js';
import { createRateLimiter } from '../lib/rate-limit.js';
import { verifyCaptcha } from '../services/captcha.js';
import { nowStr } from '../lib/utils.js';

// 下载限流：同一身份（登录用户按账号，游客按 IP）每分钟最多 30 次，
// 用于拦住批量抓取原图的脚本；正常浏览下载不会触发。
const downloadLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 30 });

// 游客每日下载次数限制（按 IP），配置在站点设置的 guestDownloadLimit
const guestQuota = new Map();

export default async function publicRoutes(app) {
  /** 下载前的限流校验，超限时抛 429 */
  function assertNotRateLimited(req) {
    const key = req.user?.sub ? `user:${req.user.sub}` : `ip:${req.ip}`;
    const result = downloadLimiter.hit(key);
    if (result.ok) return;
    throw new HttpError(429, `下载过于频繁，请 ${result.retryAfter} 秒后再试`);
  }
  /**
   * 当前请求是否允许拿到原图地址。
   * 「站点开启登录后下载」优先级最高：游客即使所在用户组开了下载权限也拿不到原图，
   * 接口只下发压缩预览图，避免游客直接拼原图直链绕过限制。
   */
  function canDownload(req) {
    return canAccessOriginal(req.authUser, req.permissions);
  }

  /** 游客每日下载次数限制（按 IP），仅在未登录时生效 */
  function assertGuestQuota(req, siteConfig) {
    const limit = Number(siteConfig.guestDownloadLimit) || 0;
    if (limit <= 0) return;
    const today = nowStr().slice(0, 10); // YYYY-MM-DD，跨天自动从 0 重新计数
    const key = `${req.ip}:${today}`;
    const used = guestQuota.get(key) || 0;
    if (used >= limit) {
      throw new HttpError(429, '今日游客下载次数已达上限，请登录后继续下载或明天再试');
    }
    guestQuota.set(key, used + 1);
  }

  /** 下载前的统一校验（单图下载与图包下载共用） */
  function assertCanDownload(req) {
    const siteConfig = getSiteConfig();
    if (siteConfig.requireLoginDownload && !req.authUser) {
      throw new HttpError(401, '本站已开启登录后下载，请先登录账号');
    }
    if (!req.permissions?.download) throw new HttpError(403, '当前用户组没有下载权限');

    // 游客（未登录）下载原图时，若站点未开启「登录后下载」，
    // 叠加图形验证码与每日次数限制，防止无限制抓取原图。
    if (!req.authUser) {
      if (siteConfig.downloadCaptcha) {
        if (!verifyCaptcha(req.query?.captchaId, req.query?.captchaCode)) {
          throw new HttpError(403, '请先通过图形验证码才能下载原图');
        }
      }
      assertGuestQuota(req, siteConfig);
    }
  }

  /* -------------------------------- 站点信息 -------------------------------- */
  // 一并下发外观设置（首页 Banner 布局、页脚栏目）与评论开关，前台无需额外请求
  app.get('/api/site', async () => {
    const comment = getCommentConfig();
    return {
      ...getSiteConfig(),
      appearance: getAppearanceConfig(),
      // 只下发开关，表情包来源分类等后台配置不外泄
      comment: { enabled: comment.enabled, stickerEnabled: comment.stickerEnabled },
    };
  });

  /* --------------------------------- 分类 --------------------------------- */
  // 一级分类的壁纸数包含其下二级分类，与分类页口径一致
  app.get('/api/categories', async () =>
    all(
      `SELECT c.id, c.name, c.slug, c.description, c.sort_order,
              c.parent_id, c.show_in_nav, c.show_on_home, c.display_style,
              (SELECT COUNT(*) FROM images i
                WHERE i.status = 1 AND i.deleted_at = ''
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
      displayStyle: ['mobile', 'small'].includes(r.display_style) ? r.display_style : 'pc',
      count: r.count,
    })),
  );

  /* ---------------------------------- 标签 ---------------------------------- */
  app.get('/api/tags', async () =>
    all(
      `SELECT t.id, t.name, t.slug,
              (SELECT COUNT(*) FROM image_tags it JOIN images i ON i.id = it.image_id
                WHERE it.tag_id = t.id AND i.status = 1 AND i.deleted_at = '') AS count
       FROM tags t
       ORDER BY count DESC, t.id ASC`,
    ).map((r) => ({ id: r.id, name: r.name, slug: r.slug, count: r.count })),
  );

  /* --------------------------------- 壁纸列表 -------------------------------- */
  // 可选鉴权：只有拿到下载授权的用户才会收到原图地址，其余一律只给压缩预览图
  app.get('/api/images', { onRequest: [app.optionalAuth] }, async (req) => {
    const q = req.query || {};
    const result = listImages({
      page: q.page,
      pageSize: q.pageSize || q.page_size,
      category: q.category,
      tag: q.tag,
      q: q.q,
      orientation: q.orientation,
      format: q.format,
      minWidth: q.minWidth || q.min_width,
      minHeight: q.minHeight || q.min_height,
      color: q.color,
      dateFrom: q.dateFrom || q.date_from,
      dateTo: q.dateTo || q.date_to,
      sort: q.sort,
      status: 1,
      packCoversOnly: true,
      allowOriginal: canDownload(req),
      // 前台聚合列表：排除未勾选「加入全部壁纸」的分类下的图片
      excludeNotInAll: true,
    });
    // 落库搜索词与命中数，后台据此维护热门搜索词（只统计真正带了关键词的请求）
    if (q.q && String(q.q).trim()) recordSearchTerm(q.q, result.total);
    return result;
  });

  /* --------------------------------- 搜索建议 -------------------------------- */
  // 无关键词时返回后台配置的热门搜索词；有关键词时按「标签 / 分类 / 标题」前缀匹配
  app.get('/api/search/suggest', async (req) => {
    const keyword = String(req.query?.q || '').trim();
    const limit = Math.min(10, Math.max(1, Number(req.query?.limit) || 8));
    if (!keyword) return { hot: getSearchConfig().hotWords, items: [] };

    const like = `${keyword}%`;
    const items = [];
    for (const row of all(
      `SELECT t.name, t.slug, (SELECT COUNT(*) FROM image_tags it JOIN images i ON i.id = it.image_id
                                 WHERE it.tag_id = t.id AND i.status = 1 AND i.deleted_at = '') AS count
       FROM tags t WHERE t.name LIKE ? ORDER BY count DESC, t.id ASC LIMIT ?`,
      [like, limit],
    )) {
      if (row.count > 0) items.push({ type: 'tag', label: row.name, value: row.slug });
    }
    for (const row of all(
      'SELECT name, slug FROM categories WHERE name LIKE ? ORDER BY sort_order ASC, id ASC LIMIT ?',
      [like, 4],
    )) {
      items.push({ type: 'category', label: row.name, value: row.slug });
    }
    for (const row of all(
      `SELECT title FROM images WHERE status = 1 AND deleted_at = '' AND title LIKE ? ORDER BY views DESC LIMIT ?`,
      [`%${keyword}%`, 4],
    )) {
      const title = String(row.title || '').trim();
      if (title) items.push({ type: 'keyword', label: title, value: title });
    }
    // 去重（不同来源可能给出同一个词）
    const seen = new Set();
    return {
      hot: [],
      items: items.filter((item) => {
        const key = `${item.type}:${item.value}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, limit),
    };
  });

  /* --------------------------------- 以图搜图 -------------------------------- */
  // 上传一张图，按其 dHash 指纹返回视觉最相似的已发布壁纸；未安装 sharp 或解析失败时返回空结果
  app.post('/api/search/by-image', { onRequest: [app.optionalAuth] }, async (req) => {
    if (!req.isMultipart()) throw new HttpError(400, '请使用 multipart/form-data 上传图片');
    const limit = Math.min(60, Math.max(1, Number(req.query?.limit) || 24));
    let buffer = null;
    for await (const part of req.parts()) {
      if (part.type === 'file') {
        const data = await part.toBuffer();
        if (data.length > 0) {
          buffer = data;
          break;
        }
      }
    }
    if (!buffer) throw new HttpError(400, '没有收到图片文件');
    const phash = await perceptualHash(buffer);
    return { items: searchSimilar(phash, { limit, allowOriginal: canDownload(req) }) };
  });

  /* --------------------------------- 随机壁纸 -------------------------------- */
  app.get('/api/images/random', { onRequest: [app.optionalAuth] }, async (req) =>
    randomImages(req.query?.count, { allowOriginal: canDownload(req) }),
  );

  /* --------------------------------- 壁纸详情 -------------------------------- */
  // 可选鉴权：登录用户会额外得到 favorited（是否已收藏）；发布者信息一律不下发
  app.get('/api/images/:id', { onRequest: [app.optionalAuth] }, async (req) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new HttpError(400, '壁纸 ID 不合法');
    const row = get("SELECT id FROM images WHERE id = ? AND status = 1 AND deleted_at = ''", [id]);
    if (!row) throw new HttpError(404, '壁纸不存在');
    incrementViews(id);

    const allowOriginal = canDownload(req);
    const image = getImageById(id, { allowOriginal });
    image.favorited = req.user
      ? Boolean(get('SELECT 1 FROM favorites WHERE user_id = ? AND image_id = ?', [req.user.sub, id]))
      : false;
    // 图包：附带组内全部图片，详情页据此做左右切换
    if (image.packId) {
      image.packSize = Number(
        scalar("SELECT COUNT(*) FROM images WHERE pack_id = ? AND status = 1 AND deleted_at = ''", [image.packId]) ?? 0,
      );
      image.packItems = packItems(image.packId, { allowOriginal }).filter(
        (item) => item.status === 1,
      );
    }
    return image;
  });

  /* --------------------------------- 举报壁纸 -------------------------------- */
  // 举报需要登录，避免游客刷举报；同一张图可被多人举报，由后台统一审核
  app.post('/api/images/:id/report', { onRequest: [app.authenticate] }, async (req) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new HttpError(400, '壁纸 ID 不合法');
    createReport({
      imageId: id,
      userId: req.authUser?.sub,
      reason: (req.body || {}).reason,
      detail: (req.body || {}).detail,
    });
    return { ok: true };
  });

  /* -------------------------------- 相关推荐 -------------------------------- */
  // 详情页底部推荐：视觉相似（dHash）优先，再用同分类 / 同色系按热度补足
  app.get('/api/images/:id/related', { onRequest: [app.optionalAuth] }, async (req) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new HttpError(400, '壁纸 ID 不合法');
    return {
      items: relatedImages(id, { limit: req.query?.limit, allowOriginal: canDownload(req) }),
    };
  });

  /* --------------------------------- 下载原图 -------------------------------- */
  // 权限优先级：「站点开启登录后下载」> 用户组的「下载壁纸」权限。
  // 也就是说，只要站点开启了登录后下载，未登录游客一律拦截，
  // 即便后台把「游客」用户组的下载权限打开也不会生效。
  app.get('/api/images/:id/download', { onRequest: [app.optionalAuth] }, async (req, reply) => {
    assertCanDownload(req);
    assertNotRateLimited(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new HttpError(400, '壁纸 ID 不合法');

    const row = get("SELECT * FROM images WHERE id = ? AND deleted_at = ''", [id]);
    if (!row) throw new HttpError(404, '壁纸不存在');
    // 未发布的壁纸仅内容管理员可见/可下载
    const canSeeUnpublished = Boolean(req.permissions?.manageImages || req.permissions?.auditImages);
    if (Number(row.status) !== 1 && !canSeeUnpublished) throw new HttpError(404, '壁纸不存在');

    incrementDownloads(id);

    const requested = String(req.query?.name || '').trim();
    const ext = extFromFilename(row.filename) || row.format || 'jpg';
    const filename = requested || row.filename || `wallpaper-${id}.${ext}`;

    reply.header('Content-Disposition', attachmentHeader(filename));
    reply.header('Content-Type', contentTypeForExt(extFromFilename(filename) || ext));
    reply.header('Cache-Control', 'no-store');

    if (row.storage_account_id) {
      const account = getAccount(row.storage_account_id);
      if (!account) throw new HttpError(500, '该壁纸所属的存储账号已被删除');
      const adapter = createRemoteStorage(account);
      const res = await adapter.get(row.storage_key);
      if (res.contentLength) reply.header('Content-Length', String(res.contentLength));
      return reply.send(res.stream);
    }

    const adapter = createLocalStorage(getStorageConfig().local);
    const info = await adapter.stat(row.storage_key).catch(() => null);
    if (!info) throw new HttpError(404, '原图文件已丢失');
    reply.header('Content-Length', String(info.size));
    return reply.send(adapter.createReadStream(row.storage_key));
  });

  /* ------------------------------ 下载整个图包 ------------------------------ */
  /** 把一张壁纸的原始文件追加进 zip；文件缺失时跳过，不影响其它图片 */
  async function appendOriginal(archive, row, name) {
    if (row.storage_account_id) {
      const account = getAccount(row.storage_account_id);
      if (!account) return;
      const res = await createRemoteStorage(account).get(row.storage_key);
      archive.append(res.stream, { name });
      return;
    }
    const adapter = createLocalStorage(getStorageConfig().local);
    const info = await adapter.stat(row.storage_key).catch(() => null);
    if (!info) return;
    archive.append(adapter.createReadStream(row.storage_key), { name });
  }

  // :id 传图包里任意一张图的 id，服务端据此找到整个图包并打包成 zip
  app.get('/api/packs/:id/download', { onRequest: [app.optionalAuth] }, async (req, reply) => {
    assertCanDownload(req);
    assertNotRateLimited(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new HttpError(400, '壁纸 ID 不合法');

    const row = get("SELECT * FROM images WHERE id = ? AND deleted_at = ''", [id]);
    if (!row) throw new HttpError(404, '壁纸不存在');
    const canSeeUnpublished = Boolean(req.permissions?.manageImages || req.permissions?.auditImages);
    if (Number(row.status) !== 1 && !canSeeUnpublished) throw new HttpError(404, '壁纸不存在');
    if (!row.pack_id) throw new HttpError(400, '该壁纸不属于图包');

    const rows = packRows(row.pack_id).filter(
      (item) => Number(item.status) === 1 || canSeeUnpublished,
    );
    if (rows.length === 0) throw new HttpError(404, '图包内没有可下载的图片');

    // zip 内文件名去重，避免同名互相覆盖
    const used = new Set();
    const entries = rows.map((item, i) => {
      let filename =
        String(item.filename || '').trim() || `wallpaper-${i + 1}.${item.format || 'jpg'}`;
      if (used.has(filename)) {
        const ext = extFromFilename(filename) || item.format || 'jpg';
        filename = `${filename.replace(/\.[^.]+$/, '')}-${i + 1}.${ext}`;
      }
      used.add(filename);
      return { row: item, filename };
    });

    for (const item of rows) incrementDownloads(item.id);

    const archive = new ZipArchive({ zlib: { level: 6 } });
    const safeName =
      String(row.title || '图包').replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 60) || '图包';

    reply.header('Content-Type', 'application/zip');
    reply.header('Content-Disposition', attachmentHeader(`${safeName}.zip`));
    reply.header('Cache-Control', 'no-store');
    reply.send(archive);

    archive.on('error', (err) => {
      req.log.error(err);
      archive.destroy();
    });

    try {
      for (const entry of entries) {
        await appendOriginal(archive, entry.row, entry.filename);
      }
      await archive.finalize();
    } catch (err) {
      req.log.error(err);
      archive.destroy();
    }
  });

  /* --------------------------------- 评论区 --------------------------------- */
  /**
   * 全局评论区开关的判定：关闭后只有管理员仍能查看与发表评论，
   * 其它角色（含游客）看到的评论区一律不可用。
   */
  function commentsUsable(req) {
    return getCommentConfig().enabled || req.authUser?.role === 'admin';
  }

  /** 表情包列表：按套装分组下发，未开启表情包时返回空数组 */
  app.get('/api/comments/stickers', { onRequest: [app.optionalAuth] }, async (req) => {
    if (!commentsUsable(req)) return [];
    return getCommentConfig().stickerEnabled ? publicStickerPacks() : [];
  });

  /** 某张壁纸的评论列表 */
  app.get('/api/images/:id/comments', { onRequest: [app.optionalAuth] }, async (req) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new HttpError(400, '壁纸 ID 不合法');

    if (!commentsUsable(req)) return { enabled: false, canComment: false, items: [] };
    return {
      enabled: true,
      // 发表评论需要登录
      canComment: Boolean(req.authUser),
      items: listComments(id),
    };
  });

  /** 发表评论（支持回复某条评论与发送表情包） */
  app.post('/api/images/:id/comments', { onRequest: [app.authenticate] }, async (req) => {
    if (req.authUser?.role !== 'admin' && !getCommentConfig().enabled) {
      throw new HttpError(403, '评论区已关闭');
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new HttpError(400, '壁纸 ID 不合法');
    return createComment({ imageId: id, user: req.authUser, ...(req.body || {}) });
  });

  /* ------------------------- 存储账号概览（前台不暴露密钥） ------------------------- */
  app.get('/api/storage/summary', async () => {
    const cfg = getStorageConfig();
    const accounts = listAccounts();
    return {
      driver: cfg.driver,
      strategy: cfg.strategy,
      accounts: accounts.map((a) => ({ id: a.id, name: a.name, provider: a.provider, enabled: a.enabled })),
      objectCount: Number(scalar('SELECT COUNT(*) FROM images WHERE storage_account_id IS NOT NULL') ?? 0),
    };
  });
}
