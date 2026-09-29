import { useEffect, useState } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  ChevronDown,
  ChevronRight,
  FolderTree,
  Home,
  Images as ImagesIcon,
  LayoutDashboard,
  LogOut,
  Menu,
  Palette,
  Settings as SettingsIcon,
  ShieldCheck,
  UploadCloud,
  UserCog,
  Users as UsersIcon,
  X,
} from 'lucide-react'
import { cachedUser, fetchAdminMe, isLoggedIn, logout, userHasPermission } from '../../lib/auth'
import { setUnauthorizedHandler } from '../../lib/api'
import { useToast } from '../Toast'
import Avatar from '../Avatar'
import Spinner from '../Spinner'

/** 后台导航：perm 为空表示只要拥有后台权限即可见；children 为二级子菜单 */
const NAV_ITEMS = [
  { to: '/admin', end: true, label: '仪表盘', icon: LayoutDashboard },
  { to: '/admin/upload', label: '上传壁纸', icon: UploadCloud, perm: 'upload' },
  {
    to: '/admin/images',
    label: '壁纸管理',
    icon: ImagesIcon,
    perm: 'manageImages',
    children: [
      { to: '/admin/images', label: '全部壁纸' },
      { to: '/admin/trash', label: '回收站' },
      { to: '/admin/duplicates', label: '重复壁纸' },
      { to: '/admin/comments', label: '评论管理' },
      { to: '/admin/reports', label: '举报管理' },
    ],
  },
  { to: '/admin/audit', label: '内容审核', icon: ShieldCheck, perm: 'auditImages' },
  {
    to: '/admin/categories',
    label: '分类与标签',
    icon: FolderTree,
    perm: 'manageTaxonomy',
    children: [
      { to: '/admin/categories', label: '分类管理' },
      { to: '/admin/tags', label: '标签管理' },
    ],
  },
  { to: '/admin/users', label: '用户管理', icon: UsersIcon, perm: 'manageUsers' },
  { to: '/admin/roles', label: '用户组权限', icon: UserCog, perm: 'manageRoles' },
  {
    to: '/admin/appearance',
    label: '外观管理',
    icon: Palette,
    perm: 'manageSettings',
    children: [
      { to: '/admin/appearance/banner', label: '首页 Banner' },
      { to: '/admin/appearance/footer', label: '页脚管理' },
      { to: '/admin/appearance/logo', label: '网站图标' },
    ],
  },
  {
    to: '/admin/settings',
    label: '系统设置',
    icon: SettingsIcon,
    perm: 'manageSettings',
    children: [
      { to: '/admin/settings', label: '站点设置' },
      { to: '/admin/storage', label: '存储设置' },
      { to: '/admin/stickers', label: '表情包' },
      { to: '/admin/invite-codes', label: '邀请码管理' },
      { to: '/admin/tasks', label: '维护任务' },
      { to: '/admin/audit-logs', label: '操作日志' },
    ],
  },
]

/** 无权限时的占位提示 */
export function NoPermission() {
  return (
    <div className="admin-card py-20 text-center">
      <p className="font-medium text-slate-600 dark:text-slate-300">没有访问该功能的权限</p>
      <p className="mt-1 text-sm text-slate-400">如需使用，请联系管理员调整你的用户组</p>
    </div>
  )
}

const menuItemClass =
  'flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-600 transition hover:bg-primary-50 hover:text-primary-600 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'

