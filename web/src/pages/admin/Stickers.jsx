import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ImagePlus,
  Layers,
  Pencil,
  Plus,
  Smile,
  Trash2,
  Upload,
} from 'lucide-react'
import { api, xhrUpload } from '../../lib/api'
import { useToast } from '../../components/Toast'
import Modal from '../../components/Modal'
import Spinner from '../../components/Spinner'
import Skeleton from '../../components/Skeleton'

const EMPTY_FORM = { name: '', sortOrder: 0, enabled: true }

export default function Stickers() {
  const toast = useToast()
  const [packs, setPacks] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [pendingDelete, setPendingDelete] = useState(null)
  const iconInputRef = useRef(null)
  const stickerInputRef = useRef(null)

  const load = useCallback(
    async (keepActive = true) => {
      try {
        const data = await api.get('/api/admin/sticker-packs', { auth: true })
        const list = Array.isArray(data) ? data : []
        setPacks(list)
        setActiveId((prev) => {
          if (keepActive && prev && list.some((p) => p.id === prev)) return prev
          return list[0]?.id ?? null
        })
      } catch (err) {
        toast.error(err.message)
      } finally {
        setLoading(false)
      }
    },
    [toast],
  )

  useEffect(() => {
    load()
  }, [load])

  const active = packs.find((p) => p.id === activeId) || null

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormOpen(true)
  }

  const openEdit = (pack) => {
    setEditing(pack)
    setForm({ name: pack.name, sortOrder: pack.sortOrder, enabled: pack.enabled })
    setFormOpen(true)
  }

  const submitForm = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) {
      toast.info('请填写套装名称')
      return
    }
    setBusy(true)
    try {
      if (editing) {
        await api.patch(`/api/admin/sticker-packs/${editing.id}`, form, { auth: true })
        toast.success('套装已更新')
      } else {
        const created = await api.post('/api/admin/sticker-packs', form, { auth: true })
        setActiveId(created?.id ?? null)
        toast.success('套装已创建')
      }
      setFormOpen(false)
      await load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const removePack = async () => {
    if (!pendingDelete) return
    setBusy(true)
    try {
      await api.del(`/api/admin/sticker-packs/${pendingDelete.id}`, { auth: true })
      toast.success('套装已删除')
      setPendingDelete(null)
      setActiveId(null)
      await load(false)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  /** 上传/替换套装 icon */
  const uploadIcon = async (file) => {
    if (!file || !active) return
    setBusy(true)
    try {
      const body = new FormData()
      body.append('file', file)
      await xhrUpload(`/api/admin/sticker-packs/${active.id}/icon`, body)
      toast.success('icon 已更新')
      await load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
      if (iconInputRef.current) iconInputRef.current.value = ''
    }
  }

  /** 批量上传表情包 */
  const uploadStickers = async (files) => {
    const list = Array.from(files || [])
    if (list.length === 0 || !active) return
    setUploading(true)
    setProgress(0)
    try {
      const body = new FormData()
      for (const file of list) body.append('files', file)
      const data = await xhrUpload(`/api/admin/sticker-packs/${active.id}/stickers`, body, {
        onProgress: setProgress,
      })
      toast.success(`已上传 ${data?.uploaded ?? list.length} 张表情包`)
      await load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setUploading(false)
      setProgress(0)
      if (stickerInputRef.current) stickerInputRef.current.value = ''
    }
  }

  const removeSticker = async (sticker) => {
    setBusy(true)
    try {
      await api.del(`/api/admin/stickers/${sticker.id}`, { auth: true })
      toast.success('已删除')
      await load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="admin-title">表情包</h1>
          <p className="admin-subtitle">
            自己上传表情包并分套装管理，评论区发送时按套装切换。需在「站点设置」中开启表情包开关。
          </p>
        </div>
        <button type="button" onClick={openCreate} className="admin-btn-primary">
          <Plus size={15} />
          新建套装
        </button>
      </div>

      {loading ? (
        <div className="grid gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : packs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 py-20 text-center dark:border-white/10">
          <Smile size={28} className="mx-auto text-slate-300 dark:text-slate-600" />
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">还没有表情包套装</p>
          <button type="button" onClick={openCreate} className="admin-btn-primary mt-4">
            <Plus size={15} />
            新建第一套
          </button>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
          {/* 左侧：套装列表（icon + 名字） */}
          <aside className="admin-card space-y-1 p-2">
            {packs.map((pack) => (
              <button
                key={pack.id}
                type="button"
                onClick={() => setActiveId(pack.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                  pack.id === activeId
                    ? 'bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-300'
                    : 'hover:bg-slate-50 dark:hover:bg-white/5'
                }`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 dark:bg-white/10">
                  {pack.iconUrl ? (
                    <img src={pack.iconUrl} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <Layers size={16} className="text-slate-400" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{pack.name}</span>
                  <span className="block text-xs text-slate-400">
                    {pack.count} 张{pack.enabled ? '' : ' · 已停用'}
                  </span>
                </span>
              </button>
            ))}
          </aside>

          {/* 右侧：当前套装的表情包 */}
          <section className="admin-card space-y-4">
            {active ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 dark:bg-white/10">
                      {active.iconUrl ? (
                        <img src={active.iconUrl} alt="" className="h-full w-full object-contain" />
                      ) : (
                        <Smile size={20} className="text-slate-400" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{active.name}</p>
                      <p className="text-xs text-slate-400">
                        共 {active.stickers.length} 张表情包
                        {active.enabled ? '' : ' · 已停用（前台不展示）'}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => iconInputRef.current?.click()}
                      className="admin-btn disabled:opacity-60"
                    >
                      <ImagePlus size={15} />
                      上传 icon
                    </button>
                    <button type="button" onClick={() => openEdit(active)} className="admin-btn">
                      <Pencil size={15} />
                      编辑
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setPendingDelete(active)}
                      className="admin-btn text-rose-500 disabled:opacity-60"
                    >
                      <Trash2 size={15} />
                      删除
                    </button>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4 dark:border-white/5">
                  <input
                    ref={stickerInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => uploadStickers(e.target.files)}
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      disabled={uploading || busy}
                      onClick={() => stickerInputRef.current?.click()}
                      className="admin-btn-primary disabled:opacity-60"
                    >
                      {uploading ? <Spinner size={15} /> : <Upload size={15} />}
                      上传表情包
                    </button>
                    {uploading ? (
                      <span className="text-xs text-slate-400">上传中 {progress}%</span>
                    ) : (
                      <span className="text-xs text-slate-400">
                        可多选，支持 GIF（保留动画），单张不超过 5MB
                      </span>
                    )}
                  </div>

                  {active.stickers.length === 0 ? (
                    <div className="mt-4 rounded-xl border border-dashed border-slate-200 py-14 text-center text-sm text-slate-400 dark:border-white/10">
                      这一套还没有表情包，点上方按钮上传
                    </div>
                  ) : (
                    <div className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-8">
                      {active.stickers.map((sticker) => (
                        <div
                          key={sticker.id}
                          className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-1.5 dark:border-white/10 dark:bg-white/5"
                        >
                          <img
                            src={sticker.url}
                            alt={sticker.name || '表情包'}
                            loading="lazy"
                            className="h-full w-full object-contain"
                          />
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => removeSticker(sticker)}
                            title="删除"
                            className="absolute right-1 top-1 rounded-lg bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100 disabled:opacity-40"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </section>
        </div>
      )}

      {/* 隐藏的 icon 选择框（随当前套装切换） */}
      <input
        ref={iconInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => uploadIcon(e.target.files?.[0])}
      />

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? '编辑套装' : '新建套装'}
        footer={
          <>
            <button type="button" onClick={() => setFormOpen(false)} className="admin-btn">
              取消
            </button>
            <button type="submit" form="sticker-pack-form" disabled={busy} className="admin-btn-primary disabled:opacity-60">
              {busy ? <Spinner size={15} /> : null}
              保存
            </button>
          </>
        }
      >
        <form id="sticker-pack-form" onSubmit={submitForm} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">套装名称</span>
            <input
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              maxLength={40}
              placeholder="例如：鸣潮、日常吐槽"
              className="admin-input"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">排序</span>
              <input
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm((prev) => ({ ...prev, sortOrder: Number(e.target.value) || 0 }))}
                className="admin-input"
              />
            </label>
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">状态</span>
              <label className="flex items-center gap-2 py-2 text-sm text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => setForm((prev) => ({ ...prev, enabled: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300"
                />
                启用（前台评论区可选）
              </label>
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title="删除套装？"
        footer={
          <>
            <button type="button" onClick={() => setPendingDelete(null)} className="admin-btn">
              取消
            </button>
            <button type="button" disabled={busy} onClick={removePack} className="admin-btn-danger disabled:opacity-60">
              {busy ? <Spinner size={15} /> : <Trash2 size={15} />}
              确认删除
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          「{pendingDelete?.name}」及其中的 {pendingDelete?.count ?? 0} 张表情包将被删除，且不可恢复。
        </p>
      </Modal>
    </div>
  )
}