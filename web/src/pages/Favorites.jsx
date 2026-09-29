import { useCallback, useEffect, useState } from 'react'
import { FolderInput, Pencil, Plus, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { useToast } from '../components/Toast'
import Modal from '../components/Modal'
import WallpaperGrid from '../components/WallpaperGrid'

const iconButton = 'rounded-md bg-black/55 p-1.5 text-white backdrop-blur-sm transition hover:bg-black/80'

/** 合集管理弹窗：新建 / 重命名 / 删除（删除仅取消分组，不删除收藏） */
function ManageModal({ open, onClose, collections, onChanged }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setName('')
      setEditingId(null)
      setEditName('')
    }
  }, [open])

  const create = async (e) => {
    e.preventDefault()
    const val = name.trim()
    if (!val || busy) return
    setBusy(true)
    try {
      await api.post('/api/favorites/collections', { name: val }, { auth: true })
      toast.success('合集已创建')
      setName('')
      onChanged?.()
      onClose?.()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const rename = async (col) => {
    const val = editName.trim()
    if (!val || busy) return
    setBusy(true)
    try {
      await api.put(`/api/favorites/collections/${col.id}`, { name: val }, { auth: true })
      toast.success('合集已重命名')
      setEditingId(null)
      onChanged?.()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (col) => {
    if (busy) return
    setBusy(true)
    try {
      await api.del(`/api/favorites/collections/${col.id}`, { auth: true })
      toast.success('合集已删除，其中的收藏已回到未分组')
      onChanged?.()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="管理收藏合集" maxWidth="max-w-md">
      <form onSubmit={create} className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={30}
          placeholder="请输入合集名称"
          className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:border-white/10 dark:bg-white/5"
        />
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-primary-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-primary-600 disabled:opacity-50"
        >
          <Plus size={15} />
          新建
        </button>
      </form>

      <div className="mt-4 space-y-2">
        {collections.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">还没有合集，先创建一个吧</p>
        ) : (
          collections.map((col) => (
            <div
              key={col.id}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/5"
            >
              {editingId === col.id ? (
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={30}
                  autoFocus
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus:border-primary-400 dark:border-white/10 dark:bg-white/5"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') rename(col)
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                />
              ) : (
                <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">
                  {col.name}
                  <span className="ml-2 text-xs text-slate-400">{col.count} 张</span>
                </span>
              )}

              {editingId === col.id ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => rename(col)}
                  className="rounded-lg px-2 py-1 text-xs font-medium text-primary-600 transition hover:bg-primary-50 disabled:opacity-50 dark:text-primary-400 dark:hover:bg-primary-500/10"
                >
                  保存
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setEditingId(col.id)
                    setEditName(col.name)
                  }}
                  className="rounded-lg p-1.5 text-slate-400 transition hover:text-primary-500 disabled:opacity-50"
                  title="重命名"
                >
                  <Pencil size={15} />
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => remove(col)}
                className="rounded-lg p-1.5 text-slate-400 transition hover:text-rose-500 disabled:opacity-50"
                title="删除合集"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))
        )}
      </div>
    </Modal>
  )
}

