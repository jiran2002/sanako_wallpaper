import { useCallback, useEffect, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Eye, Search, X } from 'lucide-react'
import { api } from '../../lib/api'
import { useToast } from '../../components/Toast'
import Modal from '../../components/Modal'
import Lightbox from '../../components/Lightbox'
import { RowSkeleton } from '../../components/Skeleton'
import { formatDate, formatNumber, resolutionText } from '../../lib/format'

const PAGE_SIZE = 20

const TABS = [
  { value: '2', label: '待审核' },
  { value: '3', label: '已驳回' },
]

const inputClass = 'admin-input'

export default function Audit() {
  const toast = useToast()
  const [tab, setTab] = useState('2')
  const [keywordInput, setKeywordInput] = useState('')
  const [q, setQ] = useState('')
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState([])
  const [busy, setBusy] = useState(false)
  const [previewIndex, setPreviewIndex] = useState(-1)
  // 驳回必须写原因，故先弹窗收集再提交
  const [rejectIds, setRejectIds] = useState([])
  const [rejectReason, setRejectReason] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get('/api/admin/audit', {
        auth: true,
        query: { page, pageSize: PAGE_SIZE, status: tab, q },
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
  }, [page, tab, q, toast])

  useEffect(() => {
    load()
  }, [load])

  const switchTab = (value) => {
    setTab(value)
    setPage(1)
    setQ('')
    setKeywordInput('')
  }

  const toggleSelect = (id) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  const toggleSelectAll = () => {
    setSelected((prev) => (prev.length === items.length ? [] : items.map((item) => item.id)))
  }

  const runAction = async (action, ids, reason) => {
    if (ids.length === 0) return
    setBusy(true)
    try {
      const payload = reason === undefined ? { ids } : { ids, reason }
      const res = await api.post(`/api/admin/audit/${action}`, payload, { auth: true })
      toast.success(`${action === 'approve' ? '已通过' : '已驳回'} ${res?.changed ?? ids.length} 张壁纸`)
      setRejectIds([])
      setRejectReason('')
      load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  /** 打开驳回弹窗（单个或批量共用） */
  const openReject = (ids) => {
    if (ids.length === 0) return
    setRejectReason('')
    setRejectIds(ids)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="admin-title">内容审核</h1>
          <p className="admin-subtitle">
            共 {formatNumber(total)} 张{tab === '2' ? '待审核' : '已驳回'}壁纸
          </p>
        </div>
        {selected.length > 0 ? (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => runAction('approve', selected)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-emerald-500/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Check size={15} />
              通过选中（{selected.length}）
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => openReject(selected)}
              className="admin-btn-danger disabled:opacity-60"
            >
              <X size={15} />
              驳回选中（{selected.length}）
            </button>
          </div>
        ) : null}
      </div>

      <div className="admin-card">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {TABS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => switchTab(item.value)}
              className={`rounded-xl px-3.5 py-1.5 text-sm font-medium transition ${
                tab === item.value
                  ? 'bg-primary-500 text-white'
                  : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
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
              placeholder="搜索标题 / 描述，回车确认"
              className={`${inputClass} pl-9`}
            />
          </div>
        </form>
      </div>

      {loading ? (
        <RowSkeleton rows={6} />
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 py-20 text-center text-sm text-slate-400 dark:border-white/10">
          {tab === '2' ? '暂无待审核壁纸' : '暂无已驳回壁纸'}
        </div>
      ) : (
        <div className="admin-card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="admin-table min-w-[48rem]">
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
                  <th className="px-3 py-3 font-medium">上传者</th>
                  <th className="px-3 py-3 font-medium">尺寸</th>
                  <th className="px-3 py-3 font-medium">上传时间</th>
                  <th className="px-3 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                {items.map((image, index) => (
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
                        <button type="button" onClick={() => setPreviewIndex(index)} title="查看大图">
                          <img
                            src={image.thumbUrl || image.url}
                            alt={image.title}
                            loading="lazy"
                            className="h-12 w-16 rounded-lg object-cover ring-1 ring-black/5"
                          />
                        </button>
                        <div className="min-w-0">
                          <p className="max-w-[14rem] truncate font-medium">{image.title || '未命名'}</p>
                          <p className="max-w-[14rem] truncate text-xs text-slate-400">{image.filename}</p>
                          {image.rejectReason ? (
                            <p className="max-w-[14rem] truncate text-xs text-rose-500" title={image.rejectReason}>
                              驳回原因：{image.rejectReason}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {image.uploader ? (
                        <div>
                          <p className="text-slate-600 dark:text-slate-300">{image.uploader.nickname}</p>
                          <p className="text-xs text-slate-400">@{image.uploader.username}</p>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-slate-500 dark:text-slate-400">
                      <p>{resolutionText(image.width, image.height)}</p>
                      <p className="text-xs">{image.sizeText}</p>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-400">{formatDate(image.createdAt)}</td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setPreviewIndex(index)}
                          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-primary-500/10 hover:text-primary-600 dark:hover:bg-white/10"
                          title="预览"
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => runAction('approve', [image.id])}
                          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-50 dark:hover:bg-emerald-950/40"
                          title="通过"
                        >
                          <Check size={15} />
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => openReject([image.id])}
                          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 disabled:opacity-50 dark:hover:bg-rose-950/40"
                          title="驳回"
                        >
                          <X size={15} />
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

      {/* 驳回原因：必填，会在创作者中心的「我的投稿」里展示给投稿人 */}
      <Modal
        open={rejectIds.length > 0}
        onClose={() => setRejectIds([])}
        title={`驳回 ${rejectIds.length} 张壁纸`}
        footer={
          <>
            <button type="button" onClick={() => setRejectIds([])} className="admin-btn">
              取消
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => runAction('reject', rejectIds, rejectReason)}
              className="admin-btn-danger disabled:opacity-60"
            >
              确认驳回
            </button>
          </>
        }
      >
        <label className="block space-y-1.5">
          <span className="text-sm text-slate-600 dark:text-slate-300">
            驳回原因（必填，最多 200 字）
          </span>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            maxLength={200}
            placeholder="例如：图片含有水印 / 分辨率过低 / 与站内已有壁纸重复"
            className={`${inputClass} resize-y`}
          />
          <span className="block text-right text-xs text-slate-400">{rejectReason.length} / 200</span>
        </label>
      </Modal>

      <Lightbox
        images={items}
        index={previewIndex}
        onClose={() => setPreviewIndex(-1)}
        onIndexChange={(next) => setPreviewIndex(next)}
      />
    </div>
  )
}
