import { useEffect } from 'react'
import { X } from 'lucide-react'

/** 通用弹窗：支持 ESC 关闭、点击遮罩关闭、锁定滚动 */
export default function Modal({ open, onClose, title, children, footer, maxWidth = 'max-w-lg', zIndex = 90 }) {
  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 flex items-start justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-sm sm:items-center"
      style={{ zIndex }}
    >
      <div className="absolute inset-0" onClick={() => onClose?.()} aria-hidden="true" />
      <div
        className={`animate-fade-in relative z-10 my-8 w-full ${maxWidth} rounded-3xl border border-white/70 bg-white/90 shadow-2xl shadow-primary-500/10 backdrop-blur-2xl dark:border-white/10 dark:bg-ink-900/95 dark:shadow-black/50`}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-slate-200/70 px-5 py-3.5 dark:border-white/10">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
          <button
            type="button"
            onClick={() => onClose?.()}
            className="rounded-xl border border-transparent p-1.5 text-slate-400 transition hover:border-white/70 hover:bg-white/70 hover:text-slate-700 dark:hover:border-white/10 dark:hover:bg-white/10 dark:hover:text-slate-200"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-slate-200/70 px-5 py-3.5 dark:border-white/10">{footer}</div>
        ) : null}
      </div>
    </div>
  )
}
