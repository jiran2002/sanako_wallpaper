import { all, get, run, scalar } from '../db.js';
import { HttpError } from '../lib/http.js';
import { nowStr } from '../lib/utils.js';
import { getImageById } from './images.js';

/** 举报状态：0 待处理 / 1 已下架 / 2 已忽略 */
export const REPORT_STATUS_TEXT = { 0: '待处理', 1: '已下架', 2: '已忽略' };

/** 前台提交举报：只允许举报已发布的壁纸，同一张图可被多人举报 */
export function createReport({ imageId, userId, reason, detail = '' }) {
  const text = String(reason || '').trim();
  if (!text) throw new HttpError(400, '请选择举报原因');
  const image = get(
    "SELECT id FROM images WHERE id = ? AND status = 1 AND deleted_at = ''",
    [imageId],
  );
  if (!image) throw new HttpError(404, '壁纸不存在或已下线');
  run(
    'INSERT INTO reports (image_id, user_id, reason, detail, status, created_at) VALUES (?, ?, ?, ?, 0, ?)',
    [imageId, userId || null, text.slice(0, 100), String(detail || '').trim().slice(0, 500), nowStr()],
  );
}

/** 后台待处理举报数，供侧边栏角标使用 */
export function pendingReportCount() {
  return Number(scalar('SELECT COUNT(*) FROM reports WHERE status = 0') ?? 0);
}

/** 后台举报列表：按「待处理优先、最新在前」排序，附上被举报壁纸的完整信息 */
export function listReports({ status = '', page = 1, pageSize = 20 } = {}) {
  const p = Math.max(1, Number(page) || 1);
  const size = Math.min(100, Math.max(1, Number(pageSize) || 20));
  const where = [];
  const params = [];
  if (status !== '' && status !== null && status !== undefined) {
    where.push('r.status = ?');
    params.push(Number(status));
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = Number(scalar(`SELECT COUNT(*) FROM reports r ${whereSql}`, params) ?? 0);

  const rows = all(
    `SELECT r.*, u.username AS reporter_name, i.title AS image_title
     FROM reports r
     LEFT JOIN images i ON i.id = r.image_id
     LEFT JOIN users u ON u.id = r.user_id
     ${whereSql}
     ORDER BY r.status ASC, r.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, size, (p - 1) * size],
  );

  const items = rows.map((row) => {
    let image = null;
    if (row.image_id) {
      try {
        image = getImageById(row.image_id, { allowOriginal: true });
      } catch {
        image = null;
      }
    }
    return {
      id: row.id,
      imageId: row.image_id,
      imageTitle: row.image_title,
      reason: row.reason,
      detail: row.detail,
      status: row.status,
      statusText: REPORT_STATUS_TEXT[row.status] || '未知',
      reporter: row.reporter_name ? { username: row.reporter_name } : null,
      createdAt: row.created_at,
      image,
    };
  });

  return { items, total, page: p, pages: Math.ceil(total / size) };
}

/** 后台处理举报：改变状态（0 待处理 / 1 已下架 / 2 已忽略） */
export function setReportStatus(id, status) {
  const s = Number(status);
  if (![0, 1, 2].includes(s)) throw new HttpError(400, '处理状态不合法');
  const row = get('SELECT image_id FROM reports WHERE id = ?', [id]);
  if (!row) throw new HttpError(404, '举报不存在');
  run('UPDATE reports SET status = ? WHERE id = ?', [s, id]);
  // 「下架」时同步把被举报壁纸置为隐藏，避免审核后仍对外展示
  if (s === 1 && row.image_id) {
    run("UPDATE images SET status = 0 WHERE id = ? AND deleted_at = ''", [row.image_id]);
  }
}