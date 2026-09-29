import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Lock, User } from 'lucide-react'
import { adminLogin } from '../../lib/auth'
import { useToast } from '../../components/Toast'
import Spinner from '../../components/Spinner'

export default function Login() {
  const toast = useToast()
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', password: '' })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.username.trim() || !form.password) {
      toast.error('请填写用户名和密码')
      return
    }
    setLoading(true)
    try {
      const data = await adminLogin(form.username.trim(), form.password)
      toast.success(`欢迎回来，${data.user.nickname || data.user.username}`)
      navigate('/admin', { replace: true })
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-4 dark:bg-ink-950">
      <div className="relative w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-primary-500 text-lg font-bold text-white">
            W
          </span>
          <h1 className="admin-title mt-3">管理后台登录</h1>
          <p className="admin-subtitle">请输入管理员账号继续</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="admin-card space-y-4 p-6"
        >
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">用户名</span>
            <div className="relative">
              <User size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={form.username}
                onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
                autoComplete="username"
                placeholder="admin"
                className="admin-input py-2.5 pl-9"
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
                placeholder="••••••••"
                className="admin-input py-2.5 pl-9"
              />
            </div>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="admin-btn-primary w-full py-2.5"
          >
            {loading ? <Spinner size={16} /> : null}
            {loading ? '登录中…' : '登录'}
          </button>
        </form>

        <Link
          to="/"
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-primary-500 dark:text-slate-400"
        >
          <ArrowLeft size={15} />
          返回前台
        </Link>
      </div>
    </div>
  )
}
