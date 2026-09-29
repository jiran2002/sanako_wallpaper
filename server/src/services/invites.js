import crypto from 'node:crypto';
import { all, get, run } from '../db.js';
import { nowStr } from '../lib/utils.js';
import { HttpError } from '../lib/http.js';

/** 邀请码：注册时可选填/必填，管理员可在后台自定义或批量生成 */

const CODE_RE = /^[A-Z0-9]{4,32}$/;

function generateCode(length = 10) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const buf = crypto.randomBytes(length * 2);
  let out = '';
  for (let i = 0; i < length; i += 1) out += chars[buf[i] % chars.length];
  return out;
}

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

/** 兼容 datetime-local（2026-10-01T12:34）与完整时间，统一成 YYYY-MM-DD HH:mm:ss */
function normalizeExpires(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  let t = s.replace('T', ' ');
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(t)) t += ':00';
  return t;
}

function serialize(row) {
  const maxUses = Number(row.max_uses ?? 1);
  return {
    id: row.id,
    code: row.code,
    maxUses,
    usedCount: Number(row.used_count ?? 0),
    unlimited: maxUses === 0,
    expiresAt: row.expires_at || '',
    expired: Boolean(row.expires_at) && row.expires_at <= nowStr(),
    note: row.note || '',
    createdAt: row.created_at,
  };
}

export function listInviteCodes() {
  return all('SELECT * FROM invite_codes ORDER BY id DESC').map(serialize);
}

export function createInviteCode({ code, maxUses = 1, expiresAt = '', note = '' } = {}) {
  let finalCode = normalizeCode(code);
  if (!finalCode) finalCode = generateCode(10);
  if (!CODE_RE.test(finalCode)) throw new HttpError(400, '邀请码需 4-32 位大写字母或数字');
  if (get('SELECT id FROM invite_codes WHERE code = ?', [finalCode])) {
    throw new HttpError(409, '该邀请码已存在');
  }
  const max = Number(maxUses);
  const finalMax = Number.isFinite(max) && max >= 0 ? Math.floor(max) : 1;
  const { lastInsertRowid } = run(
    `INSERT INTO invite_codes (code, max_uses, used_count, expires_at, note, created_at)
     VALUES (?, ?, 0, ?, ?, ?)`,
    [finalCode, finalMax, normalizeExpires(expiresAt), String(note || ''), nowStr()],
  );
  return serialize(get('SELECT * FROM invite_codes WHERE id = ?', [lastInsertRowid]));
}

/** 批量生成随机邀请码，count 上限 200 */
export function batchGenerateInviteCodes({ count = 1, maxUses = 1, expiresAt = '', note = '' } = {}) {
  const n = Math.min(Math.max(Number(count) || 0, 1), 200);
  const created = [];
  for (let i = 0; i < n; i += 1) {
    let code = generateCode(10);
    while (get('SELECT id FROM invite_codes WHERE code = ?', [code])) code = generateCode(10);
    created.push(createInviteCode({ code, maxUses, expiresAt, note }));
  }
  return created;
}

export function deleteInviteCode(id) {
  run('DELETE FROM invite_codes WHERE id = ?', [Number(id)]);
  return { ok: true };
}

/** 校验邀请码可用（不消耗）；无效/过期/用尽时抛错 */
export function assertInviteValid(rawCode) {
  const code = normalizeCode(rawCode);
  if (!code) throw new HttpError(400, '请输入邀请码');
  const row = get('SELECT * FROM invite_codes WHERE code = ?', [code]);
  if (!row) throw new HttpError(400, '邀请码无效');
  if (row.expires_at && row.expires_at <= nowStr()) throw new HttpError(400, '邀请码已过期');
  if (Number(row.max_uses) > 0 && Number(row.used_count) >= Number(row.max_uses)) {
    throw new HttpError(400, '邀请码使用次数已用尽');
  }
}

/** 消耗邀请码（注册成功后调用），使用次数 +1 */
export function consumeInviteCode(rawCode) {
  const code = normalizeCode(rawCode);
  if (!code) return;
  run('UPDATE invite_codes SET used_count = used_count + 1 WHERE code = ?', [code]);
}