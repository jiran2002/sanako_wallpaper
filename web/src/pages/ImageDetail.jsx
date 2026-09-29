import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Expand,
  Flag,
  HardDriveDownload,
  Heart,
  Layers,
  Lock,
  Share2,
  Tag as TagIcon,
} from 'lucide-react'
import { useAuth, useDownloader } from '../App'
import { api } from '../lib/api'
import { useToast } from '../components/Toast'
import WallpaperCard from '../components/WallpaperCard'
import CommentSection from '../components/CommentSection'
import Lightbox from '../components/Lightbox'
import DownloadCaptchaModal from '../components/DownloadCaptchaModal'
import Skeleton from '../components/Skeleton'
import { formatDate, formatNumber, imageSrcSet, orientationText, resolutionText } from '../lib/format'

/** 视频地址判断：只有拿到原图（带真实扩展名）才当可播放视频 */
const VIDEO_URL_RE = /\.(mp4|m4v|webm|ogv|mov|mkv|avi)([?#]|$)/i
const isPlayableVideo = (item) => item?.kind === 'video' && VIDEO_URL_RE.test(item.url || '')

/** 相关推荐的排布跟随所属分类的展示样式，与分类页保持一致 */
const MOBILE_COLUMNS = 'grid-cols-3 gap-4 md:gap-5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6'
const SMALL_COLUMNS = 'grid-cols-4 gap-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8'
const RELATED_LAYOUT = {
  mobile: { ratio: '9 / 16', columns: MOBILE_COLUMNS },
  small: { ratio: '1 / 1', columns: SMALL_COLUMNS },
}

/** 信息面板里的一行「标签 - 值」 */
function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className="shrink-0 text-slate-400">{label}</dt>
      <dd className="min-w-0 truncate text-right text-slate-700 dark:text-slate-200">{children}</dd>
    </div>
  )
}

/**
 * 网盘下载二级菜单：除站内直接下载外，作者可填写其它网盘链接。
 * 点击按钮展开下拉列表，提取码可一键复制。
 * 站点开启「登录后下载」且未登录时，与站内下载一致：不展开列表，直接引导登录。
 */
