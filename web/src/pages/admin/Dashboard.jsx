import { useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import {
  Cloud,
  Database,
  Download,
  Eye,
  EyeOff,
  FolderTree,
  HardDrive,
  Image as ImageIcon,
  Layers,
  ShieldAlert,
  Tags as TagsIcon,
  Users as UsersIcon,
} from 'lucide-react'
import { api } from '../../lib/api'
import { userHasPermission } from '../../lib/auth'
import { useToast } from '../../components/Toast'
import Skeleton from '../../components/Skeleton'
import { formatNumber } from '../../lib/format'

function StatCard({ icon: Icon, label, value, tone = 'primary' }) {
  const tones = {
    primary: 'bg-primary-50 text-primary-600 dark:bg-primary-500/15 dark:text-primary-300',
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
    violet: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300',
    rose: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300',
    slate: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300',
  }
  return (
    <div className="admin-card p-4">
      <div className="flex items-center gap-3">
        <span className={`grid h-10 w-10 place-items-center rounded-lg ${tones[tone]}`}>
          <Icon size={19} />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
          <p className="truncate text-lg font-semibold">{value}</p>
        </div>
      </div>
    </div>
  )
}

/** 迷你折线图：不引入第三方图表库，用 SVG polyline 近似 */
function Sparkline({ values, color }) {
  const w = 120
  const h = 36
  const max = Math.max(1, ...values)
  const stepX = w / Math.max(1, values.length - 1)
  const pts = values.map((v, i) => [i * stepX, h - (v / max) * h])
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-12 w-full">
      <polygon points={`0,${h} ${line} ${w},${h}`} fill={color} opacity="0.12" />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

function TrendCard({ label, color, values }) {
  const total = values.reduce((sum, v) => sum + (Number(v) || 0), 0)
  return (
    <div className="admin-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
        <span className="text-sm font-semibold">{formatNumber(total)}</span>
      </div>
      <Sparkline values={values} color={color} />
    </div>
  )
}

export default function Dashboard() {
  const toast = useToast()
  const { me } = useOutletContext() || {}
  const [stats, setStats] = useState(null)
  const [trend, setTrend] = useState([])
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)

  const canUpload = userHasPermission(me, 'upload')
  const canManageImages = userHasPermission(me, 'manageImages')
  const canAudit = userHasPermission(me, 'auditImages')
  const canManageUsers = userHasPermission(me, 'manageUsers')
  const canManageSettings = userHasPermission(me, 'manageSettings')

  useEffect(() => {
    if (!me) return undefined
    let cancelled = false
    // 存储账号列表需要「站点与存储设置」权限，无权限时不请求
    const requests = [
      api.get('/api/admin/stats', { auth: true }),
      api.get('/api/admin/stats-trend', { auth: true }),
    ]
    if (canManageSettings) requests.push(api.get('/api/admin/storage/accounts', { auth: true }))

    Promise.all(requests)
      .then(([statsData, trendData, accountData]) => {
        if (cancelled) return
        setStats(statsData)
        setTrend(Array.isArray(trendData?.days) ? trendData.days : [])
        setAccounts(Array.isArray(accountData) ? accountData : [])
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
  }, [me, canManageSettings, toast])

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-8 w-40" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="admin-title">仪表盘</h1>
          <p className="admin-subtitle">站点数据总览</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canAudit ? (
            <Link to="/admin/audit" className="admin-btn-primary">
              <ShieldAlert size={15} />
              内容审核
            </Link>
          ) : null}
          {canUpload ? (
            <Link to="/admin/upload" className="admin-btn">
              上传壁纸
            </Link>
          ) : null}
          {canManageImages ? (
            <Link to="/admin/images" className="admin-btn">
              壁纸管理
            </Link>
          ) : null}
        </div>
      </div>

      {stats ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard icon={ImageIcon} label="壁纸总数" value={formatNumber(stats.images)} tone="primary" />
          <StatCard icon={Layers} label="已发布" value={formatNumber(stats.published)} tone="emerald" />
          <StatCard icon={ShieldAlert} label="待审核" value={formatNumber(stats.pending)} tone="amber" />
          <StatCard icon={EyeOff} label="已隐藏" value={formatNumber(stats.hidden)} tone="slate" />
          <StatCard icon={FolderTree} label="分类数" value={formatNumber(stats.categories)} tone="violet" />
          <StatCard icon={TagsIcon} label="标签数" value={formatNumber(stats.tags)} tone="slate" />
          {canManageUsers ? (
            <StatCard icon={UsersIcon} label="用户数" value={formatNumber(stats.users)} tone="violet" />
          ) : null}
          <StatCard icon={Download} label="总下载" value={formatNumber(stats.downloads)} tone="primary" />
          <StatCard icon={Eye} label="总浏览" value={formatNumber(stats.views)} tone="emerald" />
          {canManageSettings ? (
            <StatCard
              icon={HardDrive}
              label="占用空间"
              value={stats.totalSizeText || '0 B'}
              tone="rose"
            />
          ) : null}
        </div>
      ) : null}

      {trend.length > 0 ? (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">近 {trend.length} 天趋势</h2>
            <span className="text-xs text-slate-400">
              {trend[0]?.date} 至 {trend[trend.length - 1]?.date}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <TrendCard label="下载" color="#165dff" values={trend.map((d) => d.downloads)} />
            <TrendCard label="浏览" color="#10b981" values={trend.map((d) => d.views)} />
            <TrendCard label="注册" color="#8b5cf6" values={trend.map((d) => d.registrations)} />
          </div>
        </section>
      ) : null}

      {canManageSettings ? (
        <section className="admin-card">
        <div className="mb-4 flex items-center gap-2">
          <Cloud size={18} className="text-primary-500" />
          <h2 className="font-semibold">R2 账号使用情况</h2>
          <span className="text-xs text-slate-400">（共 {accounts.length} 个账号）</span>
        </div>

        {accounts.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            还没有配置 R2 账号，
            <Link to="/admin/storage" className="text-primary-500 hover:underline">
              去添加
            </Link>
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="admin-table min-w-[36rem]">
              <thead>
                <tr className="admin-thead border-b border-slate-200/70 dark:border-white/10">
                  <th className="py-2 font-medium">名称</th>
                  <th className="py-2 font-medium">驱动</th>
                  <th className="py-2 font-medium">Bucket</th>
                  <th className="py-2 font-medium">权重</th>
                  <th className="py-2 font-medium">已用次数</th>
                  <th className="py-2 font-medium">状态</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id} className="admin-row border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                    <td className="py-2.5 font-medium">{account.name}</td>
                    <td className="py-2.5 uppercase text-slate-500 dark:text-slate-400">{account.provider}</td>
                    <td className="py-2.5 text-slate-500 dark:text-slate-400">{account.bucket || '—'}</td>
                    <td className="py-2.5 text-slate-500 dark:text-slate-400">{account.weight ?? 1}</td>
                    <td className="py-2.5">
                      <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
                        <Database size={13} />
                        {formatNumber(account.usedCount)}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`admin-badge ${
                          account.enabled
                            ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400'
                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        {account.enabled ? '启用' : '停用'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </section>
      ) : null}
    </div>
  )
}
