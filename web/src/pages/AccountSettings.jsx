import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { KeyRound, Save, Upload, UserRound } from 'lucide-react'
import { useAuth } from '../App'
import { api, xhrUpload } from '../lib/api'
import { cacheUser } from '../lib/auth'
import { useToast } from '../components/Toast'
import Avatar from '../components/Avatar'
import Spinner from '../components/Spinner'

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-primary-400 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:focus:border-primary-500 dark:focus:bg-white/10'

const cardClass = 'rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5'

export default function AccountSettings() {
  const toast = useToast()
  const { user, setUser } = useAuth()
  const fileRef = useRef(null)

  const [profile, setProfile] = useState({ nickname: '', bio: '' })
  const [savingProfile, setSavingProfile] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [password, setPassword] = useState({ oldPassword: '', newPassword: '', confirm: '' })
  const [savingPassword, setSavingPassword] = useState(false)

  useEffect(() => {
    if (!user) return
    setProfile({ nickname: user.nickname || '', bio: user.bio || '' })
  }, [user])

  const applyUser = (updated) => {
    cacheUser(updated)
    setUser(updated)
  }

  const saveProfile = async (e) => {
    e.preventDefault()
    if (!profile.nickname.trim()) {
      toast.error('请填写昵称')
      return
    }
    setSavingProfile(true)
    try {
      const updated = await api.put(
        '/api/auth/profile',
        { nickname: profile.nickname.trim(), bio: profile.bio.trim() },
        { auth: true },
      )
      applyUser(updated)
      toast.success('资料已保存')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSavingProfile(false)
    }
  }

  const uploadAvatar = async (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('请选择图片文件')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('头像不能超过 5MB')
      return
    }
    setUploadingAvatar(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const updated = await xhrUpload('/api/auth/avatar', formData, { auth: true })
      applyUser(updated)
      toast.success('头像已更新')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setUploadingAvatar(false)
    }
  }

  const savePassword = async (e) => {
    e.preventDefault()
    if (!password.oldPassword || !password.newPassword) {
      toast.error('请填写原密码与新密码')
      return
    }
    if (password.newPassword.length < 6) {
      toast.error('新密码至少 6 位')
      return
    }
    if (password.newPassword !== password.confirm) {
      toast.error('两次输入的新密码不一致')
      return
    }
    setSavingPassword(true)
    try {
      await api.put(
        '/api/auth/password',
        { oldPassword: password.oldPassword, newPassword: password.newPassword },
        { auth: true },
      )
      setPassword({ oldPassword: '', newPassword: '', confirm: '' })
      toast.success('密码已修改')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSavingPassword(false)
    }
  }

  if (!user) return null

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">个人设置</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">修改头像、昵称、简介与登录密码</p>
        </div>
        <Link to={`/user/${user.id}`} className="text-sm text-primary-500 transition hover:underline">
          查看我的主页
        </Link>
      </div>

      <section className={cardClass}>
        <h2 className="text-sm font-semibold">头像</h2>
        <div className="mt-4 flex items-center gap-4">
          <Avatar user={user} size={72} />
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploadingAvatar}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:border-primary-500/50 hover:text-primary-500 disabled:opacity-60 dark:border-white/10 dark:text-slate-300"
            >
              {uploadingAvatar ? <Spinner size={15} /> : <Upload size={15} />}
              {uploadingAvatar ? '上传中…' : '上传头像'}
            </button>
            <p className="text-xs text-slate-400">支持 JPG / PNG / WebP，不超过 5MB，会自动裁剪为正方形</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                uploadAvatar(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </div>
        </div>
      </section>

      <section className={cardClass}>
        <h2 className="text-sm font-semibold">基本资料</h2>
        <form onSubmit={saveProfile} className="mt-4 space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">用户名</span>
            <input value={user.username} disabled className={`${inputClass} opacity-60`} />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">昵称</span>
            <div className="relative">
              <UserRound size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={profile.nickname}
                onChange={(e) => setProfile((prev) => ({ ...prev, nickname: e.target.value }))}
                maxLength={24}
                placeholder="展示给其他用户的名称"
                className={`${inputClass} pl-9`}
              />
            </div>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              个人简介（{profile.bio.length}/200）
            </span>
            <textarea
              value={profile.bio}
              onChange={(e) => setProfile((prev) => ({ ...prev, bio: e.target.value }))}
              maxLength={200}
              rows={3}
              placeholder="简单介绍一下自己吧"
              className={`${inputClass} resize-y`}
            />
          </label>

          <button
            type="submit"
            disabled={savingProfile}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-600 disabled:opacity-60"
          >
            {savingProfile ? <Spinner size={16} /> : <Save size={16} />}
            保存资料
          </button>
        </form>
      </section>

      <section className={cardClass}>
        <h2 className="text-sm font-semibold">修改密码</h2>
        <form onSubmit={savePassword} className="mt-4 space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">原密码</span>
            <input
              type="password"
              value={password.oldPassword}
              onChange={(e) => setPassword((prev) => ({ ...prev, oldPassword: e.target.value }))}
              autoComplete="current-password"
              className={inputClass}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">新密码</span>
              <input
                type="password"
                value={password.newPassword}
                onChange={(e) => setPassword((prev) => ({ ...prev, newPassword: e.target.value }))}
                autoComplete="new-password"
                placeholder="至少 6 位"
                className={inputClass}
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">确认新密码</span>
              <input
                type="password"
                value={password.confirm}
                onChange={(e) => setPassword((prev) => ({ ...prev, confirm: e.target.value }))}
                autoComplete="new-password"
                className={inputClass}
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={savingPassword}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-primary-500/50 hover:text-primary-500 disabled:opacity-60 dark:border-white/10 dark:text-slate-300"
          >
            {savingPassword ? <Spinner size={16} /> : <KeyRound size={16} />}
            修改密码
          </button>
        </form>
      </section>
    </div>
  )
}
