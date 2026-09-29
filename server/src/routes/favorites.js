import { all, get, run, scalar } from '../db.js';
import { badRequest, notFound } from '../lib/http.js';
import { nowStr } from '../lib/utils.js';
import { serializeMany } from '../services/images.js';
import { canAccessOriginal } from '../services/settings.js';

/** 壁纸收藏：具备「收藏壁纸」权限的用户对自己收藏的壁纸增删查，并支持合集（收藏夹）分组 */
export default async function favoriteRoutes(app) {
  const guard = { onRequest: [app.requirePermission('favorite')] };

  const ownCollection = (userId, id) =>
    get('SELECT id, name FROM collections WHERE id = ? AND user_id = ?', [id, userId]);

  /** 当前用户名下合集列表（不含未分组，供筛选与移动使用） */
  app.get('/api/favorites/collections', guard, async (req) => {
    const userId = req.user.sub;
    const rows = all(
      `SELECT c.id, c.name, c.created_at, c.updated_at,
              (SELECT COUNT(*) FROM favorites f WHERE f.collection_id = c.id) AS count
       FROM collections c
       WHERE c.user_id = ?
       ORDER BY c.created_at ASC, c.id ASC`,
      [userId],
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      count: Number(r.count) || 0,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  });

  /** 新建合集 */
  app.post('/api/favorites/collections', guard, async (req) => {
    const name = String((req.body || {}).name || '').trim().slice(0, 30);
    if (!name) throw badRequest('请填写合集名称');
    const now = nowStr();
    const info = run(
      'INSERT INTO collections (user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
      [req.user.sub, name, now, now],
    );
    return { id: Number(info.lastInsertRowid), name };
  });

  /** 重命名合集 */
  app.put('/api/favorites/collections/:id', guard, async (req) => {
    const id = Number(req.params.id);
    const col = ownCollection(req.user.sub, id);
    if (!col) throw notFound('合集不存在');
    const name = String((req.body || {}).name || '').trim().slice(0, 30);
    if (!name) throw badRequest('请填写合集名称');
    run('UPDATE collections SET name = ?, updated_at = ? WHERE id = ?', [name, nowStr(), id]);
    return { ok: true };
  });

  /** 删除合集：其中的收藏回到「未分组」，不删除收藏本身 */
  app.delete('/api/favorites/collections/:id', guard, async (req) => {
    const id = Number(req.params.id);
    const col = ownCollection(req.user.sub, id);
    if (!col) throw notFound('合集不存在');
    run('UPDATE favorites SET collection_id = NULL WHERE user_id = ? AND collection_id = ?', [
      req.user.sub,
      id,
    ]);
    run('DELETE FROM collections WHERE id = ?', [id]);
    return { ok: true };
  });

  /** 我的收藏（按收藏时间倒序），可选 collection 筛选：none=未分组，数字=指定合集 */
  app.get('/api/favorites', guard, async (req) => {
    const userId = req.user.sub;
    const page = Math.max(1, Number(req.query?.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query?.pageSize) || 24));
    const c = req.query?.collection;

    let where = 'f.user_id = ?';
    const params = [userId];
    if (c === 'none') {
      where += ' AND f.collection_id IS NULL';
    } else if (c !== undefined && c !== null && c !== '') {
      const id = Number(c);
      if (Number.isInteger(id) && id > 0) {
        where += ' AND f.collection_id = ?';
        params.push(id);
      }
    }

    const base = `FROM favorites f
      JOIN images i ON i.id = f.image_id
      LEFT JOIN categories c2 ON c2.id = i.category_id
      WHERE ${where} AND i.status = 1 AND i.deleted_at = '' AND (i.pack_id IS NULL OR i.pack_cover = 1)`;

    const total = Number(scalar(`SELECT COUNT(*) ${base}`, params) ?? 0);
    const rows = all(
      `SELECT i.*, c2.name AS category_name, c2.slug AS category_slug ${base}
       ORDER BY f.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize],
    );

    return {
      items: serializeMany(rows, {
        allowOriginal: canAccessOriginal(req.authUser, req.permissions),
      }),
      total,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    };
  });

  app.post('/api/favorites/:imageId', guard, async (req) => {
    const imageId = Number(req.params.imageId);
    if (!Number.isInteger(imageId)) throw notFound('壁纸不存在');
    const image = get("SELECT id FROM images WHERE id = ? AND status = 1 AND deleted_at = ''", [imageId]);
    if (!image) throw notFound('壁纸不存在');

    // 支持直接收藏进某个合集（不传则进「未分组」）
    let collectionId = null;
    const cid = Number((req.body || {}).collectionId);
    if (Number.isInteger(cid) && cid > 0) {
      if (!ownCollection(req.user.sub, cid)) throw notFound('合集不存在');
      collectionId = cid;
    }

    run(
      'INSERT OR IGNORE INTO favorites (user_id, image_id, collection_id, created_at) VALUES (?, ?, ?, ?)',
      [req.user.sub, imageId, collectionId, nowStr()],
    );
    return { favorited: true };
  });

  /** 移动收藏到合集 / 未分组（collectionId 传 0 或空表示取消分组） */
  app.post('/api/favorites/:imageId/move', guard, async (req) => {
    const imageId = Number(req.params.imageId);
    const existing = get('SELECT id FROM favorites WHERE user_id = ? AND image_id = ?', [
      req.user.sub,
      imageId,
    ]);
    if (!existing) throw notFound('还没有收藏这张壁纸');

    let collectionId = null;
    const cid = Number((req.body || {}).collectionId);
    if (Number.isInteger(cid) && cid > 0) {
      if (!ownCollection(req.user.sub, cid)) throw notFound('合集不存在');
      collectionId = cid;
    }
    run('UPDATE favorites SET collection_id = ? WHERE user_id = ? AND image_id = ?', [
      collectionId,
      req.user.sub,
      imageId,
    ]);
    return { ok: true };
  });

  app.delete('/api/favorites/:imageId', guard, async (req) => {
    run('DELETE FROM favorites WHERE user_id = ? AND image_id = ?', [
      req.user.sub,
      Number(req.params.imageId),
    ]);
    return { favorited: false };
  });
}