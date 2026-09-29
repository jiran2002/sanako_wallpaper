import { get, scalar } from '../db.js';
import { badRequest, notFound } from '../lib/http.js';
import {
  IMAGE_STATUS,
  deleteImages,
  listImages,
  setImagesStatus,
  updateImage,
} from '../services/images.js';

/**
 * 创作者中心（前台 /creator 页面用）。
 * 面向「编辑 / 版主」这类内容角色：默认拥有审核壁纸 + 管理壁纸权限即可使用。
 * 与后台 /api/admin/* 的区别是：这里审核结果与自己的投稿绑在一起看，
 * 且普通作者只能改自己的作品，管理员才能动别人的。
 */
export default async function creatorRoutes(app) {
  /** 能打开创作者中心：具备审核或管理壁纸权限 */
  const entryGuard = { onRequest: [app.requirePermission(['auditImages', 'manageImages'])] };
  /** 审核动作：需要审核壁纸权限 */
  const auditGuard = { onRequest: [app.requirePermission('auditImages')] };

  function parseIds(value) {
    const list = Array.isArray(value) ? value : [value];
    return [...new Set(list.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  }

  /** 概览数据：我的投稿统计 + 全站待审数量 */
  app.get('/api/creator/overview', entryGuard, async (req) => {
    const userId = req.user.sub;
    const mine = (status) =>
      Number(
        scalar(
          "SELECT COUNT(*) FROM images WHERE user_id = ? AND status = ? AND deleted_at = ''",
          [userId, status],
        ) ?? 0,
      );

    return {
      my: {
        total: Number(
          scalar("SELECT COUNT(*) FROM images WHERE user_id = ? AND deleted_at = ''", [userId]) ?? 0,
        ),
        published: mine(IMAGE_STATUS.published),
        pending: mine(IMAGE_STATUS.pending),
        rejected: mine(IMAGE_STATUS.rejected),
        hidden: mine(IMAGE_STATUS.hidden),
        downloads: Number(
          scalar(
            "SELECT COALESCE(SUM(downloads), 0) FROM images WHERE user_id = ? AND deleted_at = ''",
            [userId],
          ) ?? 0,
        ),
        views: Number(
          scalar(
            "SELECT COALESCE(SUM(views), 0) FROM images WHERE user_id = ? AND deleted_at = ''",
            [userId],
          ) ?? 0,
        ),
      },
      pendingTotal: Number(
        scalar(
          "SELECT COUNT(*) FROM images WHERE status = ? AND deleted_at = ''",
          [IMAGE_STATUS.pending],
        ) ?? 0,
      ),
    };
  });

  /** 我的投稿（含各状态） */
  app.get('/api/creator/uploads', entryGuard, async (req) => {
    const q = req.query || {};
    return listImages({
      page: q.page,
      pageSize: q.pageSize || q.page_size,
      q: q.q,
      sort: q.sort || 'latest',
      status: q.status === undefined || q.status === '' ? undefined : q.status,
      userId: req.user.sub,
      allowOriginal: true,
    });
  });

  /** 待审队列：默认只看待审核，可传 status 查看历史 */
  app.get('/api/creator/audit', auditGuard, async (req) => {
    const q = req.query || {};
    return listImages({
      page: q.page,
      pageSize: q.pageSize || q.page_size,
      q: q.q,
      status: q.status === undefined || q.status === '' ? String(IMAGE_STATUS.pending) : q.status,
      sort: q.sort || 'latest',
      withUploader: true,
      allowOriginal: true,
    });
  });

  /** 审核通过 */
  app.post('/api/creator/audit/approve', auditGuard, async (req) => {
    const ids = parseIds(req.body?.ids);
    if (ids.length === 0) throw badRequest('请选择要通过的壁纸');
    const changed = setImagesStatus(ids, IMAGE_STATUS.published);
    return { ok: true, changed };
  });

  /** 审核驳回：必须写原因，投稿人能在「我的投稿」里看到 */
  app.post('/api/creator/audit/reject', auditGuard, async (req) => {
    const ids = parseIds(req.body?.ids);
    if (ids.length === 0) throw badRequest('请选择要驳回的壁纸');
    const reason = String(req.body?.reason || '').trim();
    if (!reason) throw badRequest('请填写驳回原因，投稿人需要知道哪里不合格');
    const changed = setImagesStatus(ids, IMAGE_STATUS.rejected, reason);
    return { ok: true, changed };
  });

  /** 自己（或管理员）的投稿才能改动 */
  function assertOwnOrManage(req, id) {
    const row = get("SELECT user_id FROM images WHERE id = ? AND deleted_at = ''", [id]);
    if (!row) throw notFound('壁纸不存在');
    if (Number(row.user_id) !== Number(req.user.sub) && !req.permissions?.manageImages) {
      throw badRequest('只能操作自己上传的壁纸');
    }
  }

  app.patch('/api/creator/images/:id', entryGuard, async (req) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw badRequest('壁纸 ID 不合法');
    assertOwnOrManage(req, id);
    const body = req.body || {};
    if (body.title !== undefined && !String(body.title).trim()) throw badRequest('标题不能为空');
    // 作者只能改文案与网盘链接，不能自己改审核状态
    const { title, description, categoryId, tagIds, mirrors } = body;
    return updateImage(id, { title, description, categoryId, tagIds, mirrors });
  });

  app.delete('/api/creator/images/:id', entryGuard, async (req) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw badRequest('壁纸 ID 不合法');
    assertOwnOrManage(req, id);
    await deleteImages([id]);
    return { ok: true };
  });
}
