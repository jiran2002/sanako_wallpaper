import { useCallback, useEffect, useState } from 'react'
import { Play, RefreshCw } from 'lucide-react'
import { api } from '../../lib/api'
import { useToast } from '../../components/Toast'
import Spinner from '../../components/Spinner'
import { RowSkeleton } from '../../components/Skeleton'
import { formatDate, formatNumber } from '../../lib/format'

/** 任务状态 → 文案与配色 */
const STATUS = {
  running: { text: '执行中', className: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10' },
  success: { text: '成功', className: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10' },
  failed: { text: '失败', className: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10' },
}

const TRIGGER_TEXT = { manual: '手动', schedule: '定时' }

export default function Tasks() {
  const toast = useToast()
  const [tasks, setTasks] = useState([])
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(true)
  const [runningKey, setRunningKey] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [taskData, runData] = await Promise.all([
        api.get('/api/admin/tasks', { auth: true }),
        api.get('/api/admin/task-runs', { auth: true, query: { limit: 30 } }),
      ])
      setTasks(taskData?.tasks || [])
      setRuns(Array.isArray(runData) ? runData : [])
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  /** 立即执行某个任务；执行完刷新列表与历史 */
  const runNow = async (task) => {
    setRunningKey(task.key)
    try {
      const res = await api.post(`/api/admin/tasks/${task.key}/run`, {}, { auth: true })
      toast.success(res?.detail || `${task.name} 已完成`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setRunningKey('')
      load()
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="admin-title">维护任务</h1>
          <p className="admin-subtitle">数据库备份与孤儿文件清理每天自动执行一次，也可以在这里手动触发</p>
        </div>
        <button type="button" onClick={load} disabled={loading} className="admin-btn disabled:opacity-50">
          <RefreshCw size={15} />
          刷新
        </button>
      </div>

      {loading && tasks.length === 0 ? (
        <RowSkeleton rows={4} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {tasks.map((task) => {
            const status = task.lastRun ? STATUS[task.lastRun.status] : null
            return (
              <div key={task.key} className="admin-card space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 dark:text-slate-100">{task.name}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{task.description}</p>
                  </div>
                  <button
                    type="button"
                    disabled={Boolean(runningKey)}
                    onClick={() => runNow(task)}
                    className="admin-btn-primary shrink-0 disabled:opacity-60"
                  >
                    {runningKey === task.key ? <Spinner size={15} /> : <Play size={15} />}
                    立即执行
                  </button>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  {status ? (
                    <span className={`rounded-full px-2 py-0.5 font-medium ${status.className}`}>{status.text}</span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 dark:bg-white/10">未执行</span>
                  )}
                  <span>{task.lastRun ? formatDate(task.lastRun.finished_at || task.lastRun.started_at) : ''}</span>
                </div>
                {task.lastRun?.detail ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">{task.lastRun.detail}</p>
                ) : null}
              </div>
            )
          })}
        </div>
      )}

      <div className="admin-card overflow-hidden p-0">
        <div className="border-b border-slate-100 px-4 py-3 text-sm font-medium text-slate-700 dark:border-white/10 dark:text-slate-200">
          执行历史
        </div>
        {runs.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400">暂无执行记录</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="admin-table min-w-[46rem]">
              <thead className="admin-thead">
                <tr>
                  <th className="px-3 py-3 font-medium">任务</th>
                  <th className="px-3 py-3 font-medium">触发</th>
                  <th className="px-3 py-3 font-medium">状态</th>
                  <th className="px-3 py-3 font-medium">结果</th>
                  <th className="px-3 py-3 font-medium">时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                {runs.map((run) => {
                  const status = STATUS[run.status] || { text: run.status, className: '' }
                  const name = tasks.find((t) => t.key === run.task)?.name || run.task
                  return (
                    <tr key={run.id} className="admin-row">
                      <td className="px-3 py-3 text-slate-700 dark:text-slate-200">{name}</td>
                      <td className="px-3 py-3 text-slate-500 dark:text-slate-400">
                        {TRIGGER_TEXT[run.trigger] || run.trigger}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}>
                          {status.text}
                        </span>
                      </td>
                      <td className="max-w-[22rem] px-3 py-3 text-xs text-slate-500 dark:text-slate-400">
                        {run.detail || '—'}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-400">
                        {formatDate(run.finishedAt || run.startedAt)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400">
        共 {formatNumber(runs.length)} 条执行记录（仅展示最近 30 条）
      </p>
    </div>
  )
}