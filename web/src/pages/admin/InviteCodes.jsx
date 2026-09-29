import { useCallback, useEffect, useState } from 'react'
import { Plus, RefreshCw, Ticket, Trash2 } from 'lucide-react'
import { api } from '../../lib/api'
import { useToast } from '../../components/Toast'
import Spinner from '../../components/Spinner'
import Modal from '../../components/Modal'

const EMPTY_FORM = { code: '', maxUses: '1', expiresAt: '', note: '' }
const EMPTY_BATCH = { count: '10', maxUses: '1', expiresAt: '', note: '' }

const labelClass = 'text-xs font-medium text-slate-500 dark:text-slate-400'

export default function InviteCodes() {
  const toast = useToast()
  const [codes, setCodes] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(EMPTY_FORM)
  const [batch, setBatch] = useState(EMPTY_BATCH)
  const [saving, setSaving] = useState(false)
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchSaving, setBatchSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await api.get('/api/admin/invite-codes', { auth: true })
      setCodes(Array.isArray(data) ? data : [])
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const createOne = async (e) => {
    e.preventDefault()
    const payload = {
      code: form.code.trim(),
      maxUses: Number(form.maxUses),
      expiresAt: form.expiresAt,
      note: form.note.trim(),
    }
    setSaving(true)
    try {
      await api.post('/api/admin/invite-codes', payload, { auth: true })
      toast.success('邀请码已创建')
      setForm(EMPTY_FORM)
      load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const generateBatch = async (e) => {
    e.preventDefault()
    const payload = {
      count: Number(batch.count),
      maxUses: Number(batch.maxUses),
      expiresAt: batch.expiresAt,
      note: batch.note.trim(),
    }
    setBatchSaving(true)
    try {
      const created = await api.post('/api/admin/invite-codes/batch', payload, { auth: true })
      toast.success(`已批量生成 ${(created || []).length} 个邀请码`)
      setBatchOpen(false)
      setBatch(EMPTY_BATCH)
      load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBatchSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.del(`/api/admin/invite-codes/${deleteTarget.id}`, { auth: true })
      toast.success('邀请码已删除')
      setDeleteTarget(null)
      load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setDeleting(false)
    }
  }

  const copyCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code)
      toast.success('邀请码已复制')
    } catch {
      toast.error('复制失败，请手动复制')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="admin-title">邀请码管理</h1>
          <p className="admin-subtitle">自定义或批量生成注册邀请码，配合站点设置里的「需要邀请码」使用</p>
        </div>
        <button type="button" onClick={() => setBatchOpen(true)} className="admin-btn-primary">
          <Plus size={15} />
          批量生成
        </button>
      </div>

      {/* 单个创建 */}
      <form onSubmit={createOne} className="admin-card grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-4">
          <h2 className="text-sm font-semibold">创建单个邀请码</h2>
        </div>
        <label className="space-y-1.5">
          <span className={labelClass}>邀请码（留空则自动生成）</span>
          <input
            value={form.code}
            onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
            placeholder="如 WELCOME2026"
            className="admin-input uppercase"
          />
        </label>
        <label className="space-y-1.5">
          <span className={labelClass}>使用次数（0 表示不限）</span>
          <input
            type="number"
            min="0"
            value={form.maxUses}
            onChange={(e) => setForm((prev) => ({ ...prev, maxUses: e.target.value }))}
            className="admin-input"
          />
        </label>
        <label className="space-y-1.5">
          <span className={labelClass}>有效期（留空不过期）</span>
          <input
            type="datetime-local"
            value={form.expiresAt}
            onChange={(e) => setForm((prev) => ({ ...prev, expiresAt: e.target.value }))}
            className="admin-input"
          />
        </label>
        <label className="space-y-1.5">
          <span className={labelClass}>备注</span>
          <input
            value={form.note}
            onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
            placeholder="发给谁 / 用途"
            className="admin-input"
          />
        </label>
        <div className="sm:col-span-2 lg:col-span-4">
          <button type="submit" disabled={saving} className="admin-btn-primary">
            {saving ? <Spinner size={15} /> : <Ticket size={15} />}
            创建邀请码
          </button>
        </div>
      </form>

      {/* 列表 */}
      <section className="admin-card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">已生成的邀请码（{codes.length}）</h2>
          <button type="button" onClick={load} className="admin-btn">
            <RefreshCw size={14} />
            刷新
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner size={22} />
          </div>
        ) : codes.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">还没有邀请码，先在上方创建或批量生成</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead className="admin-thead">
                <tr>
                  <th className="px-3 py-2.5 text-left">邀请码</th>
                  <th className="px-3 py-2.5 text-left">使用情况</th>
                  <th className="px-3 py-2.5 text-left">有效期</th>
                  <th className="px-3 py-2.5 text-left">备注</th>
                  <th className="px-3 py-2.5 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {codes.map((item) => (
                  <tr key={item.id} className="admin-row">
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => copyCode(item.code)}
                        title="点击复制"
                        className="font-mono text-sm tracking-wider text-primary-600 transition hover:underline dark:text-primary-300"
                      >
                        {item.code}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-sm tabular-nums text-slate-500 dark:text-slate-400">
                      {item.unlimited ? '不限次数' : `${item.usedCount} / ${item.maxUses}`}
                    </td>
                    <td className="px-3 py-2.5 text-sm text-slate-500 dark:text-slate-400">
                      {item.expiresAt ? (
                        <span className={item.expired ? 'text-rose-500' : ''}>
                          {item.expiresAt}
                          {item.expired ? '（已过期）' : ''}
                        </span>
                      ) : (
                        '不过期'
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-sm text-slate-500 dark:text-slate-400">{item.note || '—'}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(item)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-rose-500 transition hover:bg-rose-50 dark:hover:bg-rose-500/10"
                      >
                        <Trash2 size={13} />
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 批量生成弹窗 */}
      <Modal
        open={batchOpen}
        onClose={() => setBatchOpen(false)}
        title="批量生成邀请码"
        maxWidth="max-w-lg"
      >
        <form onSubmit={generateBatch} className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className={labelClass}>生成数量（最多 200）</span>
            <input
              type="number"
              min="1"
              max="200"
              value={batch.count}
              onChange={(e) => setBatch((prev) => ({ ...prev, count: e.target.value }))}
              className="admin-input"
            />
          </label>
          <label className="space-y-1.5">
            <span className={labelClass}>每个可用次数（0 表示不限）</span>
            <input
              type="number"
              min="0"
              value={batch.maxUses}
              onChange={(e) => setBatch((prev) => ({ ...prev, maxUses: e.target.value }))}
              className="admin-input"
            />
          </label>
          <label className="space-y-1.5">
            <span className={labelClass}>有效期（留空不过期）</span>
            <input
              type="datetime-local"
              value={batch.expiresAt}
              onChange={(e) => setBatch((prev) => ({ ...prev, expiresAt: e.target.value }))}
              className="admin-input"
            />
          </label>
          <label className="space-y-1.5">
            <span className={labelClass}>备注</span>
            <input
              value={batch.note}
              onChange={(e) => setBatch((prev) => ({ ...prev, note: e.target.value }))}
              className="admin-input"
            />
          </label>
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 sm:col-span-2 dark:border-white/10">
            <button type="button" onClick={() => setBatchOpen(false)} className="admin-btn">
              取消
            </button>
            <button type="submit" disabled={batchSaving} className="admin-btn-primary">
              {batchSaving ? <Spinner size={15} /> : <Ticket size={15} />}
              生成
            </button>
          </div>
        </form>
      </Modal>

      {/* 删除确认 */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="删除邀请码"
        maxWidth="max-w-sm"
        footer={
          <>
            <button type="button" onClick={() => setDeleteTarget(null)} className="admin-btn">
              取消
            </button>
            <button type="button" onClick={confirmDelete} disabled={deleting} className="admin-btn-danger">
              {deleting ? <Spinner size={15} /> : <Trash2 size={15} />}
              确认删除
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          确定删除邀请码 <span className="font-mono text-slate-900 dark:text-slate-100">{deleteTarget?.code}</span>{' '}
          吗？删除后不可恢复。
        </p>
      </Modal>
    </div>
  )
}