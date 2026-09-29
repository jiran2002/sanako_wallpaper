import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Pencil, Search, ShieldBan, ShieldCheck, Trash2, Upload } from 'lucide-react'
import { api, xhrUpload } from '../../lib/api'
import { useToast } from '../../components/Toast'
import Modal from '../../components/Modal'
import Avatar from '../../components/Avatar'
import Spinner from '../../components/Spinner'
import { RowSkeleton } from '../../components/Skeleton'
import { formatDate, formatNumber } from '../../lib/format'

const PAGE_SIZE = 20

/** 用户组选项（与后端 services/roles.js 保持一致） */
const ROLE_OPTIONS = [
  { key: 'member', name: '会员' },
  { key: 'editor', name: '编辑' },
  { key: 'moderator', name: '版主' },
  { key: 'admin', name: '管理员' },
]

const EMPTY_EDIT = { nickname: '', bio: '', password: '' }

export default function Users() {
  const toast = useToast()
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)

  const [keywordInput, setKeywordInput] = useState('')
  const [filters, setFilters] = useState({ q: '', role: '', status: '' })

  // 编辑用户弹窗
  const fileRef = useRef(null)
  const [editing, setEditing] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_EDIT)
  const [savingEdit, setSavingEdit] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get('/api/admin/users', {
        auth: true,
        query: { page, pageSize: PAGE_SIZE, ...filters },
      })
      setItems(data.items || [])
      setTotal(data.total || 0)
      setPages(data.pages || 1)
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

  const changeRole = async (user, role) => {
    if (role === user.role) return
    setBusyId(user.id)
    try {
      await api.patch(`/api/admin/users/${user.id}/role`, { role }, { auth: true })
      toast.success(`已将 ${user.nickname || user.username} 调整为${ROLE_OPTIONS.find((r) => r.key === role)?.name || role}`)
      load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const toggleStatus = async (user) => {
    const next = user.status === 1 ? 0 : 1
    if (next === 0 && !window.confirm(`确定封禁「${user.nickname || user.username}」吗？封禁后该账号将无法登录。`)) return
    setBusyId(user.id)
    try {
      await api.patch(`/api/admin/users/${user.id}/status`, { status: next }, { auth: true })
      toast.success(next === 1 ? '已解封' : '已封禁')
      load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const removeUser = async (user) => {
    if (
      !window.confirm(
        `确定删除「${user.nickname || user.username}」吗？其收藏会被清除，已上传的壁纸将变为无主。该操作不可恢复。`,
      )
    ) {
      return
    }
    setBusyId(user.id)
    try {
      await api.del(`/api/admin/users/${user.id}`, { auth: true })
      toast.success('已删除')
      load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusyId(null)
    }
  }

  /* -------------------------------- 编辑用户 -------------------------------- */
  const openEdit = (user) => {
    setEditing(user)
    setEditForm({ nickname: user.nickname || '', bio: user.bio || '', password: '' })
  }

  const closeEdit = () => {
    if (savingEdit || uploadingAvatar) return
    setEditing(null)
    setEditForm(EMPTY_EDIT)
  }

  const uploadAvatar = async (file) => {
    if (!file || !editing) return
    if (!file.type.startsWith('image/')) {
      toast.error('请选择图片文件')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('头像不能超过 5MB')
      return
    }
    setUploadingAvatar(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const updated = await xhrUpload(`/api/admin/users/${editing.id}/avatar`, formData, { auth: true })
      setEditing((prev) => ({ ...prev, avatar: updated.avatar }))
      setItems((prev) => prev.map((u) => (u.id === updated.id ? { ...u, avatar: updated.avatar } : u)))
      toast.success('头像已更新')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setUploadingAvatar(false)
    }
  }

  const saveEdit = async (e) => {
    e.preventDefault()
    if (!editing) return
    if (!editForm.nickname.trim()) {
      toast.error('昵称不能为空')
      return
    }
    if (editForm.password && editForm.password.length < 6) {
      toast.error('密码至少 6 位')
      return
    }
    setSavingEdit(true)
    try {
      await api.patch(
        `/api/admin/users/${editing.id}`,
        { nickname: editForm.nickname.trim(), bio: editForm.bio.trim(), password: editForm.password },
        { auth: true },
      )
      toast.success('用户资料已更新')
      setEditing(null)
      setEditForm(EMPTY_EDIT)
      load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSavingEdit(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="admin-title">用户管理</h1>
        <p className="admin-subtitle">共 {formatNumber(total)} 位用户</p>
      </div>

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
              placeholder="搜索用户名 / 昵称，回车确认"
              className="admin-input pl-9"
            />
          </div>
        </form>

        <div className="grid grid-cols-2 gap-3">
          <select value={filters.role} onChange={(e) => applyFilter('role', e.target.value)} className="admin-input">
            <option value="">全部用户组</option>
            {ROLE_OPTIONS.map((role) => (
              <option key={role.key} value={role.key}>
                {role.name}
              </option>
            ))}
          </select>
          <select value={filters.status} onChange={(e) => applyFilter('status', e.target.value)} className="admin-input">
            <option value="">全部状态</option>
            <option value="1">正常</option>
            <option value="0">已封禁</option>
          </select>
        </div>
      </div>

      {loading ? (
        <RowSkeleton rows={8} />
      ) : items.length === 0 ? (
        <div className="admin-card py-20 text-center text-sm text-slate-400">没有符合条件的用户</div>
      ) : (
        <div className="admin-card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="admin-table min-w-[52rem]">
              <thead className="admin-thead">
                <tr>
                  <th className="px-3 py-3 font-medium">用户</th>
                  <th className="px-3 py-3 font-medium">用户组</th>
                  <th className="px-3 py-3 font-medium">作品 / 收藏</th>
                  <th className="px-3 py-3 font-medium">状态</th>
                  <th className="px-3 py-3 font-medium">最后登录</th>
                  <th className="px-3 py-3 font-medium">注册时间</th>
                  <th className="px-3 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/60 dark:divide-white/5">
                {items.map((user) => (
                  <tr key={user.id} className="admin-row">
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar user={user} size={34} />
                        <div className="min-w-0">
                          <p className="max-w-[12rem] truncate font-medium">{user.nickname || user.username}</p>
                          <p className="max-w-[12rem] truncate text-xs text-slate-400">@{user.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <select
                        value={user.role}
                        disabled={busyId === user.id}
                        onChange={(e) => changeRole(user, e.target.value)}
                        className="admin-input w-auto px-2 py-1.5 text-xs"
                      >
                        {ROLE_OPTIONS.map((role) => (
                          <option key={role.key} value={role.key}>
                            {role.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3 text-slate-500 dark:text-slate-400">
                      {formatNumber(user.imageCount)} / {formatNumber(user.favoriteCount)}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`admin-badge ${
                          user.status === 1
                            ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400'
                            : 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400'
                        }`}
                      >
                        {user.status === 1 ? '正常' : '已封禁'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-400">{formatDate(user.lastLoginAt) || '—'}</td>
                    <td className="px-3 py-3 text-xs text-slate-400">{formatDate(user.createdAt)}</td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          disabled={busyId === user.id}
                          onClick={() => openEdit(user)}
                          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-primary-50 hover:text-primary-600 disabled:opacity-50 dark:hover:bg-white/10"
                          title="编辑用户"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          disabled={busyId === user.id}
                          onClick={() => toggleStatus(user)}
                          className={`rounded-lg p-1.5 transition disabled:opacity-50 ${
                            user.status === 1
                              ? 'text-slate-400 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-950/40'
                              : 'text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950/40'
                          }`}
                          title={user.status === 1 ? '封禁账号' : '解封账号'}
                        >
                          {user.status === 1 ? <ShieldBan size={15} /> : <ShieldCheck size={15} />}
                        </button>
                        <button
                          type="button"
                          disabled={busyId === user.id}
                          onClick={() => removeUser(user)}
                          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 disabled:opacity-50 dark:hover:bg-rose-950/40"
                          title="删除用户"
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

      {pages > 1 ? (
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            className="admin-btn text-sm"
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
            className="admin-btn text-sm"
          >
            下一页
            <ChevronRight size={15} />
          </button>
        </div>
      ) : null}

      {/* 编辑用户弹窗 */}
      <Modal
        open={Boolean(editing)}
        onClose={closeEdit}
        title={editing ? `编辑用户 · ${editing.nickname || editing.username}` : '编辑用户'}
        footer={
          <>
            <button type="button" onClick={closeEdit} className="admin-btn">
              取消
            </button>
            <button
              type="submit"
              form="admin-user-edit-form"
              disabled={savingEdit}
              className="admin-btn-primary"
            >
              {savingEdit ? <Spinner size={15} /> : null}
              保存修改
            </button>
          </>
        }
      >
        {editing ? (
          <form id="admin-user-edit-form" onSubmit={saveEdit} className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar user={{ ...editing, nickname: editForm.nickname || editing.nickname }} size={64} />
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="admin-btn"
                >
                  {uploadingAvatar ? <Spinner size={15} /> : <Upload size={15} />}
                  {uploadingAvatar ? '上传中…' : '更换头像'}
                </button>
                <p className="text-xs text-slate-400">支持 JPG / PNG / WebP，不超过 5MB</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    uploadAvatar(e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
              </div>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">用户名</span>
              <input value={editing.username} disabled className="admin-input opacity-60" />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">昵称</span>
              <input
                value={editForm.nickname}
                onChange={(e) => setEditForm((prev) => ({ ...prev, nickname: e.target.value }))}
                maxLength={24}
                placeholder="展示给其他用户的名称"
                className="admin-input"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                个性签名（{editForm.bio.length}/200）
              </span>
              <textarea
                value={editForm.bio}
                onChange={(e) => setEditForm((prev) => ({ ...prev, bio: e.target.value }))}
                maxLength={200}
                rows={3}
                placeholder="该用户的个人简介"
                className="admin-input resize-y"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">重置密码（留空则不修改）</span>
              <input
                type="password"
                autoComplete="new-password"
                value={editForm.password}
                onChange={(e) => setEditForm((prev) => ({ ...prev, password: e.target.value }))}
                placeholder="至少 6 位"
                className="admin-input"
              />
            </label>
          </form>
        ) : null}
      </Modal>
    </div>
  )
}
