import { Fragment, useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  Layers,
  Link2,
  Pencil,
  Plus,
  Search,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react'
import { useAuth } from '../App'
import { api } from '../lib/api'
import { userHasPermission } from '../lib/auth'
import { useToast } from '../components/Toast'
import Lightbox from '../components/Lightbox'
import Modal from '../components/Modal'
import { RowSkeleton } from '../components/Skeleton'
import { formatDate, formatNumber, resolutionText } from '../lib/format'

const PAGE_SIZE = 20

const STATUS_TEXT = { 0: '已隐藏', 1: '已发布', 2: '待审核', 3: '已驳回' }
const STATUS_CLASS = {
  0: 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300',
  1: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300',
  2: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300',
  3: 'bg-rose-50 text-rose-500 dark:bg-rose-950/40 dark:text-rose-300',
}

const MY_FILTERS = [
  { value: '', label: '全部' },
  { value: '1', label: '已发布' },
  { value: '2', label: '待审核' },
  { value: '3', label: '已驳回' },
  { value: '0', label: '已隐藏' },
]

const cardClass =
  'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.03]'
const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30 dark:border-white/10 dark:bg-white/5 dark:text-slate-100'
const ghostBtn =
  'inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 transition hover:border-primary-400 hover:text-primary-500 disabled:opacity-50 dark:border-white/10 dark:text-slate-300'
const primaryBtn =
  'inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary-500 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-primary-600 disabled:opacity-50'
const dangerBtn =
  'inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-100 disabled:opacity-50 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300'

/** 概览里的一个统计小块 */
function Stat({ label, value, tone = 'slate' }) {
  const tones = {
    slate: 'text-slate-700 dark:text-slate-100',
    primary: 'text-primary-600 dark:text-primary-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    amber: 'text-amber-600 dark:text-amber-400',
    rose: 'text-rose-500',
  }
  return (
    <div className={cardClass}>
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${tones[tone]}`}>{formatNumber(value)}</p>
    </div>
  )
}

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CLASS[status] || STATUS_CLASS[0]}`}>
      {STATUS_TEXT[status] || '未知'}
    </span>
  )
}

/** 我的投稿里的网盘链接编辑器（可增删行） */
function MirrorEditor({ value, onChange }) {
  const rows = value || []
  const patch = (index, next) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...next } : row)))
  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2">
          <input
            value={row.name}
            onChange={(e) => patch(index, { name: e.target.value })}
            placeholder="网盘名称"
            className={`${inputClass} w-28`}
          />
          <input
            value={row.url}
            onChange={(e) => patch(index, { url: e.target.value })}
            placeholder="https:// 分享链接"
            className={`${inputClass} min-w-[12rem] flex-1`}
          />
          <input
            value={row.code}
            onChange={(e) => patch(index, { code: e.target.value })}
            placeholder="提取码"
            className={`${inputClass} w-24`}
          />
          <button
            type="button"
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
            className={`${ghostBtn} px-2`}
            title="删除该条"
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, { name: '', url: '', code: '' }])}
        className={ghostBtn}
      >
        <Plus size={14} />
        添加网盘链接
      </button>
    </div>
  )
}

