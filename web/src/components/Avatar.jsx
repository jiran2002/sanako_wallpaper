/** 用户头像：有自定义头像用图片，否则用昵称首字生成占位 */
export default function Avatar({ user, size = 32, className = '' }) {
  const name = (user?.nickname || user?.username || '').trim()
  const initial = name.slice(0, 1).toUpperCase() || 'U'

  if (user?.avatar) {
    return (
      <img
        src={user.avatar}
        alt={name || '头像'}
        style={{ width: size, height: size }}
        className={`shrink-0 rounded-full object-cover ring-1 ring-black/5 ${className}`}
      />
    )
  }

  return (
    <span
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      className={`grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary-500 to-indigo-500 font-semibold text-white ${className}`}
    >
      {initial}
    </span>
  )
}
