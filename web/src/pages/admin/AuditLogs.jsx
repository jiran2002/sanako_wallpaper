import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { api } from '../../lib/api'
import { useToast } from '../../components/Toast'
import { RowSkeleton } from '../../components/Skeleton'
import { formatDate, formatNumber } from '../../lib/format'

const PAGE_SIZE = 20

/** 失败的操作在动作里带了「（失败 xxx）」，单独标红 */
function actionClass(action) {
  return action.includes('失败')
    ? 'text-rose-600 dark:text-rose-400'
    : 'text-slate-700 dark:text-slate-200'
}

export default function AuditLogs() {
  const toast = useToast()
  const [keywordInput, setKeywordInput] = useState('')
  const [q, setQ] = useState('')
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get('/api/admin/audit-logs', {
        auth: true,
        query: { page, pageSize: PAGE_SIZE, q },
      })
      setItems(data?.items || [])
      setTotal(data?.total || 0)
      setPages(data?.pages || 1)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [page, q, toast])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="admin-title">操作日志</h1>
        <p className="admin-subtitle">共 {formatNumber(total)} 条记录，自动记录后台的新增、修改与删除操作</p>
      </div>

      <div className="admin-card">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setPage(1)
            setQ(keywordInput.trim())
          }}
        >
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              placeholder="搜索操作人 / 动作 / 对象，回车确认"
              className="admin-input pl-9"
            />
          </div>
        </form>
      </div>

      {loading ? (
        <RowSkeleton rows={6} />
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 py-20 text-center text-sm text-slate-400 dark:border-white/10">
          暂无操作记录
        </div>
      ) : (
        <div className="admin-card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="admin-table min-w-[52rem]">
              <thead className="admin-thead">
                <tr>
                  <th className="px-3 py-3 font-medium">时间</th>
                  <th className="px-3 py-3 font-medium">操作人</th>
                  <th className="px-3 py-3 font-medium">动作</th>
                  <th className="px-3 py-3 font-medium">对象</th>
                  <th className="px-3 py-3 font-medium">详情</th>
                  <th className="px-3 py-3 font-medium">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                {items.map((log) => (
                  <tr key={log.id} className="admin-row align-top">
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-400">
                      {formatDate(log.createdAt)}
                    </td>
                    <td className="px-3 py-3 text-slate-600 dark:text-slate-300">
                      {log.actorName || '—'}
                    </td>
                    <td className={`px-3 py-3 ${actionClass(log.action)}`}>{log.action}</td>
                    <td className="px-3 py-3 text-slate-500 dark:text-slate-400">
                      {log.targetId ? `#${log.targetId}` : '—'}
                    </td>
                    <td className="max-w-[24rem] px-3 py-3">
                      {log.detail ? (
                        <code className="block break-all rounded bg-slate-50 px-2 py-1 text-xs text-slate-500 dark:bg-white/5 dark:text-slate-400">
                          {log.detail}
                        </code>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-400">{log.ip || '—'}</td>
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