export default function Creator() {
  const toast = useToast()
  const { user } = useAuth()
  const canAudit = userHasPermission(user, 'auditImages')

  const [tab, setTab] = useState('mine')
  const [overview, setOverview] = useState(null)
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [keywordInput, setKeywordInput] = useState('')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState([])
  const [busy, setBusy] = useState(false)
  const [previewIndex, setPreviewIndex] = useState(-1)
  // 正在编辑的行：{ id, title, description, mirrors }
  const [editing, setEditing] = useState(null)
  // 驳回必须写原因，故先弹窗收集再提交
  const [rejectIds, setRejectIds] = useState([])
  const [rejectReason, setRejectReason] = useState('')

  const loadOverview = useCallback(async () => {
    try {
      setOverview(await api.get('/api/creator/overview', { auth: true }))
    } catch (err) {
      toast.error(err.message)
    }
  }, [toast])

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const path = tab === 'audit' ? '/api/creator/audit' : '/api/creator/uploads'
      const data = await api.get(path, {
        auth: true,
        query: { page, pageSize: PAGE_SIZE, q, status: tab === 'audit' ? undefined : status },
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
  }, [tab, page, q, status, toast])

  useEffect(() => {
    loadOverview()
  }, [loadOverview])

  useEffect(() => {
    loadList()
  }, [loadList])

  const switchTab = (next) => {
    if (next === tab) return
    setTab(next)
    setPage(1)
    setQ('')
    setKeywordInput('')
    setStatus('')
    setEditing(null)
  }

  const toggleSelect = (id) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))

  const toggleSelectAll = () =>
    setSelected((prev) => (prev.length === items.length ? [] : items.map((item) => item.id)))

  const runAudit = async (action, ids, reason) => {
    if (ids.length === 0) return
    setBusy(true)
    try {
      const payload = reason === undefined ? { ids } : { ids, reason }
      const res = await api.post(`/api/creator/audit/${action}`, payload, { auth: true })
      toast.success(`${action === 'approve' ? '已通过' : '已驳回'} ${res?.changed ?? ids.length} 张壁纸`)
      setRejectIds([])
      setRejectReason('')
      await Promise.all([loadList(), loadOverview()])
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  /** 打开驳回弹窗（单个或批量共用）：驳回必须写原因 */
  const openReject = (ids) => {
    if (ids.length === 0) return
    setRejectReason('')
    setRejectIds(ids)
  }

  const startEdit = (image) =>
    setEditing({
      id: image.id,
      title: image.title || '',
      description: image.description || '',
      mirrors: (image.mirrors || []).map((mirror) => ({
        name: mirror.name || '',
        url: mirror.url || '',
        code: mirror.code || '',
      })),
    })

  const saveEdit = async () => {
    if (!editing) return
    if (!editing.title.trim()) {
      toast.error('标题不能为空')
      return
    }
    setBusy(true)
    try {
      await api.patch(
        `/api/creator/images/${editing.id}`,
        {
          title: editing.title.trim(),
          description: editing.description,
          mirrors: editing.mirrors.filter((mirror) => mirror.url.trim()),
        },
        { auth: true },
      )
      toast.success('已保存修改')
      setEditing(null)
      await loadList()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const removeImage = async (image) => {
    if (!window.confirm(`确定删除「${image.title || '未命名'}」吗？该操作不可恢复。`)) return
    setBusy(true)
    try {
      await api.del(`/api/creator/images/${image.id}`, { auth: true })
      toast.success('已删除')
      await Promise.all([loadList(), loadOverview()])
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const my = overview?.my

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            创作者中心
            <Layers size={18} className="text-primary-500" />
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            管理自己的投稿{canAudit ? '，并审核其他作者提交的壁纸' : ''}
          </p>
        </div>
        <Link to="/upload" className={primaryBtn}>
          <UploadCloud size={15} />
          发布壁纸
        </Link>
      </header>

      {/* 概览 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="我的投稿" value={my?.total ?? 0} tone="primary" />
        <Stat label="已发布" value={my?.published ?? 0} tone="emerald" />
        <Stat label="待审核" value={my?.pending ?? 0} tone="amber" />
        <Stat label="已驳回" value={my?.rejected ?? 0} tone="rose" />
        <Stat label="总下载" value={my?.downloads ?? 0} />
        <Stat label="全站待审" value={overview?.pendingTotal ?? 0} tone="amber" />
      </div>

      {/* 选项卡 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => switchTab('mine')}
          className={`rounded-xl px-3.5 py-1.5 text-sm font-medium transition ${
            tab === 'mine'
              ? 'bg-primary-500 text-white'
              : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10'
          }`}
        >
          我的投稿
        </button>
        {canAudit ? (
          <button
            type="button"
            onClick={() => switchTab('audit')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-sm font-medium transition ${
              tab === 'audit'
                ? 'bg-primary-500 text-white'
                : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10'
            }`}
          >
            待审队列
            {overview?.pendingTotal ? (
              <span className="rounded-full bg-amber-400/90 px-1.5 text-[11px] text-white tabular-nums">
                {overview.pendingTotal}
              </span>
            ) : null}
          </button>
        ) : null}
      </div>

      {/* 我的投稿：状态筛选 */}
      {tab === 'mine' ? (
        <div className={`${cardClass} flex flex-wrap items-center gap-1.5`}>
          {MY_FILTERS.map((item) => (
            <button
              key={item.value || 'all'}
              type="button"
              onClick={() => {
                setStatus(item.value)
                setPage(1)
              }}
              className={`rounded-xl px-3 py-1.5 text-sm transition ${
                status === item.value
                  ? 'bg-primary-50 font-medium text-primary-600 dark:bg-primary-500/10 dark:text-primary-300'
                  : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {/* 搜索 + 批量操作 */}
      <div className={`${cardClass} space-y-3`}>
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

        {tab === 'audit' && selected.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => runAudit('approve', selected)} className={primaryBtn}>
              <Check size={15} />
              通过选中（{selected.length}）
            </button>
            <button type="button" disabled={busy} onClick={() => openReject(selected)} className={dangerBtn}>
              <X size={15} />
              驳回选中（{selected.length}）
            </button>
          </div>
        ) : null}
      </div>

      {/* 列表 */}
      {loading ? (
        <RowSkeleton rows={6} />
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 py-20 text-center text-sm text-slate-400 dark:border-white/10">
          {tab === 'audit' ? '暂无待审核壁纸' : status ? `暂无「${STATUS_TEXT[status]}」的投稿` : '还没有投稿，去发布第一张吧'}
        </div>
      ) : (
        <div className={`${cardClass} overflow-hidden p-0`}>
          <div className="overflow-x-auto">
            <table className="min-w-[52rem] w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/70 text-left text-xs text-slate-500 dark:border-white/5 dark:bg-white/[0.02] dark:text-slate-400">
                <tr>
                  {tab === 'audit' ? (
                    <th className="w-10 px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selected.length === items.length && items.length > 0}
                        onChange={toggleSelectAll}
                        className="h-4 w-4 accent-primary-500"
                      />
                    </th>
                  ) : null}
                  <th className="px-3 py-3 font-medium">壁纸</th>
                  {tab === 'audit' ? <th className="px-3 py-3 font-medium">上传者</th> : null}
                  <th className="px-3 py-3 font-medium">状态</th>
                  <th className="px-3 py-3 font-medium">尺寸</th>
                  <th className="px-3 py-3 font-medium">浏览 / 下载</th>
                  <th className="px-3 py-3 font-medium">上传时间</th>
                  <th className="px-3 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {items.map((image, index) => (
                  <Fragment key={image.id}>
                    <tr className="transition hover:bg-slate-50/70 dark:hover:bg-white/[0.03]">
                      {tab === 'audit' ? (
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={selected.includes(image.id)}
                            onChange={() => toggleSelect(image.id)}
                            className="h-4 w-4 accent-primary-500"
                          />
                        </td>
                      ) : null}
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-3">
                          <button type="button" onClick={() => setPreviewIndex(index)} title="查看大图">
                            <img
                              src={image.thumbUrl || image.url}
                              alt={image.title || '壁纸'}
                              loading="lazy"
                              className="h-12 w-16 rounded-lg object-cover ring-1 ring-black/5"
                            />
                          </button>
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5">
                              <span className="max-w-[14rem] truncate font-medium">{image.title || '未命名'}</span>
                              {image.kind === 'video' ? (
                                <span className="shrink-0 rounded bg-slate-900/[0.06] px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-white/10 dark:text-slate-300">
                                  视频
                                </span>
                              ) : null}
                              {image.packId ? (
                                <span className="shrink-0 rounded bg-primary-50 px-1.5 py-0.5 text-[10px] text-primary-600 dark:bg-primary-500/10 dark:text-primary-300">
                                  图包
                                </span>
                              ) : null}
                            </p>
                            <p className="max-w-[14rem] truncate text-xs text-slate-400">{image.filename}</p>
                            {/* 被驳回时把审核意见直接展示给投稿人 */}
                            {image.rejectReason ? (
                              <p className="max-w-[14rem] truncate text-xs text-rose-500" title={image.rejectReason}>
                                驳回原因：{image.rejectReason}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      {tab === 'audit' ? (
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
                      ) : null}
                      <td className="px-3 py-3">
                        <StatusBadge status={image.status} />
                      </td>
                      <td className="px-3 py-3 text-slate-500 dark:text-slate-400">
                        <p>{resolutionText(image.width, image.height)}</p>
                        <p className="text-xs">{image.sizeText}</p>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-400 tabular-nums">
                        {formatNumber(image.views)} / {formatNumber(image.downloads)}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-400">{formatDate(image.createdAt)}</td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setPreviewIndex(index)}
                            title="预览"
                            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-primary-500/10 hover:text-primary-600 dark:hover:bg-white/10"
                          >
                            <Eye size={15} />
                          </button>
                          {tab === 'audit' ? (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => runAudit('approve', [image.id])}
                                title="通过"
                                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-50 dark:hover:bg-emerald-950/40"
                              >
                                <Check size={15} />
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => openReject([image.id])}
                                title="驳回"
                                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 disabled:opacity-50 dark:hover:bg-rose-950/40"
                              >
                                <X size={15} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => startEdit(image)}
                                title="编辑文案与网盘链接"
                                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-primary-500/10 hover:text-primary-600 disabled:opacity-50 dark:hover:bg-white/10"
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => removeImage(image)}
                                title="删除"
                                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 disabled:opacity-50 dark:hover:bg-rose-950/40"
                              >
                                <Trash2 size={15} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>

                    {editing?.id === image.id ? (
                      <tr className="bg-slate-50/70 dark:bg-white/[0.02]">
                        <td colSpan={tab === 'audit' ? 8 : 7} className="px-4 py-4">
                          <div className="space-y-3">
                            <div className="grid gap-3 md:grid-cols-2">
                              <label className="space-y-1">
                                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">标题</span>
                                <input
                                  value={editing.title}
                                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                                  className={inputClass}
                                />
                              </label>
                              <label className="space-y-1">
                                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">描述</span>
                                <input
                                  value={editing.description}
                                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                                  className={inputClass}
                                />
                              </label>
                            </div>

                            <div className="space-y-1.5">
                              <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                                <Link2 size={13} />
                                网盘下载链接
                              </span>
                              <MirrorEditor
                                value={editing.mirrors}
                                onChange={(mirrors) => setEditing({ ...editing, mirrors })}
                              />
                            </div>

                            <div className="flex gap-2">
                              <button type="button" disabled={busy} onClick={saveEdit} className={primaryBtn}>
                                <Check size={15} />
                                保存
                              </button>
                              <button type="button" onClick={() => setEditing(null)} className={ghostBtn}>
                                取消
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
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
            className={`${ghostBtn} disabled:opacity-40`}
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
            className={`${ghostBtn} disabled:opacity-40`}
          >
            下一页
            <ChevronRight size={15} />
          </button>
        </div>
      ) : null}

      {/* 驳回原因：必填，投稿人会在「我的投稿」里看到 */}
      <Modal
        open={rejectIds.length > 0}
        onClose={() => setRejectIds([])}
        title={`驳回 ${rejectIds.length} 张壁纸`}
        footer={
          <>
            <button type="button" onClick={() => setRejectIds([])} className={ghostBtn}>
              取消
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => runAudit('reject', rejectIds, rejectReason)}
              className={`${dangerBtn} disabled:opacity-60`}
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
