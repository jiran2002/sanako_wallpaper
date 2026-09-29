import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import { useToast } from './components/Toast'
import Spinner from './components/Spinner'
import { api, getToken } from './lib/api'
import { cachedUser, fetchMe, logout, userHasPermission } from './lib/auth'
import Home from './pages/Home'
import Wallpapers from './pages/Wallpapers'
import CategoryPage from './pages/CategoryPage'
import TagPage from './pages/TagPage'
import ImageDetail from './pages/ImageDetail'
import ImageSearch from './pages/ImageSearch'
import NotFound from './pages/NotFound'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import UserProfile from './pages/UserProfile'
import AccountSettings from './pages/AccountSettings'
import Favorites from './pages/Favorites'
import UploadPage from './pages/Upload'
import Creator from './pages/Creator'
import AdminLayout, { NoPermission } from './components/admin/AdminLayout'
import AdminLogin from './pages/admin/Login'
import Dashboard from './pages/admin/Dashboard'
import Upload from './pages/admin/Upload'
import Images from './pages/admin/Images'
import Trash from './pages/admin/Trash'
import Duplicates from './pages/admin/Duplicates'
import Audit from './pages/admin/Audit'
import Comments from './pages/admin/Comments'
import Reports from './pages/admin/Reports'
import Categories from './pages/admin/Categories'
import Tags from './pages/admin/Tags'
import Users from './pages/admin/Users'
import Roles from './pages/admin/Roles'
import { AppearanceBanner, AppearanceFooter, AppearanceLogo } from './pages/admin/Appearance'
import Storage from './pages/admin/Storage'
import Settings from './pages/admin/Settings'
import Stickers from './pages/admin/Stickers'
import Tasks from './pages/admin/Tasks'
import AuditLogs from './pages/admin/AuditLogs'
import InviteCodes from './pages/admin/InviteCodes'
import DownloadCaptchaModal from './components/DownloadCaptchaModal'

const SiteContext = createContext({ site: null, categories: [], tags: [], loading: true })

/** 全站共享的站点设置 / 分类 / 标签（导航栏、页脚、各页面共用） */
export function useSite() {
  return useContext(SiteContext)
}

