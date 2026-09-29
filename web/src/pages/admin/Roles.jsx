import { useEffect, useMemo, useState } from 'react'
import { Check, Lock, Save } from 'lucide-react'
import { api } from '../../lib/api'
import { useToast } from '../../components/Toast'
import Spinner from '../../components/Spinner'
import Skeleton from '../../components/Skeleton'

export default function Roles() {
  const toast = useToast()
  const [roles, setRoles] = useState([])
  const [permissions, setPermissions] = useState([])
  const [matrix, setMatrix] = useState({})
  const [saved, setSaved] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .get('/api/admin/roles', { auth: true })
      .then((data) => {
        if (cancelled) return
        setRoles(data.roles || [])
        setPermissions(data.permissions || [])
        setMatrix(data.matrix || {})
        setSaved(data.matrix || {})
      })
      .catch((err) => {
        if (!cancelled) toast.error(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [toast])

  const dirty = useMemo(() => JSON.stringify(matrix) !== JSON.stringify(saved), [matrix, saved])

  const toggle = (role, perm) => {
    setMatrix((prev) => ({ ...prev, [role]: { ...prev[role], [perm]: !prev[role]?.[perm] } }))
  }

  const save = async () => {
    setSaving(true)
    try {
      const data = await api.put('/api/admin/roles', matrix, { auth: true })
      setRoles(data.roles || [])
      setPermissions(data.permissions || [])
      setMatrix(data.matrix || {})
      setSaved(data.matrix || {})
      toast.success('用户组权限已保存')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="admin-title">用户组权限</h1>
          <p className="admin-subtitle">
            勾选各用户组可使用的功能，保存后立即对所有账号生效
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="admin-btn-primary"
        >
          {saving ? <Spinner size={15} /> : <Save size={15} />}
          保存更改
        </button>
      </div>

      <div className="admin-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="admin-table min-w-[48rem]">
            <thead className="admin-thead">
              <tr>
                <th className="px-4 py-3 text-left font-medium">权限</th>
                {roles.map((role) => (
                  <th key={role.key} className="px-4 py-3 text-center font-medium">
                    <span className="block text-slate-700 dark:text-slate-200">{role.name}</span>
                    {role.key === 'admin' ? (
                      <span className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] font-normal text-slate-400">
                        <Lock size={11} />
                        不可修改
                      </span>
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/60 dark:divide-white/5">
              {permissions.map((perm) => (
                <tr key={perm.key} className="admin-row">
                  <td className="px-4 py-3">
                    <p className="font-medium">{perm.name}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{perm.description}</p>
                  </td>
                  {roles.map((role) => {
                    const locked = role.key === 'admin'
                    const checked = Boolean(matrix[role.key]?.[perm.key])
                    return (
                      <td key={role.key} className="px-4 py-3 text-center">
                        <button
                          type="button"
                          disabled={locked}
                          onClick={() => toggle(role.key, perm.key)}
                          aria-label={`${role.name} - ${perm.name}`}
                          className={`inline-grid h-6 w-6 place-items-center rounded-lg border transition ${
                            checked
                              ? 'border-primary-500 bg-primary-500 text-white shadow-sm shadow-primary-500/40'
                              : 'border-slate-300 bg-white/80 text-transparent hover:border-primary-400 dark:border-white/15 dark:bg-white/5'
                          } ${locked ? 'cursor-not-allowed opacity-60' : ''}`}
                        >
                          <Check size={14} />
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="admin-card text-xs text-slate-500 dark:text-slate-400">
        <p>
          · <span className="font-medium text-slate-600 dark:text-slate-300">游客</span>
          代表未登录访客，其权限对所有未登录访问生效。
        </p>
        <p className="mt-1">
          · 拥有<span className="font-medium text-slate-600 dark:text-slate-300">上传免审</span>
          的用户上传后会直接发布，其余用户上传的壁纸会进入「内容审核」队列。
        </p>
      </div>
    </div>
  )
}
