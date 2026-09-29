import { get, run } from '../db.js';
import { nowStr } from '../lib/utils.js';

/**
 * 用户组（角色）
 * guest 只有「未登录访客」这一种含义，其余为真实账号角色。
 */
export const ROLES = [
  { key: 'guest', name: '游客', description: '未登录访客，默认只能浏览与下载' },
  { key: 'member', name: '会员', description: '注册用户，可收藏、上传壁纸' },
  { key: 'editor', name: '编辑', description: '内容运营，可审核与整理壁纸、维护分类标签' },
  { key: 'moderator', name: '版主', description: '社区管理，可审核内容并管理用户' },
  { key: 'admin', name: '管理员', description: '拥有全部权限，不可修改' },
];

export const ROLE_KEYS = ROLES.map((item) => item.key);

/** 可配置的权限项 */
export const PERMISSIONS = [
  { key: 'download', name: '下载壁纸', description: '允许下载壁纸原图' },
  { key: 'favorite', name: '收藏壁纸', description: '允许收藏 / 取消收藏壁纸' },
  { key: 'upload', name: '上传壁纸', description: '允许上传壁纸' },
  { key: 'skipAudit', name: '上传免审', description: '上传的壁纸直接发布，无需审核' },
  { key: 'auditImages', name: '审核壁纸', description: '可查看待审队列并通过 / 驳回' },
  { key: 'manageImages', name: '管理壁纸', description: '可编辑、隐藏、删除任意壁纸' },
  { key: 'manageTaxonomy', name: '管理分类标签', description: '可增删改分类与标签' },
  { key: 'manageUsers', name: '管理用户', description: '可查看用户、调整用户组与封禁账号' },
  { key: 'manageRoles', name: '编辑用户组权限', description: '可修改各用户组的权限配置' },
  { key: 'manageSettings', name: '站点与外观设置', description: '可修改站点信息、首页 Banner 与页脚栏目、存储配置' },
];

export const PERMISSION_KEYS = PERMISSIONS.map((item) => item.key);

/** 能进入后台的权限（拥有任意一项即可） */
export const BACKOFFICE_PERMISSIONS = [
  'auditImages',
  'manageImages',
  'manageTaxonomy',
  'manageUsers',
  'manageRoles',
  'manageSettings',
];

const SETTINGS_KEY = 'role_permissions';

/** 由权限名列表生成完整矩阵行 */
function row(keys) {
  return Object.fromEntries(PERMISSION_KEYS.map((key) => [key, keys.includes(key)]));
}

const ALL_PERMISSIONS = row(PERMISSION_KEYS);

/** 各用户组的默认权限（仅作为初始值，后台可改） */
export const DEFAULT_ROLE_PERMISSIONS = {
  guest: row(['download']),
  member: row(['download', 'favorite', 'upload']),
  editor: row([
    'download',
    'favorite',
    'upload',
    'skipAudit',
    'auditImages',
    'manageImages',
    'manageTaxonomy',
  ]),
  moderator: row([
    'download',
    'favorite',
    'upload',
    'skipAudit',
    'auditImages',
    'manageImages',
    'manageUsers',
  ]),
  admin: { ...ALL_PERMISSIONS },
};

/** 兼容历史数据：旧版只有 admin / user 两种角色 */
export function normalizeRole(role) {
  if (role === 'user') return 'member';
  return ROLE_KEYS.includes(role) ? role : 'member';
}

export function roleName(role) {
  const key = normalizeRole(role);
  return ROLES.find((item) => item.key === key)?.name || key;
}

// 权限矩阵读取频繁（每个鉴权请求一次），进程内缓存，写入时失效
let cache = null;

/** 读取用户组权限矩阵：缺失项用默认值补齐，管理员始终全开 */
export function getRolePermissions() {
  if (cache) return cache;

  const stored = (() => {
    const rowValue = get('SELECT value FROM settings WHERE key = ?', [SETTINGS_KEY]);
    if (!rowValue) return {};
    try {
      return JSON.parse(rowValue.value) || {};
    } catch {
      return {};
    }
  })();

  const result = {};
  for (const role of ROLE_KEYS) {
    if (role === 'admin') {
      result.admin = { ...ALL_PERMISSIONS };
      continue;
    }
    const base = DEFAULT_ROLE_PERMISSIONS[role];
    const incoming = stored[role] || {};
    result[role] = Object.fromEntries(
      PERMISSION_KEYS.map((key) => [key, incoming[key] === undefined ? base[key] : Boolean(incoming[key])]),
    );
  }

  cache = result;
  return result;
}

/** 局部更新权限矩阵（管理员组忽略，永远全权限） */
export function setRolePermissions(patch = {}) {
  const next = structuredClone(getRolePermissions());
  for (const role of ROLE_KEYS) {
    if (role === 'admin') continue;
    const incoming = patch[role];
    if (!incoming || typeof incoming !== 'object') continue;
    for (const key of PERMISSION_KEYS) {
      if (incoming[key] !== undefined) next[role][key] = Boolean(incoming[key]);
    }
  }

  run(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [SETTINGS_KEY, JSON.stringify(next), nowStr()],
  );
  cache = next;
  return next;
}

/** 某个角色的权限对象 */
export function permissionsForRole(role) {
  const matrixByRole = getRolePermissions();
  return matrixByRole[normalizeRole(role)] || DEFAULT_ROLE_PERMISSIONS.member;
}

/** 权限对象转成前端好用的字符串数组 */
export function permissionList(role) {
  const perms = permissionsForRole(role);
  return PERMISSION_KEYS.filter((key) => perms[key]);
}

export function hasPermission(role, permission) {
  const perms = permissionsForRole(role);
  const keys = Array.isArray(permission) ? permission : [permission];
  return keys.some((key) => Boolean(perms[key]));
}

/** 是否能进入后台（拥有任意一项管理权限） */
export function canAccessBackoffice(role) {
  return hasPermission(role, BACKOFFICE_PERMISSIONS);
}
