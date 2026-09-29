import { api, clearToken, getToken, setToken } from './api'

const USER_KEY = 'wp_user'

/** 是否已登录（仅有 token 不代表有效，最终由 /api/auth/me 校验） */
export function isLoggedIn() {
  return Boolean(getToken())
}

/** 本地缓存的用户对象，用于首屏展示 */
export function cachedUser() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveUser(user) {
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
  else localStorage.removeItem(USER_KEY)
}

/** 登录并保存 token 与用户信息 */
export async function login(username, password) {
  const data = await api.post('/api/auth/login', { username, password })
  setToken(data.token)
  saveUser(data.user)
  return data
}

/** 注册（第一个注册的用户会自动成为管理员）；payload 可含邮箱 / 邮箱码 / 图形码 / 邀请码 */
export async function register(payload) {
  const data = await api.post('/api/auth/register', payload)
  setToken(data.token)
  saveUser(data.user)
  return data
}

/** 发送注册邮箱验证码（仅「邮箱验证码」注册模式使用） */
export async function sendEmailCode(email) {
  return api.post('/api/auth/send-code', { email })
}

/** 忘记密码：按邮箱发送重置链接 */
export async function forgotPassword(email) {
  return api.post('/api/auth/forgot-password', { email })
}

/** 用重置令牌设置新密码 */
export async function resetPassword(token, password) {
  return api.post('/api/auth/reset-password', { token, password })
}

/** 退出登录 */
export function logout() {
  clearToken()
  saveUser(null)
}

/** 获取当前登录用户（token 失效会抛 401，并自动清除 token） */
export async function fetchMe() {
  const user = await api.get('/api/auth/me', { auth: true })
  saveUser(user)
  return user
}

/** 后台登录：仅管理员账号可通过，普通账号会返回 403 */
export async function adminLogin(username, password) {
  const data = await api.post('/api/admin/login', { username, password })
  setToken(data.token)
  saveUser(data.user)
  return data
}

/** 校验当前账号是否为管理员（非管理员会返回 403） */
export async function fetchAdminMe() {
  const user = await api.get('/api/admin/me', { auth: true })
  saveUser(user)
  return user
}

/** 同步最新用户信息到本地缓存 */
export function cacheUser(user) {
  saveUser(user)
  return user
}

/** 判断用户是否拥有某权限（permission 支持字符串或数组，任一满足即通过） */
export function userHasPermission(user, permission) {
  const perms = user?.permissions
  if (!Array.isArray(perms)) return false
  const keys = Array.isArray(permission) ? permission : [permission]
  return keys.some((key) => perms.includes(key))
}

/** 兼容旧调用：本地缓存的用户名 */
export function cachedUsername() {
  return cachedUser()?.username || ''
}
