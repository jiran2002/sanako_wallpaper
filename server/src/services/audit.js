import { all, run, scalar } from '../db.js';
import { nowStr } from '../lib/utils.js';

/** 请求方法对应的中文动词 */
const METHOD_TEXT = { POST: '新增', PUT: '更新', PATCH: '修改', DELETE: '删除' };

/**
 * 路由 → 操作对象。命中顺序从上到下，特定路由放在通用前缀之前。
 * 第一项为路径前缀，第二项为对象名，第三项为可选的动作覆盖（默认取请求方法）。
 */
const RESOURCES = [
  ['/api/admin/images/batch-update', '壁纸', '批量编辑'],
  ['/api/admin/images/batch-delete', '壁纸', '批量删除'],
  ['/api/admin/images', '壁纸', null],
  ['/api/admin/audit/approve', '壁纸', '通过审核'],
  ['/api/admin/audit/reject', '壁纸', '驳回审核'],
  ['/api/admin/categories', '分类', null],
  ['/api/admin/tags', '标签', null],
  ['/api/admin/users', '用户', null],
  ['/api/admin/roles', '用户组权限', null],
  ['/api/admin/site', '站点设置', null],
  ['/api/admin/appearance', '外观设置', null],
  ['/api/admin/comment-settings', '评论设置', null],
  ['/api/admin/search-settings', '搜索设置', null],
  ['/api/admin/sticker-packs', '表情包', null],
  ['/api/admin/stickers', '表情包', null],
  ['/api/admin/comments', '评论', null],
  ['/api/admin/tasks', '维护任务', null],
];

/** 敏感字段一律脱敏，避免把密码 / 密钥写进日志 */
const SENSITIVE = /password|secret|token|credential/i;

/** 把请求体压成一行可读的摘要（脱敏 + 截断） */
function summarize(body) {
  if (!body || typeof body !== 'object') return '';
  const out = {};
  for (const [key, value] of Object.entries(body)) {
    if (SENSITIVE.test(key)) {
      out[key] = '***';
      continue;
    }
    if (Array.isArray(value)) {
      out[key] = value.length > 10 ? [...value.slice(0, 10), `…共 ${value.length} 项`] : value;
      continue;
    }
    out[key] = value;
  }
  const text = JSON.stringify(out);
  return text.length > 500 ? `${text.slice(0, 500)}…` : text;
}

/** 解析出「动作 + 操作对象」，无法识别的路由返回 null（不记录） */
export function resolveAuditMeta(method, url) {
  const path = String(url || '');
  if (!path.startsWith('/api/admin/')) return null;
  const hit = RESOURCES.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`));
  if (!hit) return null;
  const [, targetType, override] = hit;

  // 路径最后一段是数字时，作为操作对象的 id
  const segments = path.split('/').filter(Boolean);
  const last = segments[segments.length - 1];
  const targetId = /^\d+$/.test(last) ? last : '';

  const verb = override || METHOD_TEXT[method];
  if (!verb) return null;
  return { action: targetType === '维护任务' ? '执行维护任务' : `${verb}${targetType}`, targetType, targetId };
}

/** 写入一条操作日志 */
export function logAudit(entry) {
  const { actorId, actorName, action, targetType, targetId, detail, ip } = entry || {};
  run(
    `INSERT INTO audit_logs (actor_id, actor_name, action, target_type, target_id, detail, ip, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      actorId ?? null,
      actorName || '',
      action || '',
      targetType || '',
      targetId || '',
      detail || '',
      ip || '',
      nowStr(),
    ],
  );
}

/** 根据一次后台写请求补一条日志（供 onResponse 钩子调用） */
export function logAuditFromRequest(req, reply) {
  const method = req.method;
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;
  const url = req.routeOptions?.url || req.raw?.url || '';
  const meta = resolveAuditMeta(method, url);
  if (!meta) return;

  const status = reply.statusCode;
  const action = status >= 400 ? `${meta.action}（失败 ${status}）` : meta.action;
  const body = summarize(req.body);

  logAudit({
    actorId: req.authUser?.id ?? null,
    actorName: req.authUser?.nickname || req.authUser?.username || '',
    action,
    targetType: meta.targetType,
    targetId: meta.targetId,
    detail: body,
    ip: req.ip || '',
  });
}

/** 后台日志查询（分页，可按操作人或动作模糊搜索） */
export function listAuditLogs(options = {}) {
  const page = Math.max(1, Number(options.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(options.pageSize) || 20));

  const where = [];
  const params = [];
  if (options.q) {
    const like = `%${String(options.q).trim()}%`;
    where.push('(actor_name LIKE ? OR action LIKE ? OR target_type LIKE ?)');
    params.push(like, like, like);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = Number(scalar(`SELECT COUNT(*) FROM audit_logs ${clause}`, params) ?? 0);
  const items = all(
    `SELECT id, actor_id, actor_name, action, target_type, target_id, detail, ip, created_at
     FROM audit_logs
     ${clause}
     ORDER BY id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  ).map((row) => ({
    id: row.id,
    actorId: row.actor_id,
    actorName: row.actor_name,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    detail: row.detail,
    ip: row.ip,
    createdAt: row.created_at,
  }));

  return { items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}