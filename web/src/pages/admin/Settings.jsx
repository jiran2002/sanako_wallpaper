import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  Download,
  KeyRound,
  Mail,
  MessageSquare,
  Save,
  Search,
  Smile,
  UserPlus,
} from 'lucide-react'
import { api } from '../../lib/api'
import { useToast } from '../../components/Toast'
import Modal from '../../components/Modal'
import Spinner from '../../components/Spinner'
import Skeleton from '../../components/Skeleton'

const EMPTY_SITE = {
  title: '',
  description: '',
  footer: '',
  icp: '',
  icpUrl: '',
  registrationEnabled: true,
  registerCodeMode: 'none',
  inviteMode: 'none',
  downloadCaptcha: false,
  guestDownloadLimit: 0,
}

const EMPTY_EMAIL = {
  host: '',
  port: 465,
  secure: true,
  user: '',
  pass: '',
  fromName: '',
  fromEmail: '',
}

/** 评论设置默认值（与后端 COMMENT_DEFAULTS 保持一致） */
const EMPTY_COMMENT = { enabled: true, stickerEnabled: false }

/** 开关：开启/关闭一个布尔设置 */
function Switch({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-60 ${
        checked ? 'bg-primary-500' : 'bg-slate-300 dark:bg-white/15'
      }`}
    >
      <span
        className={`h-[18px] w-[18px] transform rounded-full bg-white shadow transition ${
          checked ? 'translate-x-[22px]' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

/** 分段选项：value 为枚举字符串 */
function Segmented({ options, value, onChange, disabled }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1 dark:bg-white/5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
            value === opt.value
              ? 'bg-white text-slate-900 shadow-sm dark:bg-white/15 dark:text-white'
              : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

const labelClass = 'text-xs font-medium text-slate-500 dark:text-slate-400'

export default function Settings() {
  const toast = useToast()
  const [site, setSite] = useState(EMPTY_SITE)
  const [loginDownload, setLoginDownload] = useState(false)
  const [loading, setLoading] = useState(true)
  const [savingSite, setSavingSite] = useState(false)
  const [savingDownload, setSavingDownload] = useState(false)
  const [warningOpen, setWarningOpen] = useState(false)
  const [countdown, setCountdown] = useState(3)
  const [password, setPassword] = useState({ oldPassword: '', newPassword: '', confirm: '' })
  const [savingPassword, setSavingPassword] = useState(false)
  const [comment, setComment] = useState(EMPTY_COMMENT)
  const [savingComment, setSavingComment] = useState(false)
  const [hotWords, setHotWords] = useState('')
  const [savingSearch, setSavingSearch] = useState(false)
  const [searchTerms, setSearchTerms] = useState([])
  // 邮箱设置（SMTP）
  const [email, setEmail] = useState(EMPTY_EMAIL)
  const [savingEmail, setSavingEmail] = useState(false)
  const [testingEmail, setTestingEmail] = useState(false)
  const [testTo, setTestTo] = useState('')

  useEffect(() => {
    let cancelled = false
    api
      .get('/api/admin/site', { auth: true })
      .then((data) => {
        if (cancelled) return
        setSite({
          title: data?.title || '',
          description: data?.description || '',
          footer: data?.footer || '',
          icp: data?.icp || '',
          icpUrl: data?.icpUrl || '',
          registrationEnabled: data?.registrationEnabled !== false,
          registerCodeMode: data?.registerCodeMode || 'none',
          inviteMode: data?.inviteMode || 'none',
          downloadCaptcha: Boolean(data?.downloadCaptcha),
          guestDownloadLimit: Number(data?.guestDownloadLimit) || 0,
        })
        setLoginDownload(Boolean(data?.requireLoginDownload))
      })
      .catch((err) => {
        if (!cancelled) toast.error(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [toast])

  // 邮箱设置（SMTP）
  useEffect(() => {
    let cancelled = false
    api
      .get('/api/admin/email', { auth: true })
      .then((data) => {
        if (!cancelled) setEmail({ ...EMPTY_EMAIL, ...(data || {}) })
      })
      .catch((err) => {
        if (!cancelled) toast.error(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [toast])

  // 评论设置（表情包本体在「表情包」页维护）
  useEffect(() => {
    let cancelled = false
    api
      .get('/api/admin/comment-settings', { auth: true })
      .then((commentData) => {
        if (!cancelled) setComment({ ...EMPTY_COMMENT, ...(commentData || {}) })
      })
      .catch((err) => {
        if (!cancelled) toast.error(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [toast])

  // 搜索热词（前台搜索框聚焦时展示）
  useEffect(() => {
    let cancelled = false
    api
      .get('/api/admin/search-settings', { auth: true })
      .then((data) => {
        if (!cancelled) setHotWords((data?.hotWords || []).join(' '))
      })
      .catch((err) => {
        if (!cancelled) toast.error(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [toast])

  // 搜索词统计：前台搜索过的词与命中数，用来挑热词
  useEffect(() => {
    let cancelled = false
    api
      .get('/api/admin/search-terms', { auth: true, query: { limit: 50 } })
      .then((data) => {
        if (!cancelled) setSearchTerms(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        // 统计只是辅助信息，取不到就不展示
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 警示弹窗强制停留 3 秒，倒计时结束前无法确认
  useEffect(() => {
    if (!warningOpen) return undefined
    const timer = setInterval(() => setCountdown((prev) => (prev <= 1 ? 0 : prev - 1)), 1000)
    return () => clearInterval(timer)
  }, [warningOpen])

  const openWarning = () => {
    setCountdown(3)
    setWarningOpen(true)
  }

  /** 通用：保存站点设置的单个/多个字段并同步本地状态 */
  const saveSiteField = async (patch, successMsg) => {
    setSavingSite(true)
    try {
      await api.put('/api/admin/site', patch, { auth: true })
      setSite((prev) => ({ ...prev, ...patch }))
      toast.success(successMsg)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSavingSite(false)
    }
  }

  const saveLoginDownload = async (value) => {
    setSavingDownload(true)
    try {
      await api.put('/api/admin/site', { requireLoginDownload: value }, { auth: true })
      setLoginDownload(value)
      setWarningOpen(false)
      toast.success(value ? '已开启登录后下载' : '已关闭登录后下载')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSavingDownload(false)
    }
  }

  const saveEmail = async (e) => {
    e.preventDefault()
    if (!email.host || !email.user) {
      toast.error('请至少填写 SMTP 服务器地址与账号')
      return
    }
    setSavingEmail(true)
    try {
      await api.put('/api/admin/email', email, { auth: true })
      toast.success('邮箱设置已保存')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSavingEmail(false)
    }
  }

  const testEmail = async () => {
    if (!email.host || !email.user) {
      toast.error('请至少填写 SMTP 服务器地址与账号')
      return
    }
    setTestingEmail(true)
    try {
      // 先保存当前表单，确保测试用的就是界面上的配置（避免发件邮箱未保存而回退到 SMTP 账号）
      await api.put('/api/admin/email', email, { auth: true })
      const res = await api.post('/api/admin/email/test', { to: testTo.trim() }, { auth: true })
      toast.success(`测试邮件已发送至 ${res?.to || '配置的邮箱'}`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setTestingEmail(false)
    }
  }

  /** 评论设置：改动即保存，前台下次加载即生效 */
  const saveComment = async (patch) => {
    setSavingComment(true)
    try {
      const updated = await api.put('/api/admin/comment-settings', patch, { auth: true })
      setComment({ ...EMPTY_COMMENT, ...(updated || {}) })
      toast.success('评论设置已保存')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSavingComment(false)
    }
  }

  /** 搜索热词：用空格或逗号分隔，保存时拆成数组 */
  const saveSearch = async (e) => {
    e.preventDefault()
    setSavingSearch(true)
    try {
      const list = hotWords
        .split(/[\s,，]+/)
        .map((word) => word.trim())
        .filter(Boolean)
      const updated = await api.put('/api/admin/search-settings', { hotWords: list }, { auth: true })
      setHotWords((updated?.hotWords || []).join(' '))
      toast.success('搜索热词已保存')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSavingSearch(false)
    }
  }

  /** 把统计里的词追加进热词输入框（已存在则忽略） */
  const addHotWord = (word) => {
    const list = hotWords.split(/[\s,，]+/).filter(Boolean)
    if (list.includes(word)) {
      toast.info(`「${word}」已在热词里`)
      return
    }
    if (list.length >= 20) {
      toast.error('热词最多 20 个，请先删掉几个')
      return
    }
    setHotWords([...list, word].join(' '))
  }

  const saveSite = async (e) => {
    e.preventDefault()
    setSavingSite(true)
    try {
      const updated = await api.put('/api/admin/site', site, { auth: true })
      setSite({
        title: updated?.title || '',
        description: updated?.description || '',
        footer: updated?.footer || '',
        icp: updated?.icp || '',
        icpUrl: updated?.icpUrl || '',
        registrationEnabled: updated?.registrationEnabled !== false,
        registerCodeMode: updated?.registerCodeMode || 'none',
        inviteMode: updated?.inviteMode || 'none',
        downloadCaptcha: Boolean(updated?.downloadCaptcha),
        guestDownloadLimit: Number(updated?.guestDownloadLimit) || 0,
      })
      if (updated?.title) document.title = updated.title
      toast.success('站点设置已保存')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSavingSite(false)
    }
  }

  const savePassword = async (e) => {
    e.preventDefault()
    if (!password.oldPassword || !password.newPassword) {
      toast.error('请填写原密码和新密码')
      return
    }
    if (password.newPassword !== password.confirm) {
      toast.error('两次输入的新密码不一致')
      return
    }
    setSavingPassword(true)
    try {
      await api.post('/api/admin/password', { oldPassword: password.oldPassword, newPassword: password.newPassword }, { auth: true })
      toast.success('密码已修改，下次登录请使用新密码')
      setPassword({ oldPassword: '', newPassword: '', confirm: '' })
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSavingPassword(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="admin-title">站点设置</h1>
        <p className="admin-subtitle">修改站点信息、注册与下载策略、邮箱服务与管理员密码</p>
      </div>

      <form onSubmit={saveSite} className="admin-card space-y-4">
        <h2 className="text-sm font-semibold">基础信息</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className={labelClass}>站点标题</span>
            <input
              value={site.title}
              onChange={(e) => setSite((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="壁纸站"
              className="admin-input"
            />
          </label>
          <label className="space-y-1.5">
            <span className={labelClass}>页脚补充说明</span>
            <input
              value={site.footer}
              onChange={(e) => setSite((prev) => ({ ...prev, footer: e.target.value }))}
              placeholder="展示在页脚最后一个栏目，如：内容仅供学习交流"
              className="admin-input"
            />
          </label>
        </div>

        <label className="block space-y-1.5">
          <span className={labelClass}>站点描述</span>
          <textarea
            rows={3}
            value={site.description}
            onChange={(e) => setSite((prev) => ({ ...prev, description: e.target.value }))}
            placeholder="一句话介绍你的壁纸站"
            className="admin-input resize-y"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className={labelClass}>ICP 备案号</span>
            <input
              value={site.icp}
              onChange={(e) => setSite((prev) => ({ ...prev, icp: e.target.value }))}
              placeholder="京ICP备00000000号"
              className="admin-input"
            />
          </label>
          <label className="space-y-1.5">
            <span className={labelClass}>ICP 备案链接</span>
            <input
              value={site.icpUrl}
              onChange={(e) => setSite((prev) => ({ ...prev, icpUrl: e.target.value }))}
              placeholder="https://beian.miit.gov.cn/"
              className="admin-input"
            />
          </label>
        </div>

        <button type="submit" disabled={savingSite} className="admin-btn-primary">
          {savingSite ? <Spinner size={15} /> : <Save size={15} />}
          保存站点设置
        </button>
      </form>

      {/* 用户注册策略 */}
      <section className="admin-card space-y-4">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
          <UserPlus size={16} className="text-slate-400" />
          用户注册
        </h2>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">开启用户注册</p>
            <p className="mt-0.5 text-xs text-slate-400">
              关闭后前台「注册」入口不再接受新账号，仅管理员可在后台手动创建用户。
            </p>
          </div>
          <Switch
            checked={site.registrationEnabled}
            disabled={savingSite}
            onChange={(next) => saveSiteField({ registrationEnabled: next }, next ? '已开启用户注册' : '已关闭用户注册')}
          />
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between dark:border-white/5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">注册验证码</p>
            <p className="mt-0.5 text-xs text-slate-400">
              选「邮箱验证码」需先在下方配置 SMTP；选「图形验证码」则显示图片验证码。
            </p>
          </div>
          <Segmented
            disabled={savingSite}
            value={site.registerCodeMode}
            onChange={(next) => saveSiteField({ registerCodeMode: next }, '注册验证码已保存')}
            options={[
              { value: 'none', label: '无需验证码' },
              { value: 'email', label: '邮箱验证码' },
              { value: 'captcha', label: '图形验证码' },
            ]}
          />
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between dark:border-white/5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">是否需要邀请码</p>
            <p className="mt-0.5 text-xs text-slate-400">
              选「强制」时注册必须填写有效邀请码；「选填」则填了才校验，不填也能注册。
            </p>
          </div>
          <Segmented
            disabled={savingSite}
            value={site.inviteMode}
            onChange={(next) => saveSiteField({ inviteMode: next }, '邀请码设置已保存')}
            options={[
              { value: 'none', label: '无需' },
              { value: 'optional', label: '选填' },
              { value: 'required', label: '强制' },
            ]}
          />
        </div>
      </section>

      {/* 下载策略 */}
      <section className="admin-card space-y-3">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
          <Download size={16} className="text-slate-400" />
          下载设置
        </h2>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">是否需要登录下载</p>
            <p className="mt-0.5 text-xs text-slate-400">
              开启后，所有壁纸都必须登录账号才能下载原图；游客点击下载会被引导去登录。
            </p>
            {loginDownload ? (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
                <AlertTriangle size={13} />
                当前已开启：游客无法下载壁纸
              </p>
            ) : null}
          </div>
          <Switch
            checked={loginDownload}
            disabled={savingDownload}
            onChange={(next) => (next ? openWarning() : saveLoginDownload(false))}
          />
        </div>

        <div className="flex items-start justify-between gap-4 border-t border-slate-100 pt-4 dark:border-white/5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">游客下载图形验证码</p>
            <p className="mt-0.5 text-xs text-slate-400">
              关闭「登录后下载」时，游客下载原图前是否需先输入图形验证码，用于防抓取。
            </p>
          </div>
          <Switch
            checked={site.downloadCaptcha}
            disabled={savingSite || loginDownload}
            onChange={(next) => saveSiteField({ downloadCaptcha: next }, next ? '已开启游客下载验证码' : '已关闭游客下载验证码')}
          />
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between dark:border-white/5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">游客下载次数限制（每天）</p>
            <p className="mt-0.5 text-xs text-slate-400">
              未登录游客每天可下载原图的次数，0 表示不限。仅对游客生效，登录用户不受影响。
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <input
              type="number"
              min="0"
              value={site.guestDownloadLimit}
              onChange={(e) =>
                setSite((prev) => ({ ...prev, guestDownloadLimit: Math.max(0, Number(e.target.value) || 0) }))
              }
              className="admin-input w-28 text-right"
            />
            <button
              type="button"
              disabled={savingSite}
              onClick={() => saveSiteField({ guestDownloadLimit: site.guestDownloadLimit }, '游客下载次数限制已保存')}
              className="admin-btn"
            >
              {savingSite ? <Spinner size={15} /> : <Save size={14} />}
              保存
            </button>
          </div>
        </div>
      </section>

      {/* 邮箱设置（SMTP） */}
      <form onSubmit={saveEmail} className="admin-card space-y-4">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
          <Mail size={16} className="text-slate-400" />
          邮箱设置（SMTP）
        </h2>
        <p className="text-xs text-slate-400">
          用于发送注册邮箱验证码。注册验证码选「邮箱验证码」时，只有这里配置完成才能正常发送。
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-1.5">
            <span className={labelClass}>SMTP 服务器</span>
            <input
              value={email.host}
              onChange={(e) => setEmail((prev) => ({ ...prev, host: e.target.value }))}
              placeholder="smtp.example.com"
              className="admin-input"
            />
          </label>
          <label className="space-y-1.5">
            <span className={labelClass}>端口</span>
            <input
              type="number"
              value={email.port}
              onChange={(e) => setEmail((prev) => ({ ...prev, port: Number(e.target.value) || 465 }))}
              className="admin-input"
            />
          </label>
          <label className="flex items-end gap-2 pb-2">
            <span className={labelClass}>使用 SSL/TLS</span>
            <Switch
              checked={email.secure}
              onChange={(next) => setEmail((prev) => ({ ...prev, secure: next }))}
            />
          </label>
          <label className="space-y-1.5">
            <span className={labelClass}>账号（邮箱）</span>
            <input
              value={email.user}
              onChange={(e) => setEmail((prev) => ({ ...prev, user: e.target.value }))}
              placeholder="you@example.com"
              className="admin-input"
            />
          </label>
          <label className="space-y-1.5">
            <span className={labelClass}>密码 / 授权码</span>
            <input
              type="password"
              value={email.pass}
              onChange={(e) => setEmail((prev) => ({ ...prev, pass: e.target.value }))}
              placeholder="SMTP 授权码"
              className="admin-input"
            />
          </label>
          <label className="space-y-1.5">
            <span className={labelClass}>发件人名称</span>
            <input
              value={email.fromName}
              onChange={(e) => setEmail((prev) => ({ ...prev, fromName: e.target.value }))}
              placeholder="壁纸集"
              className="admin-input"
            />
          </label>
          <label className="space-y-1.5">
            <span className={labelClass}>发件邮箱（留空同账号）</span>
            <input
              value={email.fromEmail}
              onChange={(e) => setEmail((prev) => ({ ...prev, fromEmail: e.target.value }))}
              placeholder="you@example.com"
              className="admin-input"
            />
          </label>
          <label className="space-y-1.5">
            <span className={labelClass}>测试收件邮箱（留空发到发件邮箱）</span>
            <input
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="you@example.com"
              className="admin-input"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={savingEmail} className="admin-btn-primary">
            {savingEmail ? <Spinner size={15} /> : <Save size={15} />}
            保存邮箱设置
          </button>
          <button type="button" disabled={testingEmail} onClick={testEmail} className="admin-btn">
            {testingEmail ? <Spinner size={15} /> : <Mail size={15} />}
            发送测试邮件
          </button>
        </div>
      </form>

      {/* 评论设置：全局评论区开关 + 表情包 */}
      <section className="admin-card space-y-4">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
          <MessageSquare size={16} className="text-slate-400" />
          评论设置
        </h2>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">全局评论区</p>
            <p className="mt-0.5 text-xs text-slate-400">
              决定评论服务是否可用。关闭后只有管理员能查看与发表评论，其他角色与游客都看不到评论区。
            </p>
          </div>
          <Switch
            checked={comment.enabled}
            disabled={savingComment}
            onChange={(next) => saveComment({ enabled: next })}
          />
        </div>

        <div className="flex items-start justify-between gap-4 border-t border-slate-100 pt-4 dark:border-white/5">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
              <Smile size={15} className="text-slate-400" />
              表情包
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              开启后评论区可直接发送表情包。表情包内容在左侧「表情包」里自己上传维护（可建多套）。
            </p>
          </div>
          <Switch
            checked={comment.stickerEnabled}
            disabled={savingComment}
            onChange={(next) => saveComment({ stickerEnabled: next })}
          />
        </div>
      </section>

      {/* 搜索热词：前台搜索框聚焦时展示 */}
      <form onSubmit={saveSearch} className="admin-card space-y-3">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
          <Search size={16} className="text-slate-400" />
          搜索热词
        </h2>
        <label className="block space-y-1.5">
          <span className={labelClass}>热门搜索词（用空格或逗号分隔，最多 20 个）</span>
          <input
            value={hotWords}
            onChange={(e) => setHotWords(e.target.value)}
            placeholder="4K 风景 动漫 手机壁纸"
            className="admin-input"
          />
        </label>
        <button type="submit" disabled={savingSearch} className="admin-btn">
          {savingSearch ? <Spinner size={15} /> : <Save size={15} />}
          保存热词
        </button>
      </form>

      {/* 搜索词统计：点一下把该词填进上面的热词输入框 */}
      {searchTerms.length > 0 ? (
        <section className="admin-card space-y-3">
          <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
            <Search size={16} className="text-slate-400" />
            搜索词统计
          </h2>
          <p className="text-xs text-slate-400">
            前台搜索过的词，按次数倒序。点击可填进上面的热词输入框；「命中 0」说明站内还没有对应的壁纸。
          </p>
          <div className="flex flex-wrap gap-2">
            {searchTerms.map((item) => (
              <button
                key={item.keyword}
                type="button"
                onClick={() => addHotWord(item.keyword)}
                title={`搜索 ${item.count} 次 · 最近命中 ${item.results} 张`}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${
                  item.results > 0
                    ? 'border-slate-200 text-slate-600 hover:border-primary-500/50 hover:text-primary-500 dark:border-white/10 dark:text-slate-300'
                    : 'border-dashed border-amber-300 text-amber-600 hover:bg-amber-50 dark:border-amber-500/40 dark:text-amber-300'
                }`}
              >
                {item.keyword}
                <span className="tabular-nums text-slate-400">{item.count}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <form onSubmit={savePassword} className="admin-card space-y-4">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
          <KeyRound size={16} className="text-slate-400" />
          修改管理员密码
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="space-y-1.5">
            <span className={labelClass}>原密码</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password.oldPassword}
              onChange={(e) => setPassword((prev) => ({ ...prev, oldPassword: e.target.value }))}
              className="admin-input"
            />
          </label>
          <label className="space-y-1.5">
            <span className={labelClass}>新密码</span>
            <input
              type="password"
              autoComplete="new-password"
              value={password.newPassword}
              onChange={(e) => setPassword((prev) => ({ ...prev, newPassword: e.target.value }))}
              className="admin-input"
            />
          </label>
          <label className="space-y-1.5">
            <span className={labelClass}>确认新密码</span>
            <input
              type="password"
              autoComplete="new-password"
              value={password.confirm}
              onChange={(e) => setPassword((prev) => ({ ...prev, confirm: e.target.value }))}
              className="admin-input"
            />
          </label>
        </div>

        <button type="submit" disabled={savingPassword} className="admin-btn">
          {savingPassword ? <Spinner size={15} /> : <KeyRound size={15} />}
          修改密码
        </button>
      </form>

      {/* 开启「登录后下载」前的强制警示：需停留 3 秒才能确认 */}
      <Modal
        open={warningOpen}
        onClose={() => setWarningOpen(false)}
        title="确认开启「登录后下载」？"
        footer={
          <>
            <button type="button" onClick={() => setWarningOpen(false)} className="admin-btn">
              取消
            </button>
            <button
              type="button"
              disabled={countdown > 0 || savingDownload}
              onClick={() => saveLoginDownload(true)}
              className="admin-btn-primary disabled:cursor-not-allowed"
            >
              {savingDownload ? <Spinner size={15} /> : <AlertTriangle size={15} />}
              {countdown > 0 ? `请阅读（${countdown}s）` : '确认开启'}
            </button>
          </>
        }
      >
        <div className="flex gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-500 dark:bg-amber-950/50 dark:text-amber-400">
            <AlertTriangle size={20} />
          </span>
          <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
            <p className="font-medium text-slate-800 dark:text-slate-100">开启后所有壁纸都需要登录才能下载</p>
            <p>
              游客点击下载会被引导登录，这可能会让一部分只想直接下载的用户离开，导致<strong className="text-amber-600 dark:text-amber-400">失去一定的用户</strong>。
            </p>
            <p className="text-xs text-slate-400">请确认这符合你当前阶段的运营策略，开启后随时可以在本页关闭。</p>
          </div>
        </div>
      </Modal>
    </div>
  )
}