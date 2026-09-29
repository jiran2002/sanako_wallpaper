import { all, get, run, scalar } from '../db.js';
import { HttpError } from '../lib/http.js';
import { nowStr } from '../lib/utils.js';
import { getStorageConfig } from './settings.js';
import { allowedStickerIds, stickerMapFor } from './stickers.js';
import { accountsMap, resolvePublicUrl } from './storage/index.js';

/** 评论最大字数 */
const MAX_CONTENT = 500;

const COMMENT_SELECT = `
  SELECT c.*, u.username, u.nickname, u.avatar, u.role
  FROM comments c
  LEFT JOIN users u ON u.id = c.user_id
`;

function serializeComment(row, stickers) {
  return {
    id: row.id,
    imageId: row.image_id,
    parentId: row.parent_id ?? null,
    replyToId: row.reply_to_id ?? null,
    replyTo: null,
    content: row.content || '',
    sticker: row.sticker_id ? stickers.get(Number(row.sticker_id)) || null : null,
    // 账号被删除后 user_id 为空，前端按「已注销」展示
    author: row.user_id
      ? {
          id: row.user_id,
          username: row.username || '',
          nickname: row.nickname || row.username || '用户',
          avatar: row.avatar || '',
        }
      : null,
    createdAt: row.created_at,
    replies: [],
  };
}

/** 某张壁纸的评论：顶级评论（新的在前）+ 其下的回复（正序） */
export function listComments(imageId) {
  const rows = all(`${COMMENT_SELECT} WHERE c.image_id = ? ORDER BY c.id ASC`, [imageId]);
  const stickers = stickerMapFor(rows.map((row) => row.sticker_id));
  const items = rows.map((row) => serializeComment(row, stickers));
  const byId = new Map(items.map((item) => [item.id, item]));

  const roots = [];
  for (const item of items) {
    // 父评论已被删除时把回复提升为顶级评论，避免内容凭空消失
    if (item.parentId && byId.has(item.parentId)) {
      const parent = byId.get(item.parentId);
      const target = item.replyToId ? byId.get(item.replyToId) : null;
      if (target) item.replyTo = { id: target.id, nickname: target.author?.nickname || '用户' };
      parent.replies.push(item);
    } else {
      roots.push(item);
    }
  }
  roots.reverse();
  return roots;
}

/** 发表评论：至少要有文字或表情包；回复只支持两级 */
export function createComment({ imageId, user, content, stickerId, parentId }) {
  if (!get("SELECT id FROM images WHERE id = ? AND deleted_at = ''", [imageId])) {
    throw new HttpError(404, '壁纸不存在');
  }

  const text = String(content ?? '').trim();
  if (text.length > MAX_CONTENT) throw new HttpError(400, `评论不能超过 ${MAX_CONTENT} 字`);

  let sticker = null;
  if (stickerId !== undefined && stickerId !== null && stickerId !== '') {
    const id = Number(stickerId);
    // 只允许发送后台「表情包」里启用套装中的表情，避免被塞任意图片地址
    if (!allowedStickerIds().has(id)) throw new HttpError(400, '该表情包不可用');
    sticker = id;
  }

  if (!text && !sticker) throw new HttpError(400, '请输入评论内容或选择表情包');

  let parent = null;
  let replyTo = null;
  if (parentId !== undefined && parentId !== null && parentId !== '') {
    const pid = Number(parentId);
    const target = Number.isInteger(pid)
      ? get('SELECT id, parent_id, image_id FROM comments WHERE id = ?', [pid])
      : null;
    if (!target || Number(target.image_id) !== Number(imageId)) {
      throw new HttpError(400, '回复的评论不存在');
    }
    // 回复「回复」时挂到同一个顶级评论下，保持两级结构
    parent = target.parent_id ?? target.id;
    replyTo = target.parent_id ? target.id : null;
  }

  const now = nowStr();
  const { lastInsertRowid } = run(
    `INSERT INTO comments (image_id, user_id, parent_id, reply_to_id, content, sticker_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [imageId, user?.id ?? null, parent, replyTo, text, sticker, now, now],
  );
  return { id: lastInsertRowid };
}

/** 删除评论：删除顶级评论时连同其下所有回复一起删除 */
export function deleteComment(id) {
  const row = get('SELECT id, parent_id FROM comments WHERE id = ?', [id]);
  if (!row) throw new HttpError(404, '评论不存在');
  if (!row.parent_id) run('DELETE FROM comments WHERE parent_id = ?', [id]);
  run('DELETE FROM comments WHERE id = ?', [id]);
  return { ok: true };
}

/** 后台评论列表：附带评论所属壁纸与作者信息 */
export function listAllComments(options = {}) {
  const page = Math.max(1, Number(options.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(options.pageSize) || 20));

  const where = [];
  const params = [];
  if (options.q) {
    where.push('(c.content LIKE ? OR u.nickname LIKE ? OR u.username LIKE ?)');
    const like = `%${String(options.q).trim()}%`;
    params.push(like, like, like);
  }
  if (options.imageId) {
    where.push('c.image_id = ?');
    params.push(Number(options.imageId));
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = Number(
    scalar(
      `SELECT COUNT(*) FROM comments c LEFT JOIN users u ON u.id = c.user_id ${clause}`,
      params,
    ) ?? 0,
  );
  const rows = all(
    `SELECT c.*, u.username, u.nickname, u.avatar, u.role,
            i.title AS image_title, i.thumb_key AS image_thumb_key,
            i.storage_account_id AS image_storage_account_id
     FROM comments c
     LEFT JOIN users u ON u.id = c.user_id
     LEFT JOIN images i ON i.id = c.image_id
     ${clause}
     ORDER BY c.id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );

  const stickers = stickerMapFor(rows.map((row) => row.sticker_id));
  const accounts = accountsMap();
  const storageCfg = getStorageConfig();
  const items = rows.map((row) => ({
    ...serializeComment(row, stickers),
    image: row.image_id
      ? {
          id: row.image_id,
          title: row.image_title || '',
          thumbUrl:
            resolvePublicUrl(row.image_thumb_key, row.image_storage_account_id, accounts, storageCfg) ||
            '',
        }
      : null,
  }));

  return { items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}
