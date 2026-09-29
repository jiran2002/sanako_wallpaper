import { useState } from 'react'
import { Link } from 'react-router-dom'
import { KeyRound, Mail } from 'lucide-react'
import { forgotPassword } from '../lib/auth'
import { useToast } from '../components/Toast'
import Spinner from '../components/Spinner'

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-primary-400 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:focus:border-primary-500 dark:focus:bg-white/10'

export default function ForgotPassword() {
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error('请填写正确的邮箱地址')
      return
    }
    setLoading(true)
    try {
      await forgotPassword(email.trim())
      setSent(true)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col justify-center py-10">
      <div className="mb-6 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-primary-500 to-indigo-500 text-lg font-bold text-white">
          W
        </span>
        <h1 className="mt-3 text-xl font-semibold">找回密码</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">输入注册邮箱，我们会发送重置链接</p>
      </div>

      {sent ? (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-white/10 dark:bg-white/5">
          <KeyRound size={36} className="mx-auto text-primary-500" />
          <p className="text-sm text-slate-600 dark:text-slate-300">
            如果该邮箱已注册，重置链接已发送至 <span className="font-medium">{email}</span>，请查收邮件（含垃圾箱）。
          </p>
          <p className="text-xs text-slate-400">链接 15 分钟内有效</p>
          <Link
            to="/login"
            className="mt-2 inline-block rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-primary-600"
          >
            返回登录
          </Link>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5"
        >
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">邮箱</span>
            <div className="relative">
              <Mail size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="you@example.com"
                className={inputClass}
              />
            </div>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary-500 py-2.5 text-sm font-medium text-white transition hover:bg-primary-600 disabled:opacity-60"
          >
            {loading ? <Spinner size={16} /> : null}
            {loading ? '发送中…' : '发送重置链接'}
          </button>

          <p className="text-center text-sm text-slate-500 dark:text-slate-400">
            想起密码了？
            <Link to="/login" className="ml-1 text-primary-500 hover:underline">
              去登录
            </Link>
          </p>
        </form>
      )}
    </div>
  )
}