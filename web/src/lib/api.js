// 统一网络请求封装：JSON 请求走 fetch，文件上传走 XHR（为了拿到真实进度）

const TOKEN_KEY = 'wp_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

/** 401 时的全局回调（由后台布局注册，用于跳转登录页） */
let unauthorizedHandler = null
export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = fn
}

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

// 拼接 query，自动忽略 undefined / null / 空串
function buildUrl(path, query) {
  if (!query) return path
  const params = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    if (Array.isArray(value)) {
      value.forEach((v) => {
        if (v !== undefined && v !== null && v !== '') params.append(key, v)
      })
    } else {
      params.append(key, value)
    }
  })
  const qs = params.toString()
  if (!qs) return path
  return path + (path.includes('?') ? '&' : '?') + qs
}

function parseBody(text) {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function request(path, { method = 'GET', body, query, auth = false, headers } = {}) {
  const finalHeaders = { ...(headers || {}) }
  let payload
  if (body !== undefined) {
    finalHeaders['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  if (auth) {
    const token = getToken()
    if (token) finalHeaders.Authorization = `Bearer ${token}`
  }

  let res
  try {
    res = await fetch(buildUrl(path, query), { method, headers: finalHeaders, body: payload })
  } catch {
    throw new ApiError('网络请求失败，请检查网络或后端服务', 0)
  }

  const data = parseBody(await res.text())

  if (!res.ok) {
    if (res.status === 401 && auth) {
      clearToken()
      if (unauthorizedHandler) unauthorizedHandler()
    }
    const message = (data && data.error) || `请求失败（HTTP ${res.status}）`
    throw new ApiError(message, res.status)
  }
  return data
}

export const api = {
  get: (path, opts) => request(path, { ...opts, method: 'GET' }),
  post: (path, body, opts) => request(path, { ...opts, method: 'POST', body }),
  put: (path, body, opts) => request(path, { ...opts, method: 'PUT', body }),
  patch: (path, body, opts) => request(path, { ...opts, method: 'PATCH', body }),
  del: (path, opts) => request(path, { ...opts, method: 'DELETE' }),
}

/**
 * 使用 XMLHttpRequest 上传，支持真实进度回调
 * @param {string} path 接口路径
 * @param {FormData} formData 表单数据
 * @param {{ auth?: boolean, onProgress?: (percent:number)=>void, signal?: AbortSignal }} options
 */
export function xhrUpload(path, formData, { auth = true, onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', path)
    if (auth) {
      const token = getToken()
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    }
    if (signal) {
      if (signal.aborted) {
        reject(new ApiError('上传已取消', 0))
        return
      }
      signal.addEventListener('abort', () => xhr.abort(), { once: true })
    }
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      const data = parseBody(xhr.responseText)
      if (xhr.status >= 200 && xhr.status < 300) {
        if (onProgress) onProgress(100)
        resolve(data)
        return
      }
      if (xhr.status === 401 && auth) {
        clearToken()
        if (unauthorizedHandler) unauthorizedHandler()
      }
      reject(new ApiError((data && data.error) || `上传失败（HTTP ${xhr.status}）`, xhr.status))
    }
    xhr.onerror = () => reject(new ApiError('上传失败：网络错误', 0))
    xhr.ontimeout = () => reject(new ApiError('上传失败：请求超时', 0))
    xhr.onabort = () => reject(new ApiError('上传已取消', 0))
    xhr.send(formData)
  })
}
