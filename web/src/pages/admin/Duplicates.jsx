import { useCallback, useEffect, useState } from 'react'
import { Copy, Layers, Trash2 } from 'lucide-react'
import { api } from '../../lib/api'
import { useToast } from '../../components/Toast'
import { RowSkeleton } from '../../components/Skeleton'
import { formatBytes, formatDate, formatNumber, resolutionText } from '../../lib/format'

/**
 * 重复壁纸：后端按 dHash 相似度把「同一张图重复上传」的壁纸聚成组，
 * 组内按上传时间升序排列，最早那张是保留候选，其余视为冗余。
 * 删除只做软删除（进回收站），确认没问题再在回收站里彻底删除。
 */
export default function Duplicates() {
  const toast = useToast()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/api/admin/images/duplicates', { auth: true })
      setData(res || null)
      setSelected([])
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const groups = data?.groups || []

  const toggleSelect = (id) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  /** 一键选中所有组的冗余项（每组保留最早上传的那张） */
  const selectRedundant = () => {
    const ids = []
    for (const group of groups) {
      for (const item of group.items.slice(1)) ids.push(item.id)
    }
    setSelected(ids)
    if (ids.length === 0) toast.info('当前没有可清理的重复项')
  }

  const removeSelected = async () => {
    if (selected.length === 0) return
    if (!window.confirm(`确定删除选中的 ${selected.length} 张重复壁纸吗？会先移入回收站，可在回收站恢复。`)) return
    setBusy(true)
    try {
      const res = await api.post('/api/admin/images/batch-delete', { ids: selected }, { auth: true })
      toast.success(`已移入回收站 ${res?.deleted ?? selected.length} 张`)
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
          <h1 className="admin-title">重复壁纸</h1>
          <p className="admin-subtitle">
            {data
              ? `${formatNumber(data.groupCount)} 组 · ${formatNumber(data.imageCount)} 张相似壁纸，可回收约 ${formatBytes(data.wastedBytes)}`
              : '按图片指纹（dHash）找出重复上传的壁纸'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={selectRedundant} disabled={loading || busy} className="admin-btn">
            <Copy size={15} />
            选中各组冗余项
          </button>
          {selected.length > 0 ? (
            <>
              <button type="button" onClick={() => setSelected([])} disabled={busy} className="admin-btn">
                清空选择
              </button>
              <button type="button" onClick={removeSelected} disabled={busy} className="admin-btn-danger">
                <Trash2 size={15} />
                删除选中（{selected.length}）
              </button>
            </>
          ) : null}
        </div>
      </div>

      <p className="text-xs text-slate-400">
        每组按上传时间升序排列，<span className="text-slate-500 dark:text-slate-300">第一张默认保留</span>
        ，其余为冗余项。删除会先移入回收站，确认无误后可在回收站里彻底删除。
      </p>

      {loading ? (
        <RowSkeleton rows={6} />
      ) : groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 py-20 text-center text-sm text-slate-400 dark:border-white/10">
          没有发现重复壁纸
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group, index) => (
            <section key={group.items[0]?.id ?? index} className="admin-card space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
                  <Layers size={15} className="text-slate-400" />
                  第 {index + 1} 组 · {group.count} 张
                </h2>
                <span className="text-xs text-slate-400">
                  可回收约 {formatBytes(group.wastedBytes)}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {group.items.map((image, itemIndex) => (
                  <label
                    key={image.id}
                    className={`flex cursor-pointer gap-3 rounded-xl border p-2 transition ${
                      selected.includes(image.id)
                        ? 'border-rose-300 bg-rose-50/60 dark:border-rose-500/40 dark:bg-rose-950/30'
                        : 'border-slate-200 hover:border-primary-500/40 dark:border-white/10'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(image.id)}
                      onChange={() => toggleSelect(image.id)}
                      className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-primary-500 focus:ring-primary-400"
                    />
                    <img
                      src={image.thumbUrl || image.url}
                      alt={image.title || '壁纸'}
                      loading="lazy"
                      className="h-20 w-20 shrink-0 rounded-lg object-cover ring-1 ring-black/5"
                    />
                    <div className="min-w-0 flex-1 text-xs">
                      <p className="truncate text-sm font-medium">{image.title || '未命名'}</p>
                      <p className="truncate text-slate-400">{image.filename}</p>
                      <p className="mt-1 text-slate-500 dark:text-slate-400">
                        {resolutionText(image.width, image.height)} · {image.sizeText}
                      </p>
                      <p className="text-slate-400">{formatDate(image.createdAt)}</p>
                      {itemIndex === 0 ? (
                        <span className="mt-1 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                          最早上传
                        </span>
                      ) : null}
                    </div>
                  </label>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}