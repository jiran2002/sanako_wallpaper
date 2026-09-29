import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'

const ToastContext = createContext(null)

const STYLES = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  error: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200',
  info: 'border-primary-200 bg-primary-50 text-primary-800 dark:border-primary-900 dark:bg-primary-950 dark:text-primary-200',
}

const ICONS = { success: CheckCircle2, error: AlertCircle, info: Info }

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const remove = useCallback((id) => {
    setToasts((list) => list.filter((item) => item.id !== id))
  }, [])

  const push = useCallback(
    (message, type = 'info', duration = 3200) => {
      const id = `${Date.now()}-${Math.random()}`
      setToasts((list) => [...list, { id, message, type }])
      window.setTimeout(() => remove(id), duration)
    },
    [remove]
  )

  const toast = useMemo(
    () => ({
      success: (message) => push(message, 'success'),
      error: (message) => push(message, 'error', 4200),
      info: (message) => push(message, 'info'),
    }),
    [push]
  )

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(92vw,22rem)] flex-col gap-2">
        {toasts.map((item) => {
          const Icon = ICONS[item.type] || Info
          return (
            <div
              key={item.id}
              className={`animate-toast-in pointer-events-auto flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm shadow-lg backdrop-blur ${STYLES[item.type] || STYLES.info}`}
            >
              <Icon size={18} className="mt-0.5 shrink-0" />
              <span className="flex-1 break-words leading-5">{item.message}</span>
              <button
                type="button"
                onClick={() => remove(item.id)}
                className="shrink-0 rounded p-0.5 opacity-60 transition hover:opacity-100"
                aria-label="关闭提示"
              >
                <X size={15} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast 必须在 <ToastProvider> 内部使用')
  return ctx
}
