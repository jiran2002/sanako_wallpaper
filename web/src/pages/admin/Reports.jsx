import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Link as LinkIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { useToast } from '../../components/Toast'
import { RowSkeleton } from '../../components/Skeleton'
import { formatDate, formatNumber } from '../../lib/format'

const PAGE_SIZE = 20

const STATUS_TABS = [
  { value: '', label: '全部' },
  { value: '0', label: '待处理' },
  { value: '1', label: '已下架' },
  { value: '2', label: '已忽略' },
]

export default function Reports() {
  const toast = useToast()
  const [status, setStatus] = useState('')
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get('/api/admin/reports', {
        auth: true,
        query: { page, pageSize: PAGE_SIZE, status },
      })
      setItems(data?.items || [])
      setTotal(data?.total || 0)
      setPages(data?.pages || 1)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [page, status, toast])

  useEffect(() => {
    load()
  }, [load])

  const handleAction = async (report, nextStatus) => {
    setBusyId(report.id)
    try {
      await api.post(`/api/admin/reports/${report.id}/action`, { status: nextStatus }, { auth: true })
      toast.success(nextStatus === 1 ? '已下架该壁纸' : nextStatus === 2 ? '已忽略该举报' : '已恢复待处理')
      load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="admin-title">举报管理</h1>
        <p className="admin-subtitle">共 {formatNumber(total)} 条举报，「下架」会同步隐藏被举报壁纸</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value || 'all'}
            type="button"
            onClick={() => {
              setStatus(tab.value)
              setPage(1)
            }}
            className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
              status === tab.value
                ? 'border-primary-500 bg-primary-50 text-primary-600 dark:border-primary-500/60 dark:bg-primary-500/15 dark:text-primary-300'
                : 'border-slate-200 text-slate-500 hover:border-primary-300 hover:text-primary-500 dark:border-white/10 dark:text-slate-400'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <RowSkeleton rows={6} />
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 py-20 text-center text-sm text-slate-400 dark:border-white/10">
          暂无举报
        </div>
      ) : (
        <div className="admin-card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="admin-table min-w-[56rem]">
              <thead className="admin-thead">
                <tr>
                  <th className="px-3 py-3 font-medium">壁纸</th>
                  <th className="px-3 py-3 font-medium">举报原因</th>
                  <th className="px-3 py-3 font-medium">举报人</th>
                  <th className="px-3 py-3 font-medium">时间</th>
                  <th className="px-3 py-3 font-medium">状态</th>
                  <th className="px-3 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                {items.map((report) => (
                  <tr key={report.id} className="admin-row">
                    <td className="px-3 py-3">
                      {report.image ? (
                        <Link
                          to={`/image/${report.image.id}`}
                          target="_blank"
                          className="flex items-center gap-3"
                        >
                          <img
                            src={report.image.thumbUrl || report.image.url}
                            alt=""
                            loading="lazy"
                            className="h-12 w-12 shrink-0 rounded-lg object-cover ring-1 ring-black/5"
                          />
                          <span className="min-w-0 max-w-[16rem] truncate text-slate-600 transition hover:text-primary-500 dark:text-slate-300">
                            {report.image.title || `#${report.image.id}`}
                          </span>
                        </Link>
                      ) : (
                        <span className="text-slate-400">壁纸已删除</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-medium">{report.reason}</p>
                      {report.detail ? (
                        <p className="mt-0.5 line-clamp-2 max-w-[16rem] whitespace-pre-line text-xs text-slate-400">
                          {report.detail}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-slate-600 dark:text-slate-300">
                      {report.reporter ? `@${report.reporter.username}` : '—'}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-400">{formatDate(report.createdAt)}</td>
                    <td className="px-3 py-3">
                      <span
                        className={`admin-badge ${
                          report.status === 0
                            ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400'
                            : report.status === 1
                              ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400'
                              : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        {report.statusText}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-1.5">
                        {report.status !== 1 ? (
                          <button
                            type="button"
                            disabled={busyId === report.id}
                            onClick={() => handleAction(report, 1)}
                            className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs text-rose-600 transition hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/60 dark:text-rose-400 dark:hover:bg-rose-950/40"
                          >
                            下架
                          </button>
                        ) : null}
                        {report.status !== 2 ? (
                          <button
                            type="button"
                            disabled={busyId === report.id}
                            onClick={() => handleAction(report, 2)}
                            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-500 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5"
                          >
                            忽略
                          </button>
                        ) : null}
                        {report.status !== 0 ? (
                          <button
                            type="button"
                            disabled={busyId === report.id}
                            onClick={() => handleAction(report, 0)}
                            className="rounded-lg p-1.5 text-slate-400 transition hover:text-primary-500 disabled:opacity-50"
                            title="恢复待处理"
                          >
                            <LinkIcon size={14} />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pages > 1 ? (
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            className="admin-btn disabled:opacity-40"
          >
            <ChevronLeft size={15} />
            上一页
          </button>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {page} / {pages}
          </span>
          <button
            type="button"
            disabled={page >= pages || loading}
            onClick={() => setPage((prev) => Math.min(pages, prev + 1))}
            className="admin-btn disabled:opacity-40"
          >
            下一页
            <ChevronRight size={15} />
          </button>
        </div>
      ) : null}
    </div>
  )
}