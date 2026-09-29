import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Lock, User } from 'lucide-react'
import { useAuth } from '../App'
import { login } from '../lib/auth'
import { useToast } from '../components/Toast'
import Spinner from '../components/Spinner'

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-primary-400 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:focus:border-primary-500 dark:focus:bg-white/10'

export default function Login() {
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const { setUser } = useAuth()
  const [form, setForm] = useState({ username: '', password: '' })
  const [loading, setLoading] = useState(false)

  const redirectTo = location.state?.from || '/'

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.username.trim() || !form.password) {
      toast.error('请填写用户名和密码')
      return
    }
    setLoading(true)
    try {
      const data = await login(form.username.trim(), form.password)
      setUser(data.user)
      toast.success(`欢迎回来，${data.user.nickname || data.user.username}`)
      navigate(redirectTo, { replace: true })
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
        <h1 className="mt-3 text-xl font-semibold">登录</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">登录后可收藏壁纸、上传作品</p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5"
      >
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">用户名</span>
          <div className="relative">
            <User size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={form.username}
              onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
              autoComplete="username"
              placeholder="请输入用户名"
              className={inputClass}
            />
          </div>
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">密码</span>
          <div className="relative">
            <Lock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
              autoComplete="current-password"
              placeholder="请输入密码"
              className={inputClass}
            />
          </div>
        </label>

        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-xs text-slate-400 transition hover:text-primary-500">
            忘记密码？
          </Link>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary-500 py-2.5 text-sm font-medium text-white transition hover:bg-primary-600 disabled:opacity-60"
        >
          {loading ? <Spinner size={16} /> : null}
          {loading ? '登录中…' : '登录'}
        </button>

        <p className="text-center text-sm text-slate-500 dark:text-slate-400">
          还没有账号？
          <Link to="/register" state={{ from: redirectTo }} className="ml-1 text-primary-500 hover:underline">
            立即注册
          </Link>
        </p>
      </form>
    </div>
  )
}
