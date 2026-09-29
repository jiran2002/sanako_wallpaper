import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Camera,
  ChevronDown,
  Heart,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  Shuffle,
  Sun,
  UploadCloud,
  UserRound,
  X,
} from 'lucide-react'
import { useAuth, useSite } from '../App'
import { api } from '../lib/api'
import { userHasPermission } from '../lib/auth'
import { useToast } from './Toast'
import Avatar from './Avatar'
import Spinner from './Spinner'

const THEME_KEY = 'wp_theme'

function readTheme() {
  const saved = localStorage.getItem(THEME_KEY)
  if (saved === 'dark' || saved === 'light') return saved
  return 'light' // 默认浅色
}

/** 主题 Hook：默认浅色，手动切换后写入 localStorage */
function useTheme() {
  const [theme, setTheme] = useState(readTheme)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const toggle = () => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark'
      localStorage.setItem(THEME_KEY, next)
      return next
    })
  }

  return { theme, toggle }
}

/** 导航项：选中时变主色；min-w-0 允许分类过多时收缩截断，避免溢出裁掉二级菜单 */
const navItemClass = (isActive) =>
  `min-w-0 rounded-lg px-3 py-2 text-sm font-medium transition ${
    isActive
      ? 'text-primary-500'
      : 'text-slate-600 hover:bg-slate-100 hover:text-primary-500 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-primary-400'
  }`

const navLinkClass = ({ isActive }) => `${navItemClass(isActive)} truncate`

const iconBtn =
  'rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-primary-500 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-primary-400'

/** 用户菜单 / 移动端面板里的一项 */
const menuItemClass =
  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'

const searchInputClass =
  'w-full rounded-full border border-slate-200 bg-slate-100 py-2 pl-9 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-primary-400 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:focus:border-primary-500/60 dark:focus:bg-white/10'

const HISTORY_KEY = 'wp_search_history'
const SUGGEST_TYPE_TEXT = { tag: '标签', category: '分类', keyword: '关键词' }

/** 搜索历史：本地保存最近 8 条，读脏时一律当空 */
function readHistory() {
  try {
    const list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
    return Array.isArray(list) ? list.slice(0, 8) : []
  } catch {
    return []
  }
}

const suggestChip =
  'rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-500 transition hover:border-primary-300 hover:text-primary-500 dark:border-white/10 dark:text-slate-400'

/**
 * 搜索框：带联想下拉（无输入时展示搜索历史 + 后台热词，有输入时展示标签/分类/标题建议）。
 * 桌面顶栏与移动端面板共用，由 className 控制宽度。
 */
