import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { resetPassword } from '../lib/auth'
import { useToast } from '../components/Toast'
import Spinner from '../components/Spinner'

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-primary-400 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:focus:border-primary-500 dark:focus:bg-white/10'

export default function ResetPassword() {
  const toast = useToast()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''

  const [form, setForm] = useState({ password: '', confirm: '' })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!token) {
      toast.error('重置链接无效，请重新申请')
      return
    }
    if (form.password.length < 6) {
      toast.error('新密码至少 6 位')
      return
    }
    if (form.password !== form.confirm) {
      toast.error('两次输入的密码不一致')
      return
    }
    setLoading(true)
    try {
      await resetPassword(token, form.password)
      toast.success('密码已重置，请用新密码登录')
      navigate('/login', { replace: true })
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
        <h1 className="mt-3 text-xl font-semibold">设置新密码</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">设置后即可用新密码登录</p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5"
      >
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">新密码</span>
          <div className="relative">
            <Lock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
              autoComplete="new-password"
              placeholder="至少 6 位"
              className={inputClass}
            />
          </div>
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">确认新密码</span>
          <div className="relative">
            <Lock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="password"
              value={form.confirm}
              onChange={(e) => setForm((prev) => ({ ...prev, confirm: e.target.value }))}
              autoComplete="new-password"
              placeholder="再次输入新密码"
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
          {loading ? '提交中…' : '重置密码'}
        </button>

        <p className="text-center text-sm text-slate-500 dark:text-slate-400">
          <Link to="/login" className="text-primary-500 hover:underline">
            返回登录
          </Link>
        </p>
      </form>
    </div>
  )
}