function SiteProvider({ children }) {
  const toast = useToast()
  const [site, setSite] = useState(null)
  const [categories, setCategories] = useState([])
  const [tags, setTags] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    Promise.all([api.get('/api/site'), api.get('/api/categories'), api.get('/api/tags')])
      .then(([siteData, categoryData, tagData]) => {
        if (cancelled) return
        setSite(siteData)
        setCategories(Array.isArray(categoryData) ? categoryData : [])
        setTags(Array.isArray(tagData) ? tagData : [])
        if (siteData?.title) document.title = siteData.title
      })
      .catch((err) => {
        if (!cancelled) toast.error(`站点信息加载失败：${err.message}`)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [toast])

  return <SiteContext.Provider value={{ site, categories, tags, loading }}>{children}</SiteContext.Provider>
}

const AuthContext = createContext({
  user: null,
  loading: false,
  setUser: () => {},
  refresh: async () => null,
  signOut: () => {},
})

/** 全站登录态：首屏用本地缓存兜底，再用 /api/auth/me 校验一次 */
export function useAuth() {
  return useContext(AuthContext)
}

function AuthProvider({ children }) {
  const [user, setUser] = useState(() => (getToken() ? cachedUser() : null))
  const [loading, setLoading] = useState(() => Boolean(getToken()))

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null)
      setLoading(false)
      return null
    }
    setLoading(true)
    try {
      const me = await fetchMe()
      setUser(me)
      return me
    } catch {
      setUser(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const signOut = useCallback(() => {
    logout()
    setUser(null)
  }, [])

  const value = useMemo(() => ({ user, loading, setUser, refresh, signOut }), [user, loading, refresh, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** 从 Content-Disposition 里取出文件名（优先 RFC 5987 的 filename*） */
function filenameFromDisposition(header) {
  if (!header) return ''
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header)
  if (star) {
    try {
      return decodeURIComponent(star[1].trim())
    } catch {
      /* 编码异常时退回普通 filename */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header)
  return plain ? plain[1].trim() : ''
}

/**
 * 下载原图。
 * 站点开启「登录后下载」时，该设置优先级高于用户组的游客下载权限：
 * 未登录游客一律引导登录，只有登录用户才会真正发起下载。
 * 下载必须带上 Authorization 头，因此用 fetch 取回二进制流后再触发保存。
 */
export function useDownloader() {
  const { site } = useSite()
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()

  const requireLogin = Boolean(site?.requireLoginDownload)
  const blocked = requireLogin && !user
  // 游客下载是否需要先过图形验证码（仅「未开启登录后下载」+「强制验证码」时生效）
  const needCaptcha = Boolean(site?.downloadCaptcha) && !user && !requireLogin
  const [captchaPending, setCaptchaPending] = useState(null) // { url, name }

  /**
   * 带鉴权取回二进制流并触发保存。
   * 因下载接口都需要 Authorization 头，不能用 <a href> 直接跳转。
   */
  const fetchAndSave = useCallback(
    async (url, fallbackName) => {
      if (requireLogin && !user) {
        toast.info('本站已开启登录后下载，请先登录')
        navigate('/login', { state: { from: location.pathname } })
        return
      }
      const token = getToken()
      let res
      try {
        res = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
      } catch {
        toast.error('下载失败：网络错误，请稍后重试')
        return
      }
      if (!res.ok) {
        let message = `下载失败（HTTP ${res.status}）`
        try {
          const data = await res.json()
          if (data?.error) message = data.error
        } catch {
          /* 非 JSON 响应，保留默认提示 */
        }
        if (res.status === 401) {
          toast.info(message)
          navigate('/login', { state: { from: location.pathname } })
          return
        }
        toast.error(message)
        return
      }
      const blob = await res.blob()
      const filename = filenameFromDisposition(res.headers.get('content-disposition')) || fallbackName
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(objectUrl)
    },
    [requireLogin, user, navigate, location.pathname, toast],
  )

  /** 游客需要验证码时先弹窗，验证通过后带参重试；否则直接下载 */
  const requestDownload = useCallback(
    (url, name) => {
      if (needCaptcha) {
        setCaptchaPending({ url, name })
        return
      }
      return fetchAndSave(url, name)
    },
    [needCaptcha, fetchAndSave],
  )

  const confirmCaptcha = useCallback(
    async (captchaId, code) => {
      if (!captchaPending) return
      const { url, name } = captchaPending
      setCaptchaPending(null)
      const sep = url.includes('?') ? '&' : '?'
      await fetchAndSave(
        `${url}${sep}captchaId=${encodeURIComponent(captchaId)}&captchaCode=${encodeURIComponent(code)}`,
        name,
      )
    },
    [captchaPending, fetchAndSave],
  )

  const cancelCaptcha = useCallback(() => setCaptchaPending(null), [])

  const download = useCallback(
    (image) => {
      const id = image?.id ?? image
      if (!id) return undefined
      return requestDownload(`/api/images/${id}/download`, `wallpaper-${id}`)
    },
    [requestDownload],
  )

  /** 图包：服务端把组内全部原图打包成 zip */
  const downloadPack = useCallback(
    (image) => {
      const id = image?.id ?? image
      if (!id) return undefined
      const name = String(image?.title || '').trim() || 'wallpaper-pack'
      return requestDownload(`/api/packs/${id}/download`, `${name}.zip`)
    },
    [requestDownload],
  )

  return {
    download,
    downloadPack,
    requireLogin,
    blocked,
    captchaOpen: Boolean(captchaPending),
    cancelCaptcha,
    confirmCaptcha,
  }
}

/** 需要登录才能访问的页面 */
function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-slate-500">
        <Spinner size={20} />
        正在校验登录状态…
      </div>
    )
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return children
}

/** 创作者中心：需要登录，且具备「审核壁纸」或「管理壁纸」权限 */
function RequireCreator({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-slate-500">
        <Spinner size={20} />
        正在校验登录状态…
      </div>
    )
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  if (!userHasPermission(user, ['auditImages', 'manageImages'])) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 py-24 text-center dark:border-white/10">
        <p className="text-slate-500">当前账号没有创作者中心权限</p>
        <p className="mt-1 text-xs text-slate-400">需要「审核壁纸」或「管理壁纸」权限，请联系管理员开通</p>
      </div>
    )
  }
  return children
}

function PublicLayout() {
  const { pathname } = useLocation()
  // 首页 Banner 需要满屏宽，因此首页不套内容容器，由首页自己给下方内容加容器
  const flush = pathname === '/'

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className={flush ? 'flex-1' : 'mx-auto w-full max-w-[1536px] flex-1 px-4 py-6'}>
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}

