import { Link } from 'react-router-dom'
import { useAuth, useSite } from '../App'

const columnTitleClass = 'text-sm font-semibold text-slate-800 dark:text-slate-100'
const columnLinkClass =
  'text-sm text-slate-500 transition hover:text-primary-500 dark:text-slate-400 dark:hover:text-primary-400'

/** 兜底栏目：与 server/src/services/settings.js 的默认值保持一致 */
const FALLBACK_COLUMNS = [
  {
    title: '浏览',
    items: [
      { label: '全部壁纸', to: '/wallpapers' },
      { label: '横向壁纸', to: '/wallpapers?orientation=landscape' },
      { label: '竖向壁纸', to: '/wallpapers?orientation=portrait' },
      { label: '热门下载', to: '/wallpapers?sort=downloads' },
    ],
    notes: [],
  },
  {
    title: '我的',
    items: [
      { label: '个人主页', to: '/user/@me', authOnly: true },
      { label: '我的收藏', to: '/favorites', authOnly: true },
      { label: '上传壁纸', to: '/upload', authOnly: true },
      { label: '个人设置', to: '/settings', authOnly: true },
      { label: '登录', to: '/login', guestOnly: true },
      { label: '注册账号', to: '/register', guestOnly: true },
      { label: '全部壁纸', to: '/wallpapers', guestOnly: true },
    ],
    notes: [],
  },
  {
    title: '关于',
    items: [{ label: '管理后台', to: '/admin', adminOnly: true }],
    notes: ['壁纸均来自网络收集', '仅供个人学习与欣赏'],
  },
]

/** 链接可见性：管理员 / 登录用户 / 游客 */
function canSee(item, user) {
  if (item.adminOnly) return Boolean(user?.backoffice)
  if (item.authOnly) return Boolean(user)
  if (item.guestOnly) return !user
  return true
}

/** /user/@me 在登录后替换为真实用户主页 */
function resolveTo(to, user) {
  if (to === '/user/@me') return user ? `/user/${user.id}` : '/login'
  return to
}

/** 单个页脚链接：外链走 a 标签，站内走 React Router */
function FooterLink({ item, user }) {
  const to = resolveTo(item.to, user)
  if (/^https?:\/\//i.test(to)) {
    return (
      <a href={to} target="_blank" rel="noreferrer noopener" className={columnLinkClass}>
        {item.label}
      </a>
    )
  }
  return (
    <Link to={to} className={columnLinkClass}>
      {item.label}
    </Link>
  )
}

export default function Footer() {
  const { site } = useSite()
  const { user } = useAuth()
  const year = new Date().getFullYear()

  // 页脚宣传语与栏目均可在后台「外观管理」中自定义。
  // 只有栏目字段完全没下发（非数组）时才退回硬编码默认；后台显式删成空数组也要如实展示空页脚，
  // 否则删掉栏目后前台仍会回显默认栏目，看起来就像「没同步」。
  const config = site?.appearance?.footer || {}
  const columns = Array.isArray(config.columns) ? config.columns : FALLBACK_COLUMNS
  const promoTitle = config.promoTitle || site?.title || '壁纸站'
  const promoText =
    config.promoText || site?.description || '收录高清桌面与手机壁纸，支持分类、标签检索与一键下载原图。'

  return (
    <footer className="mt-12 border-t border-slate-200 bg-white pt-8 dark:border-white/5 dark:bg-ink-950">
      <div className="mx-auto max-w-[1536px] px-4">
        <div className="grid grid-cols-1 gap-y-6 pb-8 lg:grid-cols-12 lg:gap-x-12">
          {/* 宣传区 */}
          <div className="lg:col-span-6">
            <h3 className="text-lg font-semibold tracking-tight">{promoTitle}</h3>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500 dark:text-slate-400">{promoText}</p>
          </div>

          {/* 栏目：标题 + 链接 + 说明文字 */}
          {columns.map((column, index) => {
            const links = (column.items || []).filter((item) => canSee(item, user))
            const notes = [...(column.notes || [])]
            // 「站点设置 → 页脚文案」作为最后一条说明追加在最后一个栏目
            if (index === columns.length - 1 && site?.footer) notes.push(site.footer)
            if (links.length === 0 && notes.length === 0) return null

            return (
              <div key={`${column.title}-${index}`} className="lg:col-span-2">
                <h4 className={columnTitleClass}>{column.title}</h4>
                <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 lg:grid-cols-1">
                  {links.map((item, i) => (
                    <li key={`link-${i}`}>
                      <FooterLink item={item} user={user} />
                    </li>
                  ))}
                  {notes.map((note, i) => (
                    <li key={`note-${i}`} className="text-sm text-slate-500 dark:text-slate-400">
                      {note}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>

        {/* 版权栏 */}
        <div className="flex flex-col items-center justify-between gap-2 border-t border-slate-200 py-5 text-xs text-slate-500 dark:border-white/5 dark:text-slate-400 sm:flex-row">
          <p>
            © {year} {site?.title || '壁纸站'} · 保留所有权利
          </p>
          {site?.icp ? (
            <a
              href={site.icpUrl || 'https://beian.miit.gov.cn/'}
              target="_blank"
              rel="noreferrer noopener"
              className="transition hover:text-primary-500"
            >
              {site.icp}
            </a>
          ) : null}
        </div>
      </div>
    </footer>
  )
}
