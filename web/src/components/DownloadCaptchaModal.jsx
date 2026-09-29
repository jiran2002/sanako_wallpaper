import { useEffect, useState } from 'react'
import { RefreshCw, ShieldCheck } from 'lucide-react'
import Modal from './Modal'
import Spinner from './Spinner'
import { api } from '../lib/api'

/**
 * 下载前图形验证码弹窗：未登录游客下载原图时，站点若开启「强制验证码」，
 * 需要先正确输入图形验证码才能继续下载。
 */
export default function DownloadCaptchaModal({ open, onClose, onSubmit }) {
  const [captcha, setCaptcha] = useState(null) // { id, svg }
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const data = await api.get('/api/auth/captcha')
      setCaptcha(data)
      setCode('')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) load()
  }, [open])

  const handleSubmit = async () => {
    if (!code.trim() || !captcha || submitting) return
    setSubmitting(true)
    try {
      await onSubmit(captcha.id, code.trim())
      setCode('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="下载前验证"
      maxWidth="max-w-sm"
      zIndex={120}
      footer={
        <>
          <button type="button" onClick={onClose} className="admin-btn">
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !code.trim()}
            className="admin-btn-primary disabled:cursor-not-allowed"
          >
            {submitting ? <Spinner size={15} /> : <ShieldCheck size={15} />}
            确认下载
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          请输入图中字符，验证通过后即可下载原图。
        </p>
        <div className="flex items-center gap-3">
          <div className="h-[46px] flex-1 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/5">
            {loading || !captcha ? (
              <div className="flex h-full items-center justify-center">
                <Spinner size={18} />
              </div>
            ) : (
              <div
                className="flex h-full items-center justify-center"
                dangerouslySetInnerHTML={{ __html: captcha.svg }}
              />
            )}
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            title="换一张"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:text-primary-500 disabled:opacity-50 dark:border-white/10 dark:text-slate-300"
          >
            <RefreshCw size={16} />
          </button>
        </div>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit()
          }}
          placeholder="不区分大小写"
          autoComplete="off"
          maxLength={6}
          className="admin-input uppercase tracking-widest"
        />
      </div>
    </Modal>
  )
}