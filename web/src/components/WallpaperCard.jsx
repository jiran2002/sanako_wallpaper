import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Expand } from 'lucide-react'
import { useDownloader } from '../App'
import { imageSrcSet } from '../lib/format'
import DownloadCaptchaModal from './DownloadCaptchaModal'

const iconButton = 'rounded-md bg-black/55 p-1.5 text-white backdrop-blur-sm transition hover:bg-black/80'

/** 与详情页口径一致：只有拿到真实视频文件地址时才当可播放视频（未授权时 url 是静态封面） */
const VIDEO_URL_RE = /\.(mp4|m4v|webm|ogv|mov|mkv|avi)([?#]|$)/i

/**
 * 图库卡片
 * - 默认用 width/height 计算 aspect-ratio，避免图片加载完成前布局跳动
 * - 传入 ratio 时改用统一比例（横竖图都以 object-cover 裁切为同样尺寸）
 * - 底部浮层（标题 + 「详情」）默认隐藏，鼠标悬停/聚焦时淡入
 * - 视频壁纸直接用 <video> 自动播放，封面即动态画面（静态封面仅作为加载前的海报）
 */
export default function WallpaperCard({ image, onPreview, ratio = null, actions = null }) {
  const [loaded, setLoaded] = useState(false)
  const videoRef = useRef(null)
  const { download, blocked, captchaOpen, cancelCaptcha, confirmCaptcha } = useDownloader()
  const imageRatio = image.width && image.height ? `${image.width} / ${image.height}` : '3 / 2'
  // 统一比例模式下由外层 grid 的 gap 控制间距，卡片不再自带下边距
  const uniform = Boolean(ratio)
  const detailPath = `/image/${image.id}`
  const isVideo = image.kind === 'video' && VIDEO_URL_RE.test(image.url || '')

  // 一屏可能有几十个视频，只让进入视口的播放、离开的暂停，避免同时解码拖慢页面。
  // 不用原生 autoPlay 属性：它会在数据就绪前抢跑，与 observer 的暂停互相打架；统一由这里控制。
  useEffect(() => {
    const el = videoRef.current
    if (!el || !isVideo) return undefined

    // 首次 play() 可能因数据未就绪被拒绝，稍后补一次
    const tryPlay = () => {
      const p = el.play?.()
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          window.setTimeout(() => el.play?.().catch(() => {}), 500)
        })
      }
    }

    if (typeof IntersectionObserver === 'undefined') {
      tryPlay()
      return undefined
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) tryPlay()
          else el.pause?.()
        }
      },
      { rootMargin: '150px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [isVideo])

  return (
    <>
    <div
      className={`group relative break-inside-avoid overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200/70 transition-shadow duration-300 hover:shadow-lg dark:bg-ink-850 dark:ring-white/5 ${
        uniform ? '' : 'mb-4 md:mb-6'
      }`}
    >
      <Link
        to={detailPath}
        className="relative block w-full"
        style={{ aspectRatio: ratio || imageRatio }}
        aria-label={image.title || '查看壁纸详情'}
      >
        {!loaded ? <div className="wp-shimmer absolute inset-0 bg-slate-200 dark:bg-ink-850" /> : null}
        {isVideo ? (
          <video
            ref={videoRef}
            src={image.url}
            poster={image.thumbUrl || undefined}
            muted
            loop
            playsInline
            preload="metadata"
            onLoadedData={() => setLoaded(true)}
            onError={() => setLoaded(true)}
            className={`absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.04] ${
              loaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        ) : (
          <img
            src={image.thumbUrl || image.url}
            srcSet={imageSrcSet(image)}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            alt={image.title || '壁纸'}
            loading="lazy"
            decoding="async"
            onLoad={() => setLoaded(true)}
            onError={() => setLoaded(true)}
            className={`absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.04] ${
              loaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}

        {/* 底部浮层：默认隐藏，悬停 / 聚焦时淡入 */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-3 pb-2.5 pt-8 opacity-0 transition duration-300 group-hover:opacity-100 group-focus-within:opacity-100">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-medium text-white">{image.title || '未命名壁纸'}</p>
            <span className="inline-flex shrink-0 items-center rounded-full bg-white/25 px-2.5 py-1 text-[11px] text-white backdrop-blur-sm transition group-hover:bg-white group-hover:text-slate-900">
              详情
            </span>
          </div>
        </div>
      </Link>

      {/* 悬停：右上角操作 */}
      <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
        {actions}
        <button type="button" onClick={() => onPreview?.(image)} className={iconButton} title="查看大图">
          <Expand size={15} />
        </button>
        <button type="button" onClick={() => download(image)} className={iconButton} title={blocked ? '登录后下载' : '下载原图'}>
          <Download size={15} />
        </button>
      </div>
    </div>
    <DownloadCaptchaModal open={captchaOpen} onClose={cancelCaptcha} onSubmit={confirmCaptcha} />
    </>
  )
}
