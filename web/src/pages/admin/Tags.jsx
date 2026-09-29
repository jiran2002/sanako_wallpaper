import { useCallback, useEffect, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { api } from '../../lib/api'
import { useToast } from '../../components/Toast'
import Modal from '../../components/Modal'
import Spinner from '../../components/Spinner'
import { RowSkeleton } from '../../components/Skeleton'

const inputClass = 'admin-input'

export default function Tags() {
  const toast = useToast()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get('/api/admin/tags', { auth: true })
      setItems(Array.isArray(data) ? data : [])
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const save = async () => {
    if (!editing.name.trim()) {
      toast.error('请填写标签名称')
      return
    }
    setSaving(true)
    try {
      const payload = { name: editing.name.trim(), slug: editing.slug.trim() || undefined }
      if (editing.id) await api.patch(`/api/admin/tags/${editing.id}`, payload, { auth: true })
      else await api.post('/api/admin/tags', payload, { auth: true })
      toast.success(editing.id ? '标签已更新' : '标签已创建')
      setEditing(null)
      load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (tag) => {
    if (!window.confirm(`确定删除标签「${tag.name}」吗？`)) return
    try {
      await api.del(`/api/admin/tags/${tag.id}`, { auth: true })
      toast.success('标签已删除')
      load()
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="admin-title">标签管理</h1>
          <p className="admin-subtitle">共 {items.length} 个标签</p>
        </div>
        <button
          type="button"
          onClick={() => setEditing({ name: '', slug: '' })}
          className="admin-btn-primary"
        >
          <Plus size={15} />
          新建标签
        </button>
      </div>

      {loading ? (
        <RowSkeleton rows={5} />
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 py-20 text-center text-sm text-slate-400 dark:border-white/10 dark:bg-white/[0.03]">
          还没有标签，点击右上角新建
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {items.map((tag) => (
            <div
              key={tag.id}
              className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-primary-300 hover:shadow-md dark:border-white/10 dark:bg-white/[0.045] dark:hover:border-primary-500/40"
            >
              <div>
                <p className="text-sm font-medium">#{tag.name}</p>
                <p className="text-xs text-slate-400">
                  {tag.slug} · {tag.count ?? 0} 张
                </p>
              </div>
              <div className="flex gap-0.5">
                <button
                  type="button"
                  onClick={() => setEditing({ id: tag.id, name: tag.name || '', slug: tag.slug || '' })}
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-primary-600 dark:hover:bg-white/10 dark:hover:text-primary-300"
                  title="编辑"
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => remove(tag)}
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/15"
                  title="删除"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? '编辑标签' : '新建标签'}
        maxWidth="max-w-md"
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
              onClick={save}
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
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">名称 *</span>
              <input
                value={editing.name}
                onChange={(e) => setEditing((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="例如：4K"
                className={inputClass}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Slug（留空自动生成）</span>
              <input
                value={editing.slug}
                onChange={(e) => setEditing((prev) => ({ ...prev, slug: e.target.value }))}
                placeholder="例如：4k"
                className={inputClass}
              />
            </label>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
