import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CalendarDays, Heart, Images, Settings as SettingsIcon, ShieldCheck } from 'lucide-react'
import { useAuth } from '../App'
import { api } from '../lib/api'
import Avatar from '../components/Avatar'
import Skeleton from '../components/Skeleton'
import WallpaperGrid from '../components/WallpaperGrid'
import { formatDate, formatNumber } from '../lib/format'

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={16} className="shrink-0 text-slate-400" />
      <span className="text-sm text-slate-500 dark:text-slate-400">
        <span className="font-semibold text-slate-800 dark:text-slate-100">{formatNumber(value)}</span> {label}
      </span>
    </div>
  )
}

export default function UserProfile() {
  const { id } = useParams()
  const { user: me } = useAuth()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setProfile(null)

    api
      .get(`/api/users/${id}`)
      .then((data) => {
        if (!cancelled) setProfile(data)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [id])

  const isMe = Boolean(me?.id && profile?.id && me.id === profile.id)

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-20 w-20 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <Skeleton className="h-6 w-24" />
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 py-24 text-center dark:border-white/10">
        <p className="text-slate-500">{error || '用户不存在或已被删除'}</p>
        <Link
          to="/"
          className="mt-4 inline-block rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-600"
        >
          返回首页
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5 sm:flex-row sm:items-start">
        <Avatar user={profile} size={80} className="mx-auto sm:mx-0" />

        <div className="min-w-0 flex-1 space-y-3 text-center sm:text-left">
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-center">
            <h1 className="truncate text-xl font-semibold">{profile.nickname || profile.username}</h1>
            {profile.role === 'admin' ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-600 dark:bg-primary-950/60 dark:text-primary-300">
                <ShieldCheck size={12} />
                管理员
              </span>
            ) : null}
          </div>

          <p className="text-sm text-slate-400">@{profile.username}</p>

          <p className="whitespace-pre-line text-sm leading-6 text-slate-600 dark:text-slate-300">
            {profile.bio || '这个人很懒，还没有写简介~'}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 sm:justify-start">
            <Stat icon={Images} label="作品" value={profile.imageCount} />
            <Stat icon={Heart} label="收藏" value={profile.favoriteCount} />
            <span className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <CalendarDays size={16} className="shrink-0 text-slate-400" />
              加入于 {formatDate(profile.createdAt)}
            </span>
          </div>
        </div>

        {isMe ? (
          <div className="flex shrink-0 justify-center gap-2 sm:justify-end">
            <Link
              to="/settings"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:border-primary-500/50 hover:text-primary-500 dark:border-white/10 dark:text-slate-300"
            >
              <SettingsIcon size={15} />
              编辑资料
            </Link>
            <Link
              to="/favorites"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:border-primary-500/50 hover:text-primary-500 dark:border-white/10 dark:text-slate-300"
            >
              <Heart size={15} />
              我的收藏
            </Link>
          </div>
        ) : null}
      </section>

      <section>
        <h2 className="mb-3 border-b border-slate-200 pb-2 text-sm font-medium dark:border-white/5">
          {isMe ? '我的作品' : 'TA 的作品'}
        </h2>
        <WallpaperGrid
          endpoint={`/api/users/${profile.id}/images`}
          emptyText={isMe ? '你还没有上传过壁纸' : 'TA 还没有上传过壁纸'}
        />
      </section>
    </div>
  )
}