export default function AdminLayout() {
  const toast = useToast()
  const navigate = useNavigate()
  // checking：正在校验 token；ok：已登录；unauthorized：未登录或 token 失效
  const [status, setStatus] = useState(() => (isLoggedIn() ? 'checking' : 'unauthorized'))
  const [me, setMe] = useState(() => cachedUser())
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // 已折叠的二级菜单组，点父级切换展开 / 收起；所有带子菜单的组默认收起
  const [collapsedGroups, setCollapsedGroups] = useState(() =>
    new Set(NAV_ITEMS.filter((i) => i.children?.length).map((i) => i.to)),
  )
  const location = useLocation()

  // 任意后台请求返回 401 时统一跳转登录页
  useEffect(() => {
    setUnauthorizedHandler(() => {
      toast.error('登录状态已失效，请重新登录')
      navigate('/admin/login', { replace: true })
    })
    return () => setUnauthorizedHandler(null)
  }, [navigate, toast])

  useEffect(() => {
    if (!isLoggedIn()) {
      setStatus('unauthorized')
      return undefined
    }
    let cancelled = false
    fetchAdminMe()
      .then((data) => {
        if (cancelled) return
        setMe(data)
        setStatus('ok')
      })
      .catch(() => {
        if (!cancelled) setStatus('unauthorized')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleLogout = () => {
    logout()
    toast.success('已退出登录')
    navigate('/admin/login', { replace: true })
  }

  if (status === 'unauthorized') return <Navigate to="/admin/login" replace />

  if (status === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 text-slate-500">
        <Spinner size={22} />
        正在校验登录状态…
      </div>
    )
  }

  const navItems = NAV_ITEMS.filter((item) => !item.perm || userHasPermission(me, item.perm))
  const username = me?.nickname || me?.username || ''

  const toggleGroup = (to) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(to)) next.delete(to)
      else next.add(to)
      return next
    })

  const sidebar = (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
      {navItems.map((item) => {
        const Icon = item.icon
        const hasChildren = Boolean(item.children?.length)
        const collapsed = collapsedGroups.has(item.to)
        // 有子菜单的组：父级改为折叠开关按钮（不再跳转），子项才是真正的入口
        if (hasChildren) {
          const groupActive =
            location.pathname === item.to ||
            location.pathname.startsWith(`${item.to}/`) ||
            item.children.some((c) => location.pathname === c.to)
          return (
            <div key={item.to}>
              <button
                type="button"
                onClick={() => toggleGroup(item.to)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  groupActive
                    ? 'bg-primary-500 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'
                }`}
              >
                <Icon size={17} />
                {item.label}
                <ChevronDown
                  size={14}
                  className={`ml-auto shrink-0 transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}
                />
              </button>
              {!collapsed ? (
                <div className="mt-1 space-y-0.5 pl-4">
                  {item.children.map((child) => (
                    <NavLink
                      key={child.to}
                      to={child.to}
                      className={({ isActive }) =>
                        `flex items-center gap-1.5 rounded-lg py-1.5 pl-3 pr-2 text-[13px] transition ${
                          isActive
                            ? 'bg-primary-50 font-medium text-primary-600 dark:bg-primary-500/15 dark:text-primary-300'
                            : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                        }`
                      }
                    >
                      <ChevronRight size={13} className="opacity-60" />
                      {child.label}
                    </NavLink>
                  ))}
                </div>
              ) : null}
            </div>
          )
        }
        return (
          <div key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? 'bg-primary-500 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'
                }`
              }
            >
              <Icon size={17} />
              {item.label}
            </NavLink>
          </div>
        )
      })}
    </nav>
  )

  const brand = (
    <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-slate-200 px-4 dark:border-white/10">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary-500 text-sm font-bold text-white">
        W
      </span>
      <span className="font-semibold text-slate-900 dark:text-slate-100">管理后台</span>
    </div>
  )

  return (
    <div className="admin-shell min-h-screen">
      {/* 桌面端侧边栏 */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex dark:border-white/10 dark:bg-ink-900">
        {brand}
        {sidebar}
      </aside>

      {/* 移动端抽屉 */}
      {sidebarOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
          <aside className="animate-fade-in absolute inset-y-0 left-0 flex w-64 flex-col border-r border-slate-200 bg-white dark:border-white/10 dark:bg-ink-900">
            {brand}
            <div className="flex-1 overflow-y-auto" onClick={() => setSidebarOpen(false)}>
              {sidebar}
            </div>
          </aside>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="absolute left-[17rem] top-4 rounded-lg bg-white p-1.5 text-slate-600 shadow"
            aria-label="关闭菜单"
          >
            <X size={18} />
          </button>
        </div>
      ) : null}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur dark:border-white/10 dark:bg-ink-950/80">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10 lg:hidden"
            aria-label="打开菜单"
          >
            <Menu size={18} />
          </button>
          <span className="hidden text-sm text-slate-500 dark:text-slate-400 sm:inline">
            你好，<span className="font-medium text-slate-900 dark:text-slate-100">{username || '管理员'}</span>
          </span>

          {/* 管理员头像：悬停展开二级菜单（返回前台 / 退出登录） */}
          <div className="group relative ml-auto">
            <button
              type="button"
              className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2.5 text-sm font-medium text-slate-700 transition hover:border-primary-300 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:border-primary-500/50"
            >
              <Avatar user={me} size={30} />
              <span className="hidden max-w-[7rem] truncate sm:inline">{username || '管理员'}</span>
              <ChevronDown size={14} className="text-slate-400 transition group-hover:rotate-180" />
            </button>
            {/* pt-2 作为悬停缓冲，避免鼠标穿过空隙时菜单消失 */}
            <div className="invisible absolute right-0 top-full z-50 w-56 pt-2 opacity-0 transition group-hover:visible group-hover:opacity-100">
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-white/10 dark:bg-ink-900">
                <div className="border-b border-slate-100 px-3 pb-2 pt-1 dark:border-white/5">
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{username || '管理员'}</p>
                  <p className="truncate text-xs text-slate-400">@{me?.username || 'admin'}</p>
                </div>
                <Link to="/" className={menuItemClass}>
                  <Home size={15} />
                  返回前台
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className={`${menuItemClass} w-full text-rose-600 hover:bg-rose-50 hover:text-rose-600 dark:text-rose-400 dark:hover:bg-rose-950/40 dark:hover:text-rose-400`}
                >
                  <LogOut size={15} />
                  退出登录
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="p-4 sm:p-6">
          <Outlet context={{ me }} />
        </main>
      </div>
    </div>
  )
}
