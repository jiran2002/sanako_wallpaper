import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Eye, Film, Link2, Pencil, Plus, Search, SlidersHorizontal, Trash2, X } from 'lucide-react'
import { api } from '../../lib/api'
import { useToast } from '../../components/Toast'
import Modal from '../../components/Modal'
import CategoryOptions from '../../components/CategoryOptions'
import Spinner from '../../components/Spinner'
import Lightbox from '../../components/Lightbox'
import { RowSkeleton } from '../../components/Skeleton'
import { formatDate, formatNumber, resolutionText } from '../../lib/format'

const PAGE_SIZE = 20

/** 状态 → 展示文案与配色（0 隐藏 / 1 发布 / 2 待审 / 3 驳回） */
const STATUS_META = {
  0: { text: '已隐藏', className: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' },
  1: {
    text: '已发布',
    className: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400',
  },
  2: { text: '待审核', className: 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400' },
  3: { text: '已驳回', className: 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400' },
}

const inputClass = 'admin-input'

/** 网盘链接行：名称 / 链接 / 提取码 */
const emptyMirror = () => ({ name: '', url: '', code: '' })

/** 读取图片已有的网盘链接，容错成统一结构 */
const readMirrors = (value) =>
  Array.isArray(value)
    ? value.map((m) => ({ name: m?.name || '', url: m?.url || '', code: m?.code || '' }))
    : []

export default function Images() {
  const toast = useToast()
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const [categories, setCategories] = useState([])
  const [tags, setTags] = useState([])

  const [keywordInput, setKeywordInput] = useState('')
  const [filters, setFilters] = useState({ q: '', category: '', tag: '', status: '' })

  const [selected, setSelected] = useState([])
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [previewIndex, setPreviewIndex] = useState(-1)
  // 批量编辑：未选择的字段表示「不修改」
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchForm, setBatchForm] = useState({ categoryId: '', status: '', addTagIds: [], removeTagIds: [] })
  const [batchSaving, setBatchSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([api.get('/api/admin/categories', { auth: true }), api.get('/api/admin/tags', { auth: true })])
      .then(([categoryData, tagData]) => {
        if (cancelled) return
        setCategories(Array.isArray(categoryData) ? categoryData : [])
        setTags(Array.isArray(tagData) ? tagData : [])
      })
      .catch((err) => {
        if (!cancelled) toast.error(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [toast])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get('/api/admin/images', {
        auth: true,
        query: { page, pageSize: PAGE_SIZE, ...filters },
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
  }, [page, filters, toast])

  useEffect(() => {
    load()
  }, [load])

  const applyFilter = (key, value) => {
    setPage(1)
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const toggleSelect = (id) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  const toggleSelectAll = () => {
    setSelected((prev) => (prev.length === items.length ? [] : items.map((item) => item.id)))
  }

  const removeOne = async (image) => {
    if (!window.confirm(`确定删除「${image.title || image.filename}」吗？会先移入回收站，可在回收站恢复。`)) return
    try {
      await api.del(`/api/admin/images/${image.id}`, { auth: true })
      toast.success('已移入回收站')
      load()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const removeSelected = async () => {
    if (selected.length === 0) return
    if (!window.confirm(`确定删除选中的 ${selected.length} 张壁纸吗？会先移入回收站，可在回收站恢复。`)) return
    try {
      const res = await api.post('/api/admin/images/batch-delete', { ids: selected }, { auth: true })
      toast.success(`已移入回收站 ${res?.deleted ?? selected.length} 张`)
      load()
    } catch (err) {
      toast.error(err.message)
    }
  }

  /** 批量编辑：只提交用户改动过的字段 */
  const openBatch = () => {
    setBatchForm({ categoryId: '', status: '', addTagIds: [], removeTagIds: [] })
    setBatchOpen(true)
  }

  const toggleBatchTag = (key, id) =>
    setBatchForm((prev) => ({
      ...prev,
      [key]: prev[key].includes(id) ? prev[key].filter((item) => item !== id) : [...prev[key], id],
    }))

  const saveBatch = async () => {
    const payload = { ids: selected }
    if (batchForm.categoryId !== '') payload.categoryId = Number(batchForm.categoryId) || null
    if (batchForm.status !== '') payload.status = Number(batchForm.status)
    if (batchForm.addTagIds.length > 0) payload.addTagIds = batchForm.addTagIds
    if (batchForm.removeTagIds.length > 0) payload.removeTagIds = batchForm.removeTagIds
    if (
      payload.categoryId === undefined &&
      payload.status === undefined &&
      !payload.addTagIds &&
      !payload.removeTagIds
    ) {
      toast.error('请至少选择一项要修改的内容')
      return
    }
    setBatchSaving(true)
    try {
      const res = await api.post('/api/admin/images/batch-update', payload, { auth: true })
      toast.success(`已更新 ${res?.updated ?? selected.length} 张壁纸`)
      setBatchOpen(false)
      load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBatchSaving(false)
    }
  }

  const saveEdit = async () => {
    if (!editing) return
    setSaving(true)
    try {
      const payload = {
        title: editing.title,
        description: editing.description,
        categoryId: editing.categoryId ? Number(editing.categoryId) : null,
        tagIds: editing.tagIds,
        status: editing.status,
        // 网盘链接：只提交填了链接的行，名称留空自动兜底为「网盘」
        mirrors: editing.mirrors
          .filter((m) => (m.url || '').trim())
          .map((m) => ({
            name: (m.name || '').trim() || '网盘',
            url: m.url.trim(),
            code: (m.code || '').trim(),
          })),
      }
      await api.patch(`/api/admin/images/${editing.id}`, payload, { auth: true })
      toast.success('保存成功')
      setEditing(null)
      load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const toggleEditTag = (id) => {
    setEditing((prev) =>
      prev.tagIds.includes(id) ? { ...prev, tagIds: prev.tagIds.filter((item) => item !== id) } : { ...prev, tagIds: [...prev.tagIds, id] }
    )
  }

  const updateEditMirror = (index, patch) =>
    setEditing((prev) => ({
      ...prev,
      mirrors: prev.mirrors.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }))
  const addEditMirror = () => setEditing((prev) => ({ ...prev, mirrors: [...prev.mirrors, emptyMirror()] }))
  const removeEditMirror = (index) =>
    setEditing((prev) => ({ ...prev, mirrors: prev.mirrors.filter((_, i) => i !== index) }))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="admin-title">壁纸管理</h1>
          <p className="admin-subtitle">共 {formatNumber(total)} 张壁纸</p>
        </div>
        {selected.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={openBatch} className="admin-btn">
              <SlidersHorizontal size={15} />
              批量编辑（{selected.length}）
            </button>
            <button
              type="button"
              onClick={removeSelected}
              className="admin-btn-danger"
            >
              <Trash2 size={15} />
              删除选中（{selected.length}）
            </button>
          </div>
        ) : null}
      </div>

      {/* 筛选栏 */}
      <div className="admin-card">
        <form
          className="mb-3"
          onSubmit={(e) => {
            e.preventDefault()
            applyFilter('q', keywordInput.trim())
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

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <select value={filters.category} onChange={(e) => applyFilter('category', e.target.value)} className={inputClass}>
            <option value="">全部分类</option>
            <CategoryOptions categories={categories} includeParents />
          </select>
          <select value={filters.tag} onChange={(e) => applyFilter('tag', e.target.value)} className={inputClass}>
            <option value="">全部标签</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.slug}>
                {tag.name}
              </option>
            ))}
          </select>
          <select value={filters.status} onChange={(e) => applyFilter('status', e.target.value)} className={inputClass}>
            <option value="">全部状态</option>
            <option value="1">已发布</option>
            <option value="0">已隐藏</option>
            <option value="2">待审核</option>
            <option value="3">已驳回</option>
          </select>
        </div>
      </div>

      {loading ? (
        <RowSkeleton rows={8} />
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 py-20 text-center text-sm text-slate-400 dark:border-white/10">
          没有符合条件的壁纸
        </div>
      ) : (
        <div className="admin-card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="admin-table min-w-[52rem]">
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
                  <th className="px-3 py-3 font-medium">分类 / 标签</th>
                  <th className="px-3 py-3 font-medium">尺寸</th>
                  <th className="px-3 py-3 font-medium">浏览 / 下载</th>
                  <th className="px-3 py-3 font-medium">状态</th>
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
                          {image.uploader ? (
                            <p className="max-w-[14rem] truncate text-xs text-slate-400">
                              上传者：{image.uploader.nickname}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-slate-600 dark:text-slate-300">{image.category?.name || '未分类'}</p>
                      <p className="mt-0.5 flex flex-wrap gap-1">
                        {(image.tags || []).slice(0, 3).map((tag) => (
                          <span
                            key={tag.id}
                            className="admin-badge bg-slate-100 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                          >
                            #{tag.name}
                          </span>
                        ))}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-slate-500 dark:text-slate-400">
                      <p>{resolutionText(image.width, image.height)}</p>
                      <p className="text-xs">{image.sizeText}</p>
                    </td>
                    <td className="px-3 py-3 text-slate-500 dark:text-slate-400">
                      {formatNumber(image.views)} / {formatNumber(image.downloads)}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`admin-badge ${
                          (STATUS_META[image.status] || STATUS_META[0]).className
                        }`}
                      >
                        {(STATUS_META[image.status] || STATUS_META[0]).text}
                      </span>
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
                          onClick={() =>
                            setEditing({
                              id: image.id,
                              kind: image.kind || 'image',
                              title: image.title || '',
                              description: image.description || '',
                              categoryId: image.category?.id || '',
                              tagIds: (image.tags || []).map((tag) => tag.id),
                              status: image.status ?? 1,
                              mirrors: readMirrors(image.mirrors),
                            })
                          }
                          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-primary-500/10 hover:text-primary-600 dark:hover:bg-white/10"
                          title="编辑"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeOne(image)}
                          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/40"
                          title="删除"
                        >
                          <Trash2 size={15} />
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

      {/* 编辑弹窗 */}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="编辑壁纸"
        footer={
          <>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="admin-btn"
            >
              取消
            </button>
            <button
              type="button"
              onClick={saveEdit}
              disabled={saving}
              className="admin-btn-primary"
            >
              {saving ? <Spinner size={15} /> : null}
              保存
            </button>
          </>
        }
      >
        {editing ? (
          <div className="space-y-4">
            {editing.kind === 'video' ? (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-600 dark:bg-violet-950/50 dark:text-violet-300">
                <Film size={13} />
                视频壁纸
              </div>
            ) : null}

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">标题</span>
              <input
                value={editing.title}
                onChange={(e) => setEditing((prev) => ({ ...prev, title: e.target.value }))}
                className={inputClass}
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">描述</span>
              <textarea
                rows={3}
                value={editing.description}
                onChange={(e) => setEditing((prev) => ({ ...prev, description: e.target.value }))}
                className={inputClass}
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">分类</span>
                <select
                  value={editing.categoryId}
                  onChange={(e) => setEditing((prev) => ({ ...prev, categoryId: e.target.value }))}
                  className={inputClass}
                >
                  <option value="">未分类</option>
                  <CategoryOptions categories={categories} valueKey="id" />
                </select>
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">状态</span>
                <select
                  value={editing.status}
                  onChange={(e) => setEditing((prev) => ({ ...prev, status: Number(e.target.value) }))}
                  className={inputClass}
                >
                  <option value={1}>已发布</option>
                  <option value={0}>已隐藏</option>
                  <option value={2}>待审核</option>
                  <option value={3}>已驳回</option>
                </select>
              </label>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">标签（已选 {editing.tagIds.length}）</span>
              <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 dark:border-white/10 dark:bg-white/5">
                {tags.length === 0 ? (
                  <p className="px-1 py-1 text-xs text-slate-400">暂无标签</p>
                ) : (
                  tags.map((tag) => {
                    const active = editing.tagIds.includes(tag.id)
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleEditTag(tag.id)}
                        className={`rounded-full px-3 py-1 text-xs transition ${
                          active
                            ? 'bg-primary-500 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                        }`}
                      >
                        #{tag.name}
                      </button>
                    )
                  })
                )}
              </div>
            </div>

            {/* 网盘下载：除站内直接下载外，可补充百度网盘 / 夸克网盘等链接，前台详情页以二级菜单展示 */}
            <div className="space-y-2 border-t border-slate-900/[0.06] pt-3 dark:border-white/10">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <Link2 size={13} />
                  网盘下载（可选{editing.mirrors.length > 0 ? ` · 已填 ${editing.mirrors.length} 条` : ''}）
                </span>
                <button
                  type="button"
                  onClick={addEditMirror}
                  disabled={saving}
                  className="inline-flex h-7 items-center gap-1 rounded-lg bg-slate-900/[0.06] px-2.5 text-xs text-slate-600 transition hover:bg-slate-900/10 disabled:opacity-50 dark:bg-white/[0.08] dark:text-slate-200 dark:hover:bg-white/15"
                >
                  <Plus size={13} />
                  添加网盘
                </button>
              </div>

              {editing.mirrors.length === 0 ? (
                <p className="text-[11px] text-slate-400">未填写网盘链接</p>
              ) : (
                editing.mirrors.map((m, index) => (
                  <div key={index} className="flex flex-wrap items-center gap-2">
                    <input
                      value={m.name}
                      onChange={(e) => updateEditMirror(index, { name: e.target.value })}
                      disabled={saving}
                      placeholder="名称（如 百度网盘）"
                      className="h-8 w-32 rounded-xl border-0 bg-slate-900/[0.04] px-2.5 text-xs outline-none transition focus:ring-2 focus:ring-primary-400/60 dark:bg-white/[0.06] dark:text-slate-200"
                    />
                    <input
                      value={m.url}
                      onChange={(e) => updateEditMirror(index, { url: e.target.value })}
                      disabled={saving}
                      placeholder="https:// 网盘分享链接"
                      className="h-8 min-w-[12rem] flex-1 rounded-xl border-0 bg-slate-900/[0.04] px-2.5 text-xs outline-none transition focus:ring-2 focus:ring-primary-400/60 dark:bg-white/[0.06] dark:text-slate-200"
                    />
                    <input
                      value={m.code}
                      onChange={(e) => updateEditMirror(index, { code: e.target.value })}
                      disabled={saving}
                      placeholder="提取码"
                      className="h-8 w-24 rounded-xl border-0 bg-slate-900/[0.04] px-2.5 text-xs outline-none transition focus:ring-2 focus:ring-primary-400/60 dark:bg-white/[0.06] dark:text-slate-200"
                    />
                    <button
                      type="button"
                      onClick={() => removeEditMirror(index)}
                      disabled={saving}
                      title="删除该条"
                      className="grid h-8 w-8 place-items-center rounded-xl text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 disabled:opacity-40 dark:hover:bg-rose-950/40"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      <Lightbox
        images={items}
        index={previewIndex}
        onClose={() => setPreviewIndex(-1)}
        onIndexChange={(next) => setPreviewIndex(next)}
      />

      {/* 批量编辑弹窗：留空的字段表示不修改 */}
      <Modal
        open={batchOpen}
        onClose={() => setBatchOpen(false)}
        title={`批量编辑 ${selected.length} 张壁纸`}
        footer={
          <>
            <button type="button" onClick={() => setBatchOpen(false)} className="admin-btn">
              取消
            </button>
            <button type="button" onClick={saveBatch} disabled={batchSaving} className="admin-btn-primary">
              {batchSaving ? <Spinner size={15} /> : null}
              保存
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">分类</span>
              <select
                value={batchForm.categoryId}
                onChange={(e) => setBatchForm((prev) => ({ ...prev, categoryId: e.target.value }))}
                className={inputClass}
              >
                <option value="">不修改</option>
                <option value="0">设为未分类</option>
                <CategoryOptions categories={categories} valueKey="id" />
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">状态</span>
              <select
                value={batchForm.status}
                onChange={(e) => setBatchForm((prev) => ({ ...prev, status: e.target.value }))}
                className={inputClass}
              >
                <option value="">不修改</option>
                <option value="1">已发布</option>
                <option value="0">已隐藏</option>
                <option value="2">待审核</option>
                <option value="3">已驳回</option>
              </select>
            </label>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">添加标签</span>
            <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 dark:border-white/10 dark:bg-white/5">
              {tags.length === 0 ? (
                <p className="px-1 py-1 text-xs text-slate-400">暂无标签</p>
              ) : (
                tags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleBatchTag('addTagIds', tag.id)}
                    className={`rounded-full px-3 py-1 text-xs transition ${
                      batchForm.addTagIds.includes(tag.id)
                        ? 'bg-primary-500 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                    }`}
                  >
                    #{tag.name}
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">移除标签</span>
            <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 dark:border-white/10 dark:bg-white/5">
              {tags.length === 0 ? (
                <p className="px-1 py-1 text-xs text-slate-400">暂无标签</p>
              ) : (
                tags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleBatchTag('removeTagIds', tag.id)}
                    className={`rounded-full px-3 py-1 text-xs transition ${
                      batchForm.removeTagIds.includes(tag.id)
                        ? 'bg-rose-500 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                    }`}
                  >
                    #{tag.name}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
