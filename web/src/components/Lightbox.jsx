import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Info,
  Maximize2,
  Minus,
  Plus,
  X,
} from 'lucide-react'
import { formatBytes, resolutionText } from '../lib/format'
import { useDownloader } from '../App'
import DownloadCaptchaModal from './DownloadCaptchaModal'

const MIN_SCALE = 1
const MAX_SCALE = 6
const RESET_VIEW = { scale: 1, x: 0, y: 0 }

const clampScale = (value) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value))

/**
 * 大图查看器
 * - 滚轮以光标为锚点放大 / 缩小（1x ~ 6x），放大后按住可拖动查看
 * - 双击在「放大 2x」与「还原」之间切换
 * - 关闭方式只有右上角 ✕ 与 ESC 键：点击图片外的空白区域不会退出预览
 */
export default function Lightbox({ images = [], index = 0, onClose, onIndexChange, hideDetailId = null }) {
  const open = images.length > 0 && index >= 0 && index < images.length
  const current = open ? images[index] : null
  // 已在当前壁纸详情页时隐藏「详情」入口，避免点击后停留在原页面像没反应
  const showDetail = current && String(current.id) !== String(hideDetailId)

  const overlayRef = useRef(null)
  const stageRef = useRef(null)
  const dragRef = useRef(null)
  const { download, blocked, captchaOpen, cancelCaptcha, confirmCaptcha } = useDownloader()
  const [view, setView] = useState(RESET_VIEW)
  const [dragging, setDragging] = useState(false)

  // 换图 / 重新打开时还原缩放
  useEffect(() => {
    setView(RESET_VIEW)
    setDragging(false)
    dragRef.current = null
  }, [index, open])

  /** 以光标位置为锚点缩放，放大时鼠标指着的区域保持在原处 */
  const zoomAt = useCallback((clientX, clientY, factor) => {
    setView((prev) => {
      const next = clampScale(prev.scale * factor)
      if (Math.abs(next - prev.scale) < 0.001) return prev
      if (next === MIN_SCALE) return RESET_VIEW
      const rect = stageRef.current?.getBoundingClientRect()
      if (!rect) return { ...prev, scale: next }
      const cx = clientX - (rect.left + rect.width / 2)
      const cy = clientY - (rect.top + rect.height / 2)
      const ratio = next / prev.scale
      return {
        scale: next,
        x: cx - (cx - prev.x) * ratio,
        y: cy - (cy - prev.y) * ratio,
      }
    })
  }, [])

  /** 右下角按钮缩放：以图片中心为锚点 */
  const zoomByButton = (factor) => {
    const rect = stageRef.current?.getBoundingClientRect()
    zoomAt(
      rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
      rect ? rect.top + rect.height / 2 : window.innerHeight / 2,
      factor,
    )
  }

  // 滚轮缩放：必须 passive: false 才能阻止页面跟着滚动
  useEffect(() => {
    if (!open) return undefined
    const el = overlayRef.current
    if (!el) return undefined
    const onWheel = (e) => {
      e.preventDefault()
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
      zoomAt(e.clientX, e.clientY, Math.exp(-delta * 0.0015))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [open, zoomAt])

  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.()
      if (e.key === 'ArrowLeft') onIndexChange?.((index - 1 + images.length) % images.length)
      if (e.key === 'ArrowRight') onIndexChange?.((index + 1) % images.length)
    }
    document.addEventListener('keydown', onKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
    }
  }, [open, index, images.length, onClose, onIndexChange])

  if (!open) return null

  const zoomed = view.scale > 1

  const onPointerDown = (e) => {
    if (!zoomed) return
    e.preventDefault()
    dragRef.current = { x: e.clientX, y: e.clientY, ox: view.x, oy: view.y }
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setDragging(true)
  }

  const onPointerMove = (e) => {
    const drag = dragRef.current
    if (!drag) return
    setView((prev) => ({
      ...prev,
      x: drag.ox + (e.clientX - drag.x),
      y: drag.oy + (e.clientY - drag.y),
    }))
  }

  const endDrag = () => {
    dragRef.current = null
    setDragging(false)
  }

  const onDoubleClick = (e) => {
    if (zoomed) {
      setView(RESET_VIEW)
      return
    }
    zoomAt(e.clientX, e.clientY, 2)
  }

  const imageClass = zoomed
    ? dragging
      ? 'cursor-grabbing'
      : 'cursor-grab'
    : 'cursor-zoom-in'

  // 视频壁纸直接播放，不做缩放拖拽（缩放对 <video> 无意义）
  const isVideo =
    current?.kind === 'video' && /\.(mp4|m4v|webm|ogv|mov|mkv|avi)([?#]|$)/i.test(current.url || '')

  return (
    <>
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[95] flex flex-col bg-slate-950/95 backdrop-blur-sm"
    >
      <div className="flex items-center justify-between px-4 py-3 text-slate-200">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{current.title || '未命名壁纸'}</p>
          <p className="text-xs text-slate-400">
            {resolutionText(current.width, current.height)} · {current.sizeText || formatBytes(current.size)} ·{' '}
            {index + 1}/{images.length}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {showDetail ? (
            <Link
              to={`/image/${current.id}`}
              onClick={() => onClose?.()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-white/20"
            >
              <Info size={15} />
              详情
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => download(current)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-primary-600"
          >
            <Download size={15} />
            {blocked ? '登录下载' : '下载'}
          </button>
          <button
            type="button"
            onClick={() => onClose?.()}
            className="rounded-lg p-1.5 text-slate-300 transition hover:bg-white/10 hover:text-white"
            aria-label="关闭"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* 图片区域：点击这里（图片外的空白）不会关闭预览，只有 ✕ / ESC 会关闭 */}
      <div
        ref={stageRef}
        className="relative flex flex-1 items-center justify-center overflow-hidden px-2 pb-4"
      >
        {images.length > 1 ? (
          <button
            type="button"
            onClick={() => onIndexChange?.((index - 1 + images.length) % images.length)}
            className="absolute left-2 z-10 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20 sm:left-6"
            aria-label="上一张"
          >
            <ChevronLeft size={22} />
          </button>
        ) : null}

        <div
          key={current.id}
          className="animate-fade-in flex h-full w-full select-none items-center justify-center"
        >
          {isVideo ? (
            <video
              src={current.url}
              poster={current.thumbUrl || undefined}
              controls
              autoPlay
              playsInline
              className="max-h-full max-w-full rounded-lg"
            />
          ) : (
            <img
              src={current.url}
              alt={current.title || '壁纸'}
              draggable={false}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onDoubleClick={onDoubleClick}
              className={`max-h-full max-w-full rounded-lg object-contain ${imageClass}`}
              style={{
                transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`,
                // 拖动时不要过渡，否则会跟手迟滞
                transition: dragging ? 'none' : 'transform 0.12s ease-out',
              }}
            />
          )}
        </div>

        {images.length > 1 ? (
          <button
            type="button"
            onClick={() => onIndexChange?.((index + 1) % images.length)}
            className="absolute right-2 z-10 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20 sm:right-6"
            aria-label="下一张"
          >
            <ChevronRight size={22} />
          </button>
        ) : null}

        <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 hidden -translate-x-1/2 rounded-full bg-black/45 px-3 py-1 text-[11px] text-white/70 backdrop-blur-sm sm:block">
          {isVideo ? '空格播放/暂停 · 方向键切换 · ESC 关闭' : '滚轮缩放 · 双击放大/还原 · 放大后拖拽移动 · ESC 关闭'}
        </div>

        {/* 缩放控制：百分比 + 放大 / 缩小 / 还原（视频不适用） */}
        {!isVideo ? (
          <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded-full bg-black/45 px-1.5 py-1 text-white backdrop-blur-sm">
            <button
              type="button"
              onClick={() => zoomByButton(1 / 1.35)}
              disabled={!zoomed}
              className="rounded-full p-1.5 transition hover:bg-white/15 disabled:opacity-40"
              aria-label="缩小"
            >
              <Minus size={15} />
            </button>
            <span className="w-10 text-center text-xs tabular-nums">{Math.round(view.scale * 100)}%</span>
            <button
              type="button"
              onClick={() => zoomByButton(1.35)}
              disabled={view.scale >= MAX_SCALE}
              className="rounded-full p-1.5 transition hover:bg-white/15 disabled:opacity-40"
              aria-label="放大"
            >
              <Plus size={15} />
            </button>
            <button
              type="button"
              onClick={() => setView(RESET_VIEW)}
              disabled={!zoomed}
              title="还原"
              className="rounded-full p-1.5 transition hover:bg-white/15 disabled:opacity-40"
              aria-label="还原"
            >
              <Maximize2 size={15} />
            </button>
          </div>
        ) : null}
      </div>
    </div>
    <DownloadCaptchaModal open={captchaOpen} onClose={cancelCaptcha} onSubmit={confirmCaptcha} />
    </>
  )
}