/** 移入合集弹窗：可选「未分组」或任一合集 */
function MoveModal({ image, collections, onClose, onMoved }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  const move = async (collectionId) => {
    if (busy) return
    setBusy(true)
    try {
      await api.post(`/api/favorites/${image.id}/move`, { collectionId }, { auth: true })
      toast.success(collectionId ? '已移入该合集' : '已移出合集（未分组）')
      onMoved?.()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={Boolean(image)} onClose={onClose} title="移动收藏到合集" maxWidth="max-w-sm">
      <div className="flex items-center gap-3">
        <img
          src={image?.thumbUrl || image?.url}
          alt=""
          className="h-14 w-14 shrink-0 rounded-xl object-cover ring-1 ring-black/5"
        />
        <p className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">
          {image?.title || '未命名壁纸'}
        </p>
      </div>

      <div className="mt-4 space-y-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => move(0)}
          className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-600 transition hover:border-primary-300 hover:text-primary-500 disabled:opacity-50 dark:border-white/10 dark:text-slate-300"
        >
          <span>未分组</span>
        </button>
        {collections.map((col) => (
          <button
            key={col.id}
            type="button"
            disabled={busy}
            onClick={() => move(col.id)}
            className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-600 transition hover:border-primary-300 hover:text-primary-500 disabled:opacity-50 dark:border-white/10 dark:text-slate-300"
          >
            <span className="truncate">{col.name}</span>
            <span className="text-xs text-slate-400">{col.count} 张</span>
          </button>
        ))}
      </div>
    </Modal>
  )
}

export default function Favorites() {
  const toast = useToast()
  const [collections, setCollections] = useState([])
  const [active, setActive] = useState('')
  const [version, setVersion] = useState(0)
  const [manageOpen, setManageOpen] = useState(false)
  const [moveTarget, setMoveTarget] = useState(null)

  const loadCollections = useCallback(async () => {
    try {
      const data = await api.get('/api/favorites/collections', { auth: true })
      setCollections(data || [])
    } catch (err) {
      toast.error(err.message)
    }
  }, [toast])

  useEffect(() => {
    loadCollections()
  }, [loadCollections])

  const refresh = () => {
    setVersion((v) => v + 1)
    loadCollections()
  }

  const isCollection = active !== '' && active !== 'none'

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">我的收藏</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          你收藏过的壁纸都会出现在这里，可以按合集分组整理
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setActive('')}
          className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
            active === ''
              ? 'border-primary-500 bg-primary-50 text-primary-600 dark:border-primary-500/60 dark:bg-primary-500/15 dark:text-primary-300'
              : 'border-slate-200 text-slate-500 hover:border-primary-300 hover:text-primary-500 dark:border-white/10 dark:text-slate-400'
          }`}
        >
          全部收藏
        </button>
        <button
          type="button"
          onClick={() => setActive('none')}
          className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
            active === 'none'
              ? 'border-primary-500 bg-primary-50 text-primary-600 dark:border-primary-500/60 dark:bg-primary-500/15 dark:text-primary-300'
              : 'border-slate-200 text-slate-500 hover:border-primary-300 hover:text-primary-500 dark:border-white/10 dark:text-slate-400'
          }`}
        >
          未分组
        </button>
        {collections.map((col) => (
          <button
            key={col.id}
            type="button"
            onClick={() => setActive(String(col.id))}
            className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
              active === String(col.id)
                ? 'border-primary-500 bg-primary-50 text-primary-600 dark:border-primary-500/60 dark:bg-primary-500/15 dark:text-primary-300'
                : 'border-slate-200 text-slate-500 hover:border-primary-300 hover:text-primary-500 dark:border-white/10 dark:text-slate-400'
            }`}
          >
            {col.name}
            <span className="ml-1.5 text-xs opacity-70">{col.count}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => setManageOpen(true)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3.5 py-1.5 text-sm text-slate-500 transition hover:border-primary-300 hover:text-primary-500 dark:border-white/10 dark:text-slate-400"
        >
          <Plus size={15} />
          管理合集
        </button>
      </div>

      <WallpaperGrid
        key={version}
        endpoint="/api/favorites"
        auth
        filters={{ collection: active }}
        cardActions={(image) => (
          <button
            type="button"
            onClick={() => setMoveTarget(image)}
            className={iconButton}
            title="移入合集"
          >
            <FolderInput size={15} />
          </button>
        )}
        emptyText={isCollection ? '该合集还没有壁纸' : '还没有收藏任何壁纸，去壁纸详情页点个爱心吧'}
      />

      <ManageModal
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        collections={collections}
        onChanged={refresh}
      />

      <MoveModal
        image={moveTarget}
        collections={collections}
        onClose={() => setMoveTarget(null)}
        onMoved={() => {
          setMoveTarget(null)
          refresh()
        }}
      />
    </div>
  )
}