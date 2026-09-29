import { notFound } from '../lib/http.js';
import { listImages } from '../services/images.js';
import { canAccessOriginal } from '../services/settings.js';
import { getUserRow, publicProfile } from '../services/users.js';

/** 个人主页：公开的用户资料 + 该用户发布的壁纸 */
export default async function userRoutes(app) {
  app.get('/api/users/:id', async (req) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw notFound('用户不存在');
    const user = getUserRow(id);
    if (!user) throw notFound('用户不存在');
    return publicProfile(user);
  });

  app.get('/api/users/:id/images', { onRequest: [app.optionalAuth] }, async (req) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw notFound('用户不存在');
    if (!getUserRow(id)) throw notFound('用户不存在');

    const q = req.query || {};
    return listImages({
      page: q.page,
      pageSize: q.pageSize || q.page_size,
      userId: id,
      status: 1,
      sort: q.sort,
      packCoversOnly: true,
      allowOriginal: canAccessOriginal(req.authUser, req.permissions),
    });
  });
}