function MirrorMenu({ mirrors, count, blocked, onBlocked }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  // 未获下载授权时后端只下发数量，这里以数量判断是否有网盘资源
  const total = Number(count) || mirrors?.length || 0

  useEffect(() => {
    if (!open) return undefined
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  if (!total) return null

  const copyCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code)
      toast.success('提取码已复制')
    } catch {
      toast.error('复制失败，请手动复制')
    }
  }

  const handleClick = () => {
    if (blocked) {
      onBlocked?.()
      return
    }
    setOpen((value) => !value)
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={handleClick}
        title={blocked ? '本站已开启登录后下载，登录即可查看网盘链接' : undefined}
        className={`inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
          blocked
            ? 'border border-dashed border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20'
            : 'border border-slate-200 text-slate-600 hover:border-primary-500/50 hover:text-primary-500 dark:border-white/10 dark:text-slate-300 dark:hover:border-primary-500/50 dark:hover:text-primary-400'
        }`}
      >
        {blocked ? <Lock size={16} /> : <HardDriveDownload size={16} />}
        {blocked ? `登录后查看网盘下载（${total}）` : `网盘下载（${total}）`}
        {!blocked ? (
          <ChevronDown size={14} className={`transition ${open ? 'rotate-180' : ''}`} />
        ) : null}
      </button>

      {open && !blocked ? (
        <div className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg shadow-slate-900/10 dark:border-white/10 dark:bg-slate-900">
          {mirrors.map((mirror, index) => (
            <div
              key={`${mirror.url}-${index}`}
              className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 last:border-b-0 dark:border-white/5"
            >
              <a
                href={mirror.url}
                target="_blank"
                rel="noreferrer"
                onClick={() => setOpen(false)}
                className="min-w-0 flex-1 truncate text-sm text-slate-700 transition hover:text-primary-500 dark:text-slate-200"
                title={mirror.url}
              >
                {mirror.name}
              </a>
              {mirror.code ? (
                <button
                  type="button"
                  onClick={() => copyCode(mirror.code)}
                  title="点击复制提取码"
                  className="shrink-0 rounded-md bg-slate-900/[0.05] px-2 py-1 text-[11px] text-slate-500 transition hover:bg-slate-900/10 hover:text-slate-700 dark:bg-white/10 dark:text-slate-300"
                >
                  提取码 {mirror.code}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** 举报原因预设项 */
const REPORT_REASONS = ['违规内容', '侵犯版权', '低俗色情', '虚假或重复', '其他']

/** 举报弹窗：选择原因 + 可选补充说明 */
function ReportModal({ open, onClose, onSubmit, pending }) {
  const [reason, setReason] = useState(REPORT_REASONS[0])
  const [detail, setDetail] = useState('')

  useEffect(() => {
    if (open) {
      setReason(REPORT_REASONS[0])
      setDetail('')
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="关闭举报弹窗"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/50"
      />
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-ink-900">
        <h3 className="text-base font-semibold">举报该壁纸</h3>
        <p className="mt-1 text-xs text-slate-400">请选择举报原因，我们会在审核后处理</p>

        <form onSubmit={(e) => { e.preventDefault(); onSubmit(reason, detail) }} className="mt-4 space-y-3">
          <div className="space-y-1.5">
            {REPORT_REASONS.map((item) => (
              <label
                key={item}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                  reason === item
                    ? 'border-primary-500 bg-primary-50 text-primary-600 dark:border-primary-500/60 dark:bg-primary-500/10 dark:text-primary-300'
                    : 'border-slate-200 text-slate-600 hover:border-primary-300 dark:border-white/10 dark:text-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="report-reason"
                  value={item}
                  checked={reason === item}
                  onChange={() => setReason(item)}
                  className="accent-primary-500"
                />
                {item}
              </label>
            ))}
          </div>

          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="补充说明（选填）"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-primary-500/60 dark:border-white/10 dark:bg-white/5"
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-200 py-2 text-sm text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 rounded-lg bg-rose-500 py-2 text-sm font-medium text-white transition hover:bg-rose-600 disabled:opacity-60"
            >
              {pending ? '提交中…' : '提交举报'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/** 收藏弹窗：选择加入「默认收藏」还是某个自建合集 */
function FavoriteModal({ open, onClose, collections, onPick }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="关闭收藏弹窗"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/50"
      />
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-ink-900">
        <h3 className="text-base font-semibold">收藏到合集</h3>
        <p className="mt-1 text-xs text-slate-400">选择要加入的位置</p>
        <div className="mt-4 space-y-1.5">
          <button
            type="button"
            onClick={() => onPick(0)}
            className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-600 transition hover:border-primary-300 hover:text-primary-500 dark:border-white/10 dark:text-slate-300"
          >
            <span>默认收藏</span>
          </button>
          {collections.map((col) => (
            <button
              key={col.id}
              type="button"
              onClick={() => onPick(col.id)}
              className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-600 transition hover:border-primary-300 hover:text-primary-500 dark:border-white/10 dark:text-slate-300"
            >
              <span className="truncate">{col.name}</span>
              <span className="text-xs text-slate-400">{col.count} 张</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/** 悬浮返回按钮：圆形图标，叠在预览图左上角；无历史时回首页 */
function BackButton({ className = 'absolute left-3 top-3 z-10' }) {
  const navigate = useNavigate()

  const goBack = () => {
    // 有历史记录时回退，否则回首页，避免直接访问详情页时退出站点
    if (window.history.state?.idx > 0) navigate(-1)
    else navigate('/')
  }

  return (
    <button
      type="button"
      onClick={goBack}
      aria-label="返回"
      className={`${className} grid h-9 w-9 place-items-center rounded-full border border-slate-200/80 bg-white/85 text-slate-700 shadow-md backdrop-blur transition hover:bg-white hover:text-primary-500 dark:border-white/10 dark:bg-ink-900/80 dark:text-slate-200 dark:hover:text-primary-400`}
    >
      <ArrowLeft size={18} />
    </button>
  )
}

export default function ImageDetail() {
  const { id } = useParams()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const { download, downloadPack, blocked, captchaOpen, cancelCaptcha, confirmCaptcha } = useDownloader()
  const [image, setImage] = useState(null)
  const [related, setRelated] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [previewIndex, setPreviewIndex] = useState(-1)
  const [activeIndex, setActiveIndex] = useState(0)
  const [favorited, setFavorited] = useState(false)
  const [favPending, setFavPending] = useState(false)
  const [favModalOpen, setFavModalOpen] = useState(false)
  const [collections, setCollections] = useState([])
  const [reportOpen, setReportOpen] = useState(false)
  const [reportPending, setReportPending] = useState(false)

  useEffect(() => {
    let cancelled = false
    // 进入详情页（或切换到相邻壁纸）时回到顶部，否则会沿用列表页的滚动位置导致图片偏上
    window.scrollTo(0, 0)
    setLoading(true)
    setError('')
    setImage(null)
    setRelated([])
    setPreviewIndex(-1)
    setActiveIndex(0)

    api
      .get(`/api/images/${id}`, { auth: true })
      .then((data) => {
        if (cancelled) return
        setImage(data)
        setFavorited(Boolean(data.favorited))
      })
      .catch((err) => {
        if (cancelled) return
        setError(err.message)
        toast.error(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [id, toast])

  // 相关推荐：后端合并「视觉相似（dHash）+ 同分类 / 同色系」的结果
  useEffect(() => {
    if (!image) return undefined
    let cancelled = false

    api
      .get(`/api/images/${image.id}/related`, { query: { limit: 12 } })
      .then((data) => {
        if (cancelled) return
        setRelated((data.items || []).filter((item) => item.id !== image.id))
      })
      .catch((err) => {
        if (!cancelled) toast.error(`相关推荐加载失败：${err.message}`)
      })

    return () => {
      cancelled = true
    }
  }, [image, toast])

  // 图包：在组内左右切换；普通壁纸就只有当前这张
  const packItems = image?.packItems || []
  const hasPack = packItems.length > 1
  const current = hasPack ? packItems[Math.min(activeIndex, packItems.length - 1)] : image
  const currentIsVideo = isPlayableVideo(current)

  // 预览序列：图包按套图顺序排列，大图里左右切换即在套图间切换；其后接相关推荐（去重）
  const gallery = hasPack
    ? [...packItems, ...related.filter((item) => !packItems.some((p) => p.id === item.id))]
    : current
      ? [current, ...related.filter((item) => item.id !== current.id)]
      : []
  // 相关推荐在预览序列里的起始下标：图包排在套图之后，普通壁纸排在当前这张之后
  const relatedOffset = hasPack ? packItems.length : 1

  // 打开大图：图包从当前正在看的那张开始，非图包固定第 0 张
  const openCurrentPreview = () =>
    setPreviewIndex(hasPack ? Math.min(activeIndex, packItems.length - 1) : 0)

  // 相关推荐改用该分类的展示样式；pc（含未分类）沿用原来的瀑布流
  const relatedLayout = RELATED_LAYOUT[image?.category?.displayStyle] || null

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast.success('图片链接已复制到剪贴板')
    } catch {
      toast.error('复制失败，请手动复制地址栏链接')
    }
  }

  // 网盘下载与站内下载同一套限制：站点开启登录后下载且未登录时，引导去登录
  const requestLogin = () => {
    toast.info('本站已开启登录后下载，请先登录')
    navigate('/login', { state: { from: location.pathname } })
  }

  const loadCollections = async () => {
    try {
      const data = await api.get('/api/favorites/collections', { auth: true })
      setCollections(data || [])
    } catch {
      // 合集加载失败不阻塞收藏，仍可收藏到「默认收藏」
      setCollections([])
    }
  }

  const pickCollection = async (collectionId) => {
    if (favPending) return
    setFavPending(true)
    try {
      await api.post(`/api/favorites/${image.id}`, { collectionId }, { auth: true })
      setFavorited(true)
      setFavModalOpen(false)
      toast.success(collectionId ? '已收藏到该合集' : '已加入默认收藏')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setFavPending(false)
    }
  }

  const toggleFavorite = async () => {
    if (!user) {
      toast.info('登录后才能收藏壁纸')
      navigate('/login', { state: { from: location.pathname } })
      return
    }
    if (favPending) return
    // 已收藏：直接取消；未收藏：弹窗选择加入「默认收藏」或某个自建合集
    if (favorited) {
      setFavPending(true)
      try {
        await api.del(`/api/favorites/${image.id}`, { auth: true })
        setFavorited(false)
        toast.success('已取消收藏')
      } catch (err) {
        toast.error(err.message)
      } finally {
        setFavPending(false)
      }
      return
    }
    loadCollections()
    setFavModalOpen(true)
  }

  const openReport = () => {
    if (!user) {
      toast.info('登录后才能举报')
      navigate('/login', { state: { from: location.pathname } })
      return
    }
    setReportOpen(true)
  }

  const submitReport = async (reason, detail) => {
    if (reportPending) return
    setReportPending(true)
    try {
      await api.post(`/api/images/${image.id}/report`, { reason, detail }, { auth: true })
      setReportOpen(false)
      toast.success('举报已提交，感谢反馈')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setReportPending(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <Skeleton className="aspect-video w-full" />
          <div className="space-y-3">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        </div>
      </div>
    )
  }

  if (error || !image) {
    return (
      <div className="space-y-6">
        <BackButton className="relative" />
        <div className="rounded-xl border border-dashed border-slate-300 py-24 text-center dark:border-white/10">
          <p className="text-slate-500">壁纸不存在或已被删除</p>
          <div className="mt-4 flex justify-center gap-2">
            <Link
              to="/"
              className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-600"
            >
              返回首页
            </Link>
            <Link
              to="/wallpapers"
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-primary-500/50 hover:text-primary-500 dark:border-white/10 dark:text-slate-300"
            >
              浏览全部壁纸
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
        {/* 预览区：图包可左右切换；视频用无控件的 <video> 自动播放（不显示暂停/全屏等原生组件）
            lg:self-center：小图（如 300×300）比右侧信息面板矮时垂直居中，避免贴顶、下方留大片空白 */}
        <div className="space-y-3 lg:self-center">
          <div className="group relative mx-auto w-fit max-w-full overflow-hidden rounded-lg">
            <BackButton />
            {currentIsVideo ? (
              <video
                key={current.id}
                src={current.url}
                poster={current.thumbUrl || undefined}
                autoPlay
                muted
                loop
                playsInline
                className="block max-h-[90vh] w-auto max-w-full"
              />
            ) : (
              <button
                type="button"
                onClick={openCurrentPreview}
                className="block cursor-zoom-in"
                title="点击查看大图"
              >
                <img
                  src={current.url}
                  srcSet={imageSrcSet(current)}
                  sizes="(max-width: 1024px) 100vw, 80vw"
                  alt={current.title || '壁纸'}
                  className="block max-h-[90vh] w-auto max-w-full"
                  loading="eager"
                />
              </button>
            )}

            {/* 图包左右切换 */}
            {hasPack ? (
              <>
                <button
                  type="button"
                  onClick={() => setActiveIndex((i) => (i - 1 + packItems.length) % packItems.length)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/45 p-2 text-white backdrop-blur-sm transition hover:bg-black/70"
                  aria-label="上一张"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => setActiveIndex((i) => (i + 1) % packItems.length)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/45 p-2 text-white backdrop-blur-sm transition hover:bg-black/70"
                  aria-label="下一张"
                >
                  <ChevronRight size={18} />
                </button>
                <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-0.5 text-[11px] font-medium tabular-nums text-white backdrop-blur-sm">
                  图包 {activeIndex + 1} / {packItems.length}
                </span>
              </>
            ) : null}

            <div className="absolute right-2 top-2 flex gap-1.5 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
              {!currentIsVideo ? (
                <button
                  type="button"
                  onClick={openCurrentPreview}
                  title="查看大图"
                  className="rounded-md bg-black/55 p-2 text-white backdrop-blur-sm transition hover:bg-black/80"
                >
                  <Expand size={16} />
                </button>
              ) : null}
              <button
                type="button"
                onClick={copyLink}
                title="复制图片链接"
                className="rounded-md bg-black/55 p-2 text-white backdrop-blur-sm transition hover:bg-black/80"
              >
                <Share2 size={16} />
              </button>
            </div>
          </div>

          {/* 图包缩略图：点一下直接切到对应图片 */}
          {hasPack ? (
            <div className="mx-auto flex max-w-full flex-wrap justify-center gap-2">
              {packItems.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  title={item.title || `第 ${index + 1} 张`}
                  className={`h-16 w-16 overflow-hidden rounded-lg border-2 transition ${
                    index === activeIndex
                      ? 'border-primary-500'
                      : 'border-transparent opacity-65 hover:opacity-100'
                  }`}
                >
                  <img
                    src={item.thumbUrl || item.url}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* 信息面板 */}
        <aside className="space-y-5">
          <div>
            <h1 className="text-lg font-semibold leading-snug">{current.title || '未命名壁纸'}</h1>
            {current.description ? (
              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-500 dark:text-slate-400">
                {current.description}
              </p>
            ) : null}
          </div>

          <dl className="divide-y divide-slate-200 border-y border-slate-200 text-sm dark:divide-white/5 dark:border-white/5">
            <Row label="类型">{currentIsVideo ? '视频壁纸' : '图片壁纸'}</Row>
            <Row label="分辨率">{resolutionText(current.width, current.height)}</Row>
            <Row label="文件大小">{current.sizeText || '—'}</Row>
            <Row label="格式">{(current.format || '—').toUpperCase()}</Row>
            <Row label="方向">{orientationText(current.orientation)}</Row>
            {current.width && current.height ? (
              <Row label="像素总量">{((current.width * current.height) / 1_000_000).toFixed(1)} MP</Row>
            ) : null}
            <Row label="浏览次数">{formatNumber(image.views)}</Row>
            <Row label="下载次数">{formatNumber(image.downloads)}</Row>
            <Row label="分类">
              {image.category ? (
                <Link to={`/category/${image.category.slug}`} className="text-primary-500 hover:underline">
                  {image.category.name}
                </Link>
              ) : (
                '未分类'
              )}
            </Row>
            <Row label="上传时间">{formatDate(image.createdAt)}</Row>
          </dl>

          <div className="flex flex-wrap items-center gap-1.5">
            <TagIcon size={14} className="shrink-0 text-slate-400" />
            {image.tags?.length ? (
              image.tags.map((tag) => (
                <Link
                  key={tag.id}
                  to={`/tag/${tag.slug}`}
                  className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-500 transition hover:border-primary-500/50 hover:text-primary-500 dark:border-white/10 dark:text-slate-400 dark:hover:border-primary-500/50 dark:hover:text-primary-400"
                >
                  #{tag.name}
                </Link>
              ))
            ) : (
              <span className="text-xs text-slate-400">暂无标签</span>
            )}
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => download(current)}
              title={
                blocked
                  ? '本站已开启登录后下载，登录即可下载原图'
                  : currentIsVideo
                    ? '下载视频原文件'
                    : '下载原图'
              }
              className={`inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                blocked
                  ? 'border border-dashed border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20'
                  : 'bg-primary-500 text-white hover:bg-primary-600'
              }`}
            >
              {blocked ? <Lock size={16} /> : <Download size={16} />}
              {blocked
                ? `登录后下载${currentIsVideo ? '视频' : '原图'}`
                : currentIsVideo
                  ? `下载视频（${current.sizeText || '原文件'}）`
                  : `下载原图（${current.sizeText || '原图'}）`}
            </button>

            {/* 图包：打包下载组内全部原图 */}
            {hasPack ? (
              <button
                type="button"
                onClick={() => downloadPack(current)}
                title="把图包内全部图片打包成 zip 下载"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-primary-200 bg-primary-50 px-4 py-2.5 text-sm font-medium text-primary-600 transition hover:bg-primary-100 dark:border-primary-500/30 dark:bg-primary-500/10 dark:text-primary-300 dark:hover:bg-primary-500/20"
              >
                <Layers size={16} />
                {blocked ? '登录后下载图包' : `打包下载全部（${packItems.length} 张）`}
              </button>
            ) : null}

            {/* 网盘下载二级菜单 */}
            <MirrorMenu
              mirrors={current.mirrors}
              count={current.mirrorCount}
              blocked={blocked}
              onBlocked={requestLogin}
            />

            <button
              type="button"
              onClick={toggleFavorite}
              disabled={favPending}
              className={`inline-flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition disabled:opacity-60 ${
                favorited
                  ? 'border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300'
                  : 'border-slate-200 text-slate-600 hover:border-primary-500/50 hover:text-primary-500 dark:border-white/10 dark:text-slate-300'
              }`}
            >
              <Heart size={16} className={favorited ? 'fill-current' : ''} />
              {favorited ? '已收藏' : '收藏壁纸'}
            </button>
            <div className={`grid gap-2 ${currentIsVideo ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {!currentIsVideo ? (
                <button
                  type="button"
                  onClick={openCurrentPreview}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 transition hover:border-primary-500/50 hover:text-primary-500 dark:border-white/10 dark:text-slate-300"
                >
                  <Expand size={15} />
                  大图
                </button>
              ) : null}
              <button
                type="button"
                onClick={copyLink}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 transition hover:border-primary-500/50 hover:text-primary-500 dark:border-white/10 dark:text-slate-300"
              >
                <Copy size={15} />
                复制链接
              </button>
            </div>
            <p className="text-center text-[11px] text-slate-400">
              {blocked
                ? `本站已开启登录后下载 · 登录即可免费下载${currentIsVideo ? '视频' : '原图'}`
                : '免费下载 · 无需登录 · 请勿用于商业用途'}
            </p>
            <button
              type="button"
              onClick={openReport}
              className="mx-auto flex w-fit items-center gap-1.5 rounded-full border border-rose-200 px-3.5 py-1.5 text-xs font-medium text-rose-500 transition hover:border-rose-300 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-400 dark:hover:border-rose-500/60 dark:hover:bg-rose-500/10"
            >
              <Flag size={13} />
              举报该壁纸
            </button>
          </div>
        </aside>
      </div>

      {/* 评论区：切换壁纸时用 key 重置，避免残留上一条的输入与回复状态 */}
      <CommentSection key={image.id} imageId={image.id} />

      {/* 相关推荐 */}
      {related.length > 0 ? (
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2 dark:border-white/5">
            <h2 className="text-sm font-medium">相关推荐</h2>
            {image.category ? (
              <Link
                to={`/category/${image.category.slug}`}
                className="inline-flex items-center gap-1 text-xs text-primary-500 transition hover:gap-1.5"
              >
                查看「{image.category.name}」全部
                <ChevronRight size={13} />
              </Link>
            ) : null}
          </div>
          <div
            className={
              relatedLayout
                ? `grid ${relatedLayout.columns}`
                : 'wp-columns columns-2 md:columns-3 lg:columns-4 xl:columns-5'
            }
          >
            {related.map((item, index) => (
              <WallpaperCard
                key={item.id}
                image={item}
                ratio={relatedLayout?.ratio}
                onPreview={() => setPreviewIndex(relatedOffset + index)}
              />
            ))}
          </div>
        </section>
      ) : null}

      <Lightbox
        images={gallery}
        index={previewIndex}
        hideDetailId={image.id}
        onClose={() => setPreviewIndex(-1)}
        onIndexChange={(next) => setPreviewIndex(next)}
      />
      <ReportModal
        open={reportOpen}
        pending={reportPending}
        onClose={() => setReportOpen(false)}
        onSubmit={submitReport}
      />
      <FavoriteModal
        open={favModalOpen}
        collections={collections}
        onClose={() => setFavModalOpen(false)}
        onPick={pickCollection}
      />
      <DownloadCaptchaModal open={captchaOpen} onClose={cancelCaptcha} onSubmit={confirmCaptcha} />
    </div>
  )
}