function SearchBox({ className = '', panelWidth = 'w-72' }) {
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState('')
  const [open, setOpen] = useState(false)
  const [data, setData] = useState({ hot: [], items: [] })
  const [history, setHistory] = useState(readHistory)
  const boxRef = useRef(null)
  const timerRef = useRef(null)

  // 点击外部关闭下拉
  useEffect(() => {
    const onDocClick = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  const fetchSuggest = async (q) => {
    try {
      const res = await api.get('/api/search/suggest', { query: { q } })
      setData({ hot: res?.hot || [], items: res?.items || [] })
    } catch {
      // 联想失败不打断搜索
    }
  }

  const handleChange = (e) => {
    const value = e.target.value
    setKeyword(value)
    setOpen(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => fetchSuggest(value.trim()), 200)
  }

  /** 跳转并记录历史（热词/建议词不等同于用户主动搜索，故只在确认搜索时记录） */
  const go = (path, recordWord) => {
    if (recordWord) {
      const next = [recordWord, ...history.filter((w) => w !== recordWord)].slice(0, 8)
      setHistory(next)
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
    }
    setOpen(false)
    navigate(path)
  }

  const submit = (e) => {
    e.preventDefault()
    const q = keyword.trim()
    go(q ? `/wallpapers?q=${encodeURIComponent(q)}` : '/wallpapers', q)
  }

  const clearHistory = () => {
    setHistory([])
    localStorage.removeItem(HISTORY_KEY)
  }

  const itemPath = (item) => {
    if (item.type === 'category') return `/category/${item.value}`
    if (item.type === 'tag') return `/wallpapers?tag=${encodeURIComponent(item.value)}`
    return `/wallpapers?q=${encodeURIComponent(item.value)}`
  }

  return (
    <form onSubmit={submit} className={className}>
      <div className="relative" ref={boxRef}>
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={keyword}
          onChange={handleChange}
          onFocus={() => {
            setOpen(true)
            fetchSuggest(keyword.trim())
          }}
          placeholder="搜索壁纸…"
          className={searchInputClass}
        />

        {open ? (
          <div
            className={`absolute right-0 top-full z-40 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-xl dark:border-white/10 dark:bg-ink-900 ${panelWidth}`}
          >
            {keyword.trim() ? (
              <div className="max-h-72 overflow-y-auto p-1">
                {data.items.map((item) => (
                  <button
                    key={`${item.type}-${item.value}`}
                    type="button"
                    onClick={() => go(itemPath(item), item.type === 'keyword' ? item.value : '')}
                    className={menuItemClass}
                  >
                    <span className="truncate">{item.label}</span>
                    <span className="ml-auto shrink-0 text-[11px] text-slate-400">
                      {SUGGEST_TYPE_TEXT[item.type] || ''}
                    </span>
                  </button>
                ))}
                {data.items.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-slate-400">按回车搜索「{keyword.trim()}」</p>
                ) : null}
              </div>
            ) : (
              <div className="p-2">
                {history.length > 0 ? (
                  <div className="border-b border-slate-100 pb-2 dark:border-white/5">
                    <div className="flex items-center justify-between px-1 pb-1.5">
                      <span className="text-[11px] text-slate-400">搜索历史</span>
                      <button
                        type="button"
                        onClick={clearHistory}
                        className="text-[11px] text-slate-400 transition hover:text-primary-500"
                      >
                        清空
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 px-1">
                      {history.map((word) => (
                        <button
                          key={word}
                          type="button"
                          onClick={() => go(`/wallpapers?q=${encodeURIComponent(word)}`, word)}
                          className={suggestChip}
                        >
                          {word}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {data.hot.length > 0 ? (
                  <div className="px-1 pt-2">
                    <span className="text-[11px] text-slate-400">热门搜索</span>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {data.hot.map((word) => (
                        <button
                          key={word}
                          type="button"
                          onClick={() => go(`/wallpapers?q=${encodeURIComponent(word)}`, word)}
                          className={suggestChip}
                        >
                          {word}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </form>
  )
}

export default function Navbar() {
  const { site, categories } = useSite()
  const { user, loading: authLoading, signOut } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const { theme, toggle } = useTheme()
  // 编辑 / 版主这类内容角色可进入创作者中心
  const canCreate = userHasPermission(user, ['auditImages', 'manageImages'])
  // 后台管理入口仅管理员可见（编辑 / 版主走创作者中心）
  const isAdmin = user?.role === 'admin'

  const [mobileOpen, setMobileOpen] = useState(false)
  const [randomLoading, setRandomLoading] = useState(false)
  /**
   * 悬停展开的二级菜单（一级分类 / 用户菜单）。
   * 用「延迟关闭」而不是纯 CSS :hover：鼠标从一级菜单移到二级菜单的途中
   * 只要离开一瞬间就会让 :hover 失效，菜单会立刻消失导致点不到。
   */
  const [openMenu, setOpenMenu] = useState(null)
  const closeTimer = useRef(null)

  const openHoverMenu = (key) => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setOpenMenu(key)
  }
  const scheduleCloseMenu = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setOpenMenu(null), 180)
  }
  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current)
    },
    [],
  )

  // 顶部栏只平铺「置顶到顶部栏」的一级分类，二级分类收进悬停下拉
  const childrenOf = (parentId) => categories.filter((c) => c.parentId === parentId)
  const navCategories = categories.filter((c) => !c.parentId && c.showInNav)
  const isCategoryActive = (category) =>
    location.pathname === `/category/${category.slug}` ||
    childrenOf(category.id).some((c) => location.pathname === `/category/${c.slug}`)

  // 路由变化时收起移动端菜单与悬停下拉
  useEffect(() => {
    setMobileOpen(false)
    setOpenMenu(null)
  }, [location.pathname, location.search])

  const handleSignOut = () => {
    signOut()
    toast.success('已退出登录')
    navigate('/')
  }

  const openRandom = async () => {
    if (randomLoading) return
    setRandomLoading(true)
    try {
      const list = await api.get('/api/images/random', { query: { count: 1 } })
      const image = Array.isArray(list) ? list[0] : null
      if (!image) {
        toast.info('还没有可浏览的壁纸')
        return
      }
      navigate(`/image/${image.id}`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setRandomLoading(false)
    }
  }

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/80 backdrop-blur-md dark:border-white/5 dark:bg-ink-950/80">
      <div className="relative mx-auto flex h-16 max-w-[1536px] items-center justify-between gap-3 px-4">
        {/* 左：Logo */}
        <Link to="/" className="flex shrink-0 items-center gap-2">
          {site?.appearance?.logo ? (
            <img
              src={site.appearance.logo}
              alt={site?.title || '壁纸站'}
              className="h-8 w-auto object-contain"
            />
          ) : null}
          <span className="hidden text-lg font-semibold tracking-tight sm:inline">
            {site?.title || '壁纸站'}
          </span>
        </Link>

        {/* 中：分类横向菜单（一级分类平铺，带二级分类的悬停 / 点击展开下拉）
            放入 flex 流内并 min-w-0：分类过多时在可用空间内收缩截断，不再绝对居中溢出、盖住右侧搜索框；
            仍不使用 overflow 裁切，二级面板需向下溢出导航盒子才能展开 */}
        <nav className="hidden h-full min-w-0 flex-1 items-center justify-center gap-0.5 lg:flex">
          <NavLink to="/" end className={navLinkClass}>
            首页
          </NavLink>
          <NavLink to="/wallpapers" className={navLinkClass}>
            全部壁纸
          </NavLink>
          {navCategories.map((category) => {
            const children = childrenOf(category.id)
            if (children.length === 0) {
              return (
                <NavLink key={category.id} to={`/category/${category.slug}`} className={navLinkClass}>
                  {category.name}
                </NavLink>
              )
            }
            const menuKey = `category-${category.id}`
            const menuOpen = openMenu === menuKey
            return (
              <div
                key={category.id}
                className="relative flex h-full min-w-0 items-center"
                onMouseEnter={() => openHoverMenu(menuKey)}
                onMouseLeave={scheduleCloseMenu}
              >
                {/* 一级分类点击展开二级菜单（不再直接跳转），其分类页入口放在面板首行 */}
                <button
                  type="button"
                  onClick={() => openHoverMenu(menuKey)}
                  aria-expanded={menuOpen}
                  className={`${navItemClass(isCategoryActive(category))} inline-flex items-center gap-1`}
                >
                  <span className="min-w-0 truncate">{category.name}</span>
                  <ChevronDown size={13} className={`shrink-0 transition ${menuOpen ? 'rotate-180' : ''}`} />
                </button>
                {/* pt-2 作为悬停缓冲：填满触发区与面板之间的空隙，避免鼠标下移时菜单消失 */}
                <div
                  className={`absolute left-1/2 top-full z-40 w-44 -translate-x-1/2 pt-2 transition ${
                    menuOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
                  }`}
                >
                  <div className="rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-white/10 dark:bg-ink-900">
                    <Link to={`/category/${category.slug}`} className={menuItemClass}>
                      <span className="truncate">查看全部</span>
                      <span className="ml-auto shrink-0 text-xs text-slate-400">{category.count ?? 0}</span>
                    </Link>
                    {children.map((child) => (
                      <Link key={child.id} to={`/category/${child.slug}`} className={menuItemClass}>
                        <span className="truncate">{child.name}</span>
                        <span className="ml-auto shrink-0 text-xs text-slate-400">{child.count ?? 0}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </nav>

        {/* 右：搜索与操作 */}
        <div className="flex shrink-0 items-center gap-0.5">
          <SearchBox className="mr-1 hidden w-[clamp(140px,16vw,240px)] lg:block" />

          <button
            type="button"
            onClick={openRandom}
            disabled={randomLoading}
            title="随机壁纸"
            className={`${iconBtn} disabled:opacity-60`}
          >
            {randomLoading ? <Spinner size={16} /> : <Shuffle size={17} />}
          </button>

          <Link to="/image-search" title="以图搜图" className={iconBtn}>
            <Camera size={17} />
          </Link>

          <button
            type="button"
            onClick={toggle}
            title={theme === 'dark' ? '切换为浅色' : '切换为深色'}
            className={iconBtn}
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>

          {isAdmin ? (
            <Link
              to="/admin"
              title="后台管理"
              className={`${iconBtn} hidden sm:inline-flex`}
            >
              <LayoutDashboard size={17} />
            </Link>
          ) : null}

          {authLoading ? (
            <span className="hidden p-2 sm:inline-flex">
              <Spinner size={16} />
            </span>
          ) : user ? (
            <div
              className="relative hidden sm:block"
              onMouseEnter={() => openHoverMenu('user')}
              onMouseLeave={scheduleCloseMenu}
            >
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg py-1 pl-1 pr-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
              >
                <Avatar user={user} size={28} />
                <span className="hidden max-w-[6rem] truncate lg:inline">{user.nickname || user.username}</span>
                <ChevronDown size={14} className={`transition ${openMenu === 'user' ? 'rotate-180' : ''}`} />
              </button>
              <div
                className={`absolute right-0 top-full z-40 w-48 pt-2 transition ${
                  openMenu === 'user' ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
                }`}
              >
                <div className="rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-white/10 dark:bg-ink-900">
                <div className="border-b border-slate-100 px-3 pb-2 pt-1 dark:border-white/5">
                  <p className="truncate text-sm font-medium">{user.nickname || user.username}</p>
                  <p className="truncate text-xs text-slate-400">@{user.username}</p>
                </div>
                <Link to={`/user/${user.id}`} className={menuItemClass}>
                  <UserRound size={15} />
                  个人主页
                </Link>
                <Link to="/favorites" className={menuItemClass}>
                  <Heart size={15} />
                  我的收藏
                </Link>
                <Link to="/upload" className={menuItemClass}>
                  <UploadCloud size={15} />
                  上传壁纸
                </Link>
                <Link to="/settings" className={menuItemClass}>
                  <Settings size={15} />
                  个人设置
                </Link>
                {canCreate ? (
                  <Link to="/creator" className={menuItemClass}>
                    <Layers size={15} />
                    创作者中心
                  </Link>
                ) : null}
                {isAdmin ? (
                  <Link to="/admin" className={menuItemClass}>
                    <LayoutDashboard size={15} />
                    管理后台
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={handleSignOut}
                  className={`${menuItemClass} w-full text-rose-600 hover:bg-rose-50 hover:text-rose-600 dark:text-rose-400 dark:hover:bg-rose-950/40 dark:hover:text-rose-400`}
                >
                  <LogOut size={15} />
                  退出登录
                </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="hidden items-center gap-1.5 sm:flex">
              <Link
                to="/login"
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:text-primary-500 dark:text-slate-300 dark:hover:text-primary-400"
              >
                登录
              </Link>
              <Link
                to="/register"
                className="rounded-full bg-primary-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-600"
              >
                注册
              </Link>
            </div>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className={`${iconBtn} lg:hidden`}
            aria-label="菜单"
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* 移动端 / 平板展开面板 */}
      {mobileOpen ? (
        <div className="animate-fade-in border-t border-slate-200 bg-white px-4 py-3 dark:border-white/5 dark:bg-ink-900 lg:hidden">
          <SearchBox className="mb-3 lg:hidden" panelWidth="w-full" />

          <div className="flex flex-wrap gap-1.5">
            <NavLink to="/" end className={navLinkClass}>
              首页
            </NavLink>
            <NavLink to="/wallpapers" className={navLinkClass}>
              全部壁纸
            </NavLink>
            <NavLink to="/image-search" className={navLinkClass}>
              以图搜图
            </NavLink>
            <button
              type="button"
              onClick={openRandom}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-primary-500 dark:text-slate-300 dark:hover:bg-white/10"
            >
              随机壁纸
            </button>
          </div>

          {navCategories.length > 0 ? (
            <div className="mt-3 border-t border-slate-200 pt-3 dark:border-white/5">
              <p className="mb-2 text-xs text-slate-400">分类</p>
              <div className="space-y-2">
                {navCategories.map((category) => {
                  const children = childrenOf(category.id)
                  return (
                    <div key={category.id} className="flex flex-wrap items-center gap-1.5">
                      <Link
                        to={`/category/${category.slug}`}
                        className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-primary-50 hover:text-primary-500 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
                      >
                        {category.name}
                        <span className="ml-1 font-normal text-slate-400">{category.count ?? 0}</span>
                      </Link>
                      {children.map((child) => (
                        <Link
                          key={child.id}
                          to={`/category/${child.slug}`}
                          className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 transition hover:border-primary-300 hover:text-primary-500 dark:border-white/10 dark:text-slate-400"
                        >
                          {child.name}
                          <span className="ml-1 text-slate-400">{child.count ?? 0}</span>
                        </Link>
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          {user ? (
            <div className="mt-3 border-t border-slate-200 pt-3 dark:border-white/5">
              <div className="mb-2.5 flex items-center gap-2.5">
                <Avatar user={user} size={36} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{user.nickname || user.username}</p>
                  <p className="truncate text-xs text-slate-400">@{user.username}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <Link to={`/user/${user.id}`} className={menuItemClass}>
                  <UserRound size={15} />
                  个人主页
                </Link>
                <Link to="/favorites" className={menuItemClass}>
                  <Heart size={15} />
                  我的收藏
                </Link>
                <Link to="/upload" className={menuItemClass}>
                  <UploadCloud size={15} />
                  上传壁纸
                </Link>
                <Link to="/settings" className={menuItemClass}>
                  <Settings size={15} />
                  个人设置
                </Link>
                {canCreate ? (
                  <Link to="/creator" className={menuItemClass}>
                    <Layers size={15} />
                    创作者中心
                  </Link>
                ) : null}
                {isAdmin ? (
                  <Link to="/admin" className={menuItemClass}>
                    <LayoutDashboard size={15} />
                    管理后台
                  </Link>
                ) : null}
                <button type="button" onClick={handleSignOut} className={`${menuItemClass} text-rose-600 dark:text-rose-400`}>
                  <LogOut size={15} />
                  退出登录
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex gap-2 border-t border-slate-200 pt-3 dark:border-white/5">
              <Link
                to="/login"
                className="flex-1 rounded-lg border border-slate-200 py-2 text-center text-sm font-medium text-slate-600 transition hover:border-primary-300 hover:text-primary-500 dark:border-white/10 dark:text-slate-300"
              >
                登录
              </Link>
              <Link
                to="/register"
                className="flex-1 rounded-lg bg-primary-500 py-2 text-center text-sm font-medium text-white transition hover:bg-primary-600"
              >
                注册
              </Link>
            </div>
          )}
        </div>
      ) : null}
    </header>
  )
}
