/** 字节格式化：2350000 -> "2.24 MB" */
export function formatBytes(bytes) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1)
  const value = n / 1024 ** i
  return `${i === 0 ? Math.round(value) : value.toFixed(2)} ${units[i]}`
}

/** 日期格式化：兼容 "2026-09-28 12:00:00" 与 ISO 字符串 */
export function formatDate(value) {
  if (!value) return '—'
  const normalized = typeof value === 'string' && value.includes('T') ? value : String(value).replace(' ', 'T')
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return String(value)
  const pad = (num) => String(num).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 分辨率文本：1920 × 1080 */
export function resolutionText(width, height) {
  if (!width || !height) return '—'
  return `${width} × ${height}`
}

const ORIENTATION_LABELS = {
  landscape: '横图',
  portrait: '竖图',
  square: '方图',
}

export function orientationText(orientation) {
  return ORIENTATION_LABELS[orientation] || '未知'
}

/** 数字千分位 */
export function formatNumber(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '0'
  return n.toLocaleString('zh-CN')
}

/**
 * 拼 img 的 srcset：把缩略图与后端生成的多尺寸变体一起列出，浏览器按屏幕宽度自动挑一档。
 * 缩略图宽度按 720 上限估算（后端缩略图固定按最大宽 720 生成）。
 * 只有一个候选时返回 undefined，调用方退回单图 src。
 */
export function imageSrcSet(image) {
  if (!image) return undefined
  const parts = []
  if (image.thumbUrl) parts.push(`${image.thumbUrl} ${Math.min(720, image.width || 720)}w`)
  for (const variant of image.variants || []) {
    if (variant?.url && variant.width) parts.push(`${variant.url} ${variant.width}w`)
  }
  return parts.length > 1 ? parts.join(', ') : undefined
}
