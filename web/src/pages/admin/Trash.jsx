import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, RotateCcw, Search, Trash2, XCircle } from 'lucide-react'
import { api } from '../../lib/api'
import { useToast } from '../../components/Toast'
import { RowSkeleton } from '../../components/Skeleton'
import { formatDate, formatNumber, resolutionText } from '../../lib/format'

const PAGE_SIZE = 20

/**
 * 回收站：删除壁纸后先进这里（软删除），可恢复或彻底删除。
 * 超过 30 天的由后台「维护任务 → 清理回收站」自动彻底删除。
 */
export default function Trash() {
  const toast = useToast()
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState([])
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get('/api/admin/images/trash', {
        auth: true,
        query: { page, pageSize: PAGE_SIZE, q: keyword },
      })
      setItems(data.items || [])
      setTotal(data.total || 0)
      setPages(data.pages || 1)
      setSelected([])
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [page, keyword, toast])

  useEffect(() => {
    load()
  }, [load])

  const toggleSelect = (id) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  const toggleSelectAll = () => {
    setSelected((prev) => (prev.length === items.length ? [] : items.map((item) => item.id)))
  }

  const restoreOne = async (image) => {
    setBusy(true)
    try {
      await api.post('/api/admin/images/restore', { ids: [image.id] }, { auth: true })
      toast.success('已恢复')
      load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const restoreSelected = async () => {
    if (selected.length === 0) return
    setBusy(true)
    try {
      const res = await api.post('/api/admin/images/restore', { ids: selected }, { auth: true })
      toast.success(`已恢复 ${res?.restored ?? selected.length} 张壁纸`)
      load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const purgeOne = async (image) => {
    if (
      !window.confirm(
        `确定彻底删除「${image.title || image.filename}」吗？文件会被一并删除，不可恢复。`,
      )
    ) {
      return
    }
    setBusy(true)
    try {
      await api.post('/api/admin/images/purge', { ids: [image.id] }, { auth: true })
      toast.success('已彻底删除')
      load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const purgeSelected = async () => {
    if (selected.length === 0) return
    if (!window.confirm(`确定彻底删除选中的 ${selected.length} 张壁纸吗？不可恢复。`)) return
    setBusy(true)
    try {
      const res = await api.post('/api/admin/images/purge', { ids: selected }, { auth: true })
      toast.success(`已彻底删除 ${res?.purged ?? selected.length} 张壁纸`)
      load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="admin-title">回收站</h1>
          <p className="admin-subtitle">
            共 {formatNumber(total)} 张已删除壁纸 · 超过 30 天将被自动彻底删除
          </p>
        </div>
        {selected.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={restoreSelected} disabled={busy} className="admin-btn">
              <RotateCcw size={15} />
              恢复选中（{selected.length}）
            </button>
            <button
              type="button"
              onClick={purgeSelected}
              disabled={busy}
              className="admin-btn-danger"
            >
              <Trash2 size={15} />
              彻底删除（{selected.length}）
            </button>
          </div>
        ) : null}
      </div>

      {/* 筛选栏 */}
      <div className="admin-card">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setPage(1)
            setKeyword(keywordInput.trim())
          }}
        >
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              placeholder="搜索标题 / 文件名，回车确认"
              className="admin-input pl-9"
            />
          </div>
        </form>
      </div>

      {loading ? (
        <RowSkeleton rows={6} />
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 py-20 text-center text-sm text-slate-400 dark:border-white/10">
          回收站是空的
        </div>
      ) : (
        <div className="admin-card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="admin-table min-w-[46rem]">
              <thead className="admin-thead">
                <tr>
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selected.length === items.length && items.length > 0}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-slate-300 text-primary-500 focus:ring-primary-400"
                    />
                  </th>
                  <th className="px-3 py-3 font-medium">壁纸</th>
                  <th className="px-3 py-3 font-medium">分类</th>
                  <th className="px-3 py-3 font-medium">尺寸</th>
                  <th className="px-3 py-3 font-medium">上传者</th>
                  <th className="px-3 py-3 font-medium">删除时间</th>
                  <th className="px-3 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                {items.map((image) => (
                  <tr key={image.id} className="admin-row">
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selected.includes(image.id)}
                        onChange={() => toggleSelect(image.id)}
                        className="h-4 w-4 rounded border-slate-300 text-primary-500 focus:ring-primary-400"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={image.thumbUrl || image.url}
                          alt={image.title}
                          loading="lazy"
                          className="h-12 w-16 rounded-lg object-cover ring-1 ring-black/5"
                        />
                        <div className="min-w-0">
                          <p className="max-w-[14rem] truncate font-medium">{image.title || '未命名'}</p>
                          <p className="max-w-[14rem] truncate text-xs text-slate-400">{image.filename}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-600 dark:text-slate-300">
                      {image.category?.name || '未分类'}
                    </td>
                    <td className="px-3 py-3 text-slate-500 dark:text-slate-400">
                      <p>{resolutionText(image.width, image.height)}</p>
                      <p className="text-xs">{image.sizeText}</p>
                    </td>
                    <td className="px-3 py-3 text-slate-500 dark:text-slate-400">
                      {image.uploader?.nickname || '—'}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-400">{formatDate(image.updatedAt)}</td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => restoreOne(image)}
                          disabled={busy}
                          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-primary-500/10 hover:text-primary-600 disabled:opacity-40 dark:hover:bg-white/10"
                          title="恢复"
                        >
                          <RotateCcw size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => purgeOne(image)}
                          disabled={busy}
                          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 disabled:opacity-40 dark:hover:bg-rose-950/40"
                          title="彻底删除"
                        >
                          <XCircle size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 分页 */}
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