/** 后台页面权限守卫：不具备所需权限时显示占位提示（权限由 AdminLayout 通过 Outlet context 下发） */
function RequirePermission({ permission, children }) {
  const ctx = useOutletContext()
  if (!userHasPermission(ctx?.me, permission)) return <NoPermission />
  return children
}

export default function App() {
  return (
    <SiteProvider>
      <AuthProvider>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/wallpapers" element={<Wallpapers />} />
            <Route path="/category/:slug" element={<CategoryPage />} />
            <Route path="/tag/:slug" element={<TagPage />} />
            <Route path="/image/:id" element={<ImageDetail />} />
            <Route path="/image-search" element={<ImageSearch />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/user/:id" element={<UserProfile />} />
            <Route
              path="/settings"
              element={
                <RequireAuth>
                  <AccountSettings />
                </RequireAuth>
              }
            />
            <Route
              path="/favorites"
              element={
                <RequireAuth>
                  <Favorites />
                </RequireAuth>
              }
            />
            <Route
              path="/upload"
              element={
                <RequireAuth>
                  <UploadPage />
                </RequireAuth>
              }
            />
            <Route
              path="/creator"
              element={
                <RequireCreator>
                  <Creator />
                </RequireCreator>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Route>

          <Route path="/admin/login" element={<AdminLogin />} />

          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Dashboard />} />
            <Route
              path="upload"
              element={
                <RequirePermission permission="upload">
                  <Upload />
                </RequirePermission>
              }
            />
            <Route
              path="images"
              element={
                <RequirePermission permission="manageImages">
                  <Images />
                </RequirePermission>
              }
            />
            <Route
              path="trash"
              element={
                <RequirePermission permission="manageImages">
                  <Trash />
                </RequirePermission>
              }
            />
            <Route
              path="duplicates"
              element={
                <RequirePermission permission="manageImages">
                  <Duplicates />
                </RequirePermission>
              }
            />
            <Route
              path="audit"
              element={
                <RequirePermission permission="auditImages">
                  <Audit />
                </RequirePermission>
              }
            />
            <Route
              path="comments"
              element={
                <RequirePermission permission="manageImages">
                  <Comments />
                </RequirePermission>
              }
            />
            <Route
              path="reports"
              element={
                <RequirePermission permission="manageImages">
                  <Reports />
                </RequirePermission>
              }
            />
            <Route
              path="categories"
              element={
                <RequirePermission permission="manageTaxonomy">
                  <Categories />
                </RequirePermission>
              }
            />
            <Route
              path="tags"
              element={
                <RequirePermission permission="manageTaxonomy">
                  <Tags />
                </RequirePermission>
              }
            />
            <Route
              path="users"
              element={
                <RequirePermission permission="manageUsers">
                  <Users />
                </RequirePermission>
              }
            />
            <Route
              path="roles"
              element={
                <RequirePermission permission="manageRoles">
                  <Roles />
                </RequirePermission>
              }
            />
            <Route
              path="appearance"
              element={
                <RequirePermission permission="manageSettings">
                  <Navigate to="/admin/appearance/banner" replace />
                </RequirePermission>
              }
            />
            <Route
              path="appearance/banner"
              element={
                <RequirePermission permission="manageSettings">
                  <AppearanceBanner />
                </RequirePermission>
              }
            />
            <Route
              path="appearance/footer"
              element={
                <RequirePermission permission="manageSettings">
                  <AppearanceFooter />
                </RequirePermission>
              }
            />
            <Route
              path="appearance/logo"
              element={
                <RequirePermission permission="manageSettings">
                  <AppearanceLogo />
                </RequirePermission>
              }
            />
            <Route
              path="storage"
              element={
                <RequirePermission permission="manageSettings">
                  <Storage />
                </RequirePermission>
              }
            />
            <Route
              path="stickers"
              element={
                <RequirePermission permission="manageSettings">
                  <Stickers />
                </RequirePermission>
              }
            />
            <Route
              path="settings"
              element={
                <RequirePermission permission="manageSettings">
                  <Settings />
                </RequirePermission>
              }
            />
            <Route
              path="tasks"
              element={
                <RequirePermission permission="manageSettings">
                  <Tasks />
                </RequirePermission>
              }
            />
            <Route
              path="audit-logs"
              element={
                <RequirePermission permission="manageSettings">
                  <AuditLogs />
                </RequirePermission>
              }
            />
            <Route
              path="invite-codes"
              element={
                <RequirePermission permission="manageSettings">
                  <InviteCodes />
                </RequirePermission>
              }
            />
          </Route>
        </Routes>
      </AuthProvider>
    </SiteProvider>
  )
}
