import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { KeyRound, Lock, Mail, RefreshCw, ShieldCheck, Ticket, User, UserRound } from 'lucide-react'
import { useAuth, useSite } from '../App'
import { register, sendEmailCode } from '../lib/auth'
import { api } from '../lib/api'
import { useToast } from '../components/Toast'
import Spinner from '../components/Spinner'

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-primary-400 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:focus:border-primary-500 dark:focus:bg-white/10'

function Field({ icon: Icon, label, children }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      <div className="relative">
        <Icon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        {children}
      </div>
    </label>
  )
}

export default function Register() {
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const { setUser } = useAuth()
  const { site } = useSite()
  const [form, setForm] = useState({ username: '', nickname: '', password: '', confirm: '' })
  const [email, setEmail] = useState('')
  const [emailCode, setEmailCode] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [captcha, setCaptcha] = useState(null) // { id, svg }
  const [captchaCode, setCaptchaCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  const registerCodeMode = site?.registerCodeMode || 'none'
  const inviteMode = site?.inviteMode || 'none'
  const needEmail = registerCodeMode === 'email'
  const needCaptcha = registerCodeMode === 'captcha'
  const needInvite = inviteMode === 'required' || inviteMode === 'optional'

  const redirectTo = location.state?.from || '/'

  const loadCaptcha = useCallback(async () => {
    try {
      setCaptcha(await api.get('/api/auth/captcha'))
      setCaptchaCode('')
    } catch (err) {
      toast.error(err.message)
    }
  }, [toast])

  useEffect(() => {
    if (needCaptcha) loadCaptcha()
  }, [needCaptcha, loadCaptcha])

  // 发送验证码倒计时
  useEffect(() => {
    if (cooldown <= 0) return undefined
    const timer = setInterval(() => setCooldown((prev) => prev - 1), 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  const handleSendCode = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error('请先填写正确的邮箱地址')
      return
    }
    setSendingCode(true)
    try {
      await sendEmailCode(email.trim())
      toast.success('验证码已发送，请查收邮箱')
      setCooldown(60)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSendingCode(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const username = form.username.trim()
    if (!username) {
      toast.error('请填写用户名')
      return
    }
    if (form.password.length < 6) {
      toast.error('密码至少 6 位')
      return
    }
    if (form.password !== form.confirm) {
      toast.error('两次输入的密码不一致')
      return
    }
    if (needEmail) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        toast.error('请填写正确的邮箱地址')
        return
      }
      if (!emailCode.trim()) {
        toast.error('请填写邮箱验证码')
        return
      }
    }
    if (inviteMode === 'required' && !inviteCode.trim()) {
      toast.error('本站注册需要邀请码，请填写邀请码')
      return
    }
    if (needCaptcha) {
      if (!captchaCode.trim()) {
        toast.error('请填写图形验证码')
        return
      }
      if (!captcha) {
        toast.error('图形验证码加载失败，请刷新重试')
        return
      }
    }

    setLoading(true)
    try {
      const data = await register({
        username,
        password: form.password,
        nickname: form.nickname.trim(),
        email: needEmail ? email.trim() : undefined,
        code: needEmail ? emailCode.trim() : undefined,
        inviteCode: needInvite ? inviteCode.trim() : undefined,
        captchaId: needCaptcha ? captcha.id : undefined,
        captchaCode: needCaptcha ? captchaCode.trim() : undefined,
      })
      setUser(data.user)
      if (data.becameAdmin) {
        toast.success('注册成功，你是本站第一位用户，已获得管理员权限')
      } else {
        toast.success('注册成功，欢迎加入')
      }
      navigate(redirectTo, { replace: true })
    } catch (err) {
      toast.error(err.message)
      if (needCaptcha) loadCaptcha()
    } finally {
      setLoading(false)
    }
  }

  // 站点关闭注册
  if (site && site.registrationEnabled === false) {
    return (
      <div className="mx-auto max-w-sm py-20 text-center">
        <ShieldCheck size={40} className="mx-auto text-slate-300 dark:text-slate-600" />
        <h1 className="mt-4 text-lg font-semibold">本站暂未开放注册</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">如需账号请联系管理员获取</p>
        <Link
          to="/login"
          state={{ from: redirectTo }}
          className="mt-5 inline-block rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-primary-600"
        >
          返回登录
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col justify-center py-10">
      <div className="mb-6 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-primary-500 to-indigo-500 text-lg font-bold text-white">
          W
        </span>
        <h1 className="mt-3 text-xl font-semibold">注册账号</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">注册后即可收藏壁纸、上传作品</p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5"
      >
        <Field icon={User} label="用户名">
          <input
            value={form.username}
            onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
            autoComplete="username"
            placeholder="2-20 位中英文、数字、下划线与短横线"
            className={inputClass}
          />
        </Field>

        <Field
          icon={UserRound}
          label={
            <>
              昵称 <span className="text-xs font-normal text-slate-400">（可留空，默认同用户名）</span>
            </>
          }
        >
          <input
            value={form.nickname}
            onChange={(e) => setForm((prev) => ({ ...prev, nickname: e.target.value }))}
            placeholder="展示给其他用户的名称"
            className={inputClass}
          />
        </Field>

        {needEmail ? (
          <Field icon={Mail} label="邮箱">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="用于接收验证码"
              className={inputClass}
            />
          </Field>
        ) : null}

        {needEmail ? (
          <Field icon={KeyRound} label="邮箱验证码">
            <input
              value={emailCode}
              onChange={(e) => setEmailCode(e.target.value)}
              placeholder="6 位数字"
              inputMode="numeric"
              maxLength={6}
              className={`${inputClass} pr-24`}
            />
            <button
              type="button"
              onClick={handleSendCode}
              disabled={sendingCode || cooldown > 0}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg bg-primary-500 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-primary-600 disabled:opacity-60"
            >
              {sendingCode ? '发送中…' : cooldown > 0 ? `${cooldown}s` : '发送验证码'}
            </button>
          </Field>
        ) : null}

        {needInvite ? (
          <Field
            icon={Ticket}
            label={
              <>
                邀请码 <span className="text-xs font-normal text-slate-400">（{inviteMode === 'required' ? '必填' : '选填'}）</span>
              </>
            }
          >
            <input
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              placeholder="输入邀请码"
              className={`${inputClass} uppercase`}
            />
          </Field>
        ) : null}

        {needCaptcha ? (
          <div className="space-y-1.5">
            <span className="text-sm font-medium">图形验证码</span>
            <div className="flex items-center gap-2">
              <div className="h-[46px] flex-1 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/5">
                {captcha ? (
                  <div className="flex h-full items-center justify-center" dangerouslySetInnerHTML={{ __html: captcha.svg }} />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Spinner size={18} />
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={loadCaptcha}
                title="换一张"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:text-primary-500 dark:border-white/10 dark:text-slate-300"
              >
                <RefreshCw size={16} />
              </button>
            </div>
            <input
              value={captchaCode}
              onChange={(e) => setCaptchaCode(e.target.value)}
              placeholder="图中字符，不区分大小写"
              autoComplete="off"
              maxLength={6}
              className={`${inputClass} !mt-1.5 uppercase tracking-widest`}
            />
          </div>
        ) : null}

        <Field icon={Lock} label="密码">
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
            autoComplete="new-password"
            placeholder="至少 6 位"
            className={inputClass}
          />
        </Field>

        <Field icon={Lock} label="确认密码">
          <input
            type="password"
            value={form.confirm}
            onChange={(e) => setForm((prev) => ({ ...prev, confirm: e.target.value }))}
            autoComplete="new-password"
            placeholder="再次输入密码"
            className={inputClass}
          />
        </Field>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary-500 py-2.5 text-sm font-medium text-white transition hover:bg-primary-600 disabled:opacity-60"
        >
          {loading ? <Spinner size={16} /> : null}
          {loading ? '注册中…' : '注册'}
        </button>

        <p className="flex items-start gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-white/5 dark:text-slate-400">
          <ShieldCheck size={14} className="mt-0.5 shrink-0" />
          上传的壁纸需经管理员审核通过后才会公开展示
        </p>

        <p className="text-center text-sm text-slate-500 dark:text-slate-400">
          已有账号？
          <Link to="/login" state={{ from: redirectTo }} className="ml-1 text-primary-500 hover:underline">
            去登录
          </Link>
        </p>
      </form>
    </div>
  )
}