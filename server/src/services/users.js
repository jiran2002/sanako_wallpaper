import { all, get, run, scalar, transaction } from '../db.js';
import { nowStr } from '../lib/utils.js';
import { canAccessBackoffice, normalizeRole, permissionList, roleName } from './roles.js';

/** 用户表对外可见的字段（不含密码哈希） */
const USER_COLUMNS =
  'id, username, role, nickname, email, bio, avatar, status, last_login_at, created_at, updated_at';

/** 注册计数存在 settings 里，用于判断「第一个注册的用户」 */
const REGISTRATION_KEY = 'registration';

export function getUserRow(id) {
  return get(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, [id]);
}

/** 登录用：需要拿到密码哈希 */
export function getUserForAuth(username) {
  return get(
    'SELECT id, username, password_hash, role, status FROM users WHERE username = ? COLLATE NOCASE',
    [String(username || '').trim()],
  );
}

/** 鉴权用：只要 id / 角色 / 状态（token 里的 role 可能已过期，一律以库为准） */
export function getUserAuthState(id) {
  return get('SELECT id, username, role, status FROM users WHERE id = ?', [id]);
}

export function usernameTaken(username) {
  return Boolean(
    get('SELECT id FROM users WHERE username = ? COLLATE NOCASE', [String(username || '').trim()]),
  );
}

/** 把数据库行转成前端契约里的用户对象（对外一律不带密码） */
export function serializeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    email: row.email || '',
    nickname: row.nickname || row.username,
    bio: row.bio || '',
    avatar: row.avatar || '',
    role: normalizeRole(row.role),
    roleName: roleName(row.role),
    status: Number(row.status ?? 1) === 1 ? 1 : 0,
    lastLoginAt: row.last_login_at || '',
    createdAt: row.created_at,
  };
}

/** 登录态下额外下发权限，前端据此控制入口显示 */
export function serializeAuthUser(row) {
  const user = serializeUser(row);
  if (!user) return null;
  return {
    ...user,
    permissions: permissionList(row.role),
    backoffice: canAccessBackoffice(row.role),
  };
}

/** 个人主页用的公开资料：附带作品数与收藏数 */
export function publicProfile(row) {
  if (!row) return null;
  const id = row.id;
  return {
    ...serializeUser(row),
    imageCount: Number(
      scalar("SELECT COUNT(*) FROM images WHERE user_id = ? AND status = 1 AND deleted_at = ''", [id]) ??
        0,
    ),
    favoriteCount: Number(scalar('SELECT COUNT(*) FROM favorites WHERE user_id = ?', [id]) ?? 0),
  };
}

export function insertUser({ username, passwordHash, role, nickname, email }) {
  const now = nowStr();
  const { lastInsertRowid } = run(
    `INSERT INTO users (username, password_hash, role, nickname, email, bio, avatar, status, last_login_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, '', '', 1, '', ?, ?)`,
    [username, passwordHash, normalizeRole(role), nickname || username, String(email || '').trim().toLowerCase(), now, now],
  );
  return getUserRow(lastInsertRowid);
}

export function updateProfile(id, { nickname, bio }) {
  run('UPDATE users SET nickname = ?, bio = ?, updated_at = ? WHERE id = ?', [
    nickname,
    bio,
    nowStr(),
    id,
  ]);
  return getUserRow(id);
}

export function updateAvatar(id, avatar) {
  run('UPDATE users SET avatar = ?, updated_at = ? WHERE id = ?', [avatar, nowStr(), id]);
  return getUserRow(id);
}

export function updatePasswordHash(id, passwordHash) {
  run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [
    passwordHash,
    nowStr(),
    id,
  ]);
}

export function touchLogin(id) {
  run('UPDATE users SET last_login_at = ? WHERE id = ?', [nowStr(), id]);
}

/* ------------------------------- 后台用户管理 ------------------------------- */

function buildUserFilters({ q, role, status }) {
  const where = [];
  const params = [];

  if (q) {
    where.push('(username LIKE ? OR nickname LIKE ?)');
    const like = `%${String(q).trim()}%`;
    params.push(like, like);
  }
  if (role) {
    where.push('role = ?');
    params.push(normalizeRole(role));
  }
  if (status !== undefined && status !== '' && status !== null) {
    where.push('status = ?');
    params.push(Number(status) === 1 ? 1 : 0);
  }

  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

export function listUsers(options = {}) {
  const page = Math.max(1, Number(options.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(options.pageSize) || 20));
  const { clause, params } = buildUserFilters(options);

  const total = Number(scalar(`SELECT COUNT(*) FROM users ${clause}`, params) ?? 0);
  const rows = all(
    `SELECT ${USER_COLUMNS},
            (SELECT COUNT(*) FROM images i WHERE i.user_id = users.id AND i.deleted_at = '') AS image_count,
            (SELECT COUNT(*) FROM favorites f WHERE f.user_id = users.id) AS favorite_count
     FROM users ${clause}
     ORDER BY id ASC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );

  return {
    items: rows.map((row) => ({
      ...serializeUser(row),
      imageCount: row.image_count,
      favoriteCount: row.favorite_count,
    })),
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export function countAdmins() {
  return Number(scalar("SELECT COUNT(*) FROM users WHERE role = 'admin' AND status = 1") ?? 0);
}

export function updateUserRole(id, role) {
  run('UPDATE users SET role = ?, updated_at = ? WHERE id = ?', [normalizeRole(role), nowStr(), id]);
  return getUserRow(id);
}

export function updateUserStatus(id, status) {
  run('UPDATE users SET status = ?, updated_at = ? WHERE id = ?', [
    Number(status) === 1 ? 1 : 0,
    nowStr(),
    id,
  ]);
  return getUserRow(id);
}

/** 删除用户：解除其壁纸归属与收藏关系，再删账号 */
export function deleteUser(id) {
  transaction(() => {
    run('DELETE FROM favorites WHERE user_id = ?', [id]);
    run('UPDATE images SET user_id = NULL WHERE user_id = ?', [id]);
    run('DELETE FROM users WHERE id = ?', [id]);
  });
}

/* ------------------------------ 注册顺序计数 ------------------------------ */

function readRegistrationCount() {
  const row = get('SELECT value FROM settings WHERE key = ?', [REGISTRATION_KEY]);
  if (!row) return 0;
  try {
    return Number(JSON.parse(row.value)?.count ?? 0) || 0;
  } catch {
    return 0;
  }
}

/** 是否还没有任何「通过注册产生」的用户 */
export function isFirstRegisteredUser() {
  return readRegistrationCount() === 0;
}

export function markRegistered() {
  run(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [REGISTRATION_KEY, JSON.stringify({ count: readRegistrationCount() + 1 }), nowStr()],
  );
}
