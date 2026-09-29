import { useCallback, useEffect, useState } from 'react'
import { Cloud, HardDrive, Pencil, PlugZap, Plus, Save, Server, Trash2 } from 'lucide-react'
import { api } from '../../lib/api'
import { useToast } from '../../components/Toast'
import Modal from '../../components/Modal'
import Spinner from '../../components/Spinner'
import Skeleton from '../../components/Skeleton'
import { formatNumber } from '../../lib/format'

const DRIVERS = [
  { value: 'local', label: '本机存储', desc: '图片保存到服务器本地磁盘', icon: HardDrive },
  { value: 's3', label: 'S3 兼容存储', desc: 'AWS S3 / MinIO / 七牛等，单套上传设置', icon: Server },
  { value: 'r2', label: 'Cloudflare R2', desc: 'CF R2 多账号池，按策略轮询分发', icon: Cloud },
]

const STRATEGIES = [
  { value: 'round_robin', label: '轮询', desc: '按权重顺序依次分配，流量最均匀' },
  { value: 'random', label: '随机', desc: '每次随机挑选一个可用账号' },
  { value: 'least_used', label: '最少使用', desc: '优先选择已用次数最少的账号' },
]

const inputClass = 'admin-input'

const labelClass = 'text-xs font-medium text-slate-500 dark:text-slate-400'

const EMPTY_S3 = {
  configured: false,
  endpoint: '',
  region: 'us-east-1',
  accessKeyId: '',
  secretAccessKey: '',
  bucket: '',
  publicUrl: '',
  forcePathStyle: false,
}

const EMPTY_ACCOUNT = {
  name: '',
  accountId: '',
  endpoint: '',
  region: '',
  accessKeyId: '',
  secretAccessKey: '',
  bucket: '',
  publicUrl: '',
  forcePathStyle: false,
  enabled: true,
  weight: 1,
}

export default function Storage() {
  const toast = useToast()
  const [config, setConfig] = useState(null)
  /* 当前「正在查看」的驱动区块，与已生效的 config.driver 解耦：
     切到一个尚未配置好的驱动时先展示它的配置区，方便用户补全后再真正启用。 */
  const [viewDriver, setViewDriver] = useState('local')
  const [s3, setS3] = useState(EMPTY_S3)
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingConfig, setSavingConfig] = useState(false)
  const [savingLocal, setSavingLocal] = useState(false)
  const [savingS3, setSavingS3] = useState(false)
  const [testingS3, setTestingS3] = useState(false)
  const [editing, setEditing] = useState(null)
  const [savingAccount, setSavingAccount] = useState(false)
  const [testingId, setTestingId] = useState(null)

  const loadAccounts = useCallback(async () => {
    try {
      const data = await api.get('/api/admin/storage/accounts', { auth: true })
      setAccounts(Array.isArray(data) ? data : [])
    } catch (err) {
      toast.error(err.message)
    }
  }, [toast])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      api.get('/api/admin/storage/config', { auth: true }),
      api.get('/api/admin/storage/s3', { auth: true }),
      api.get('/api/admin/storage/accounts', { auth: true }),
    ])
      .then(([configData, s3Data, accountData]) => {
        if (cancelled) return
        setConfig({
          driver: configData?.driver || 'local',
          strategy: configData?.strategy || 'round_robin',
          local: { dir: configData?.local?.dir || '', publicUrl: configData?.local?.publicUrl || '' },
        })
        setViewDriver(configData?.driver || 'local')
        // 密钥不回填到输入框：已配置时留空即表示沿用原密钥
        setS3({ ...EMPTY_S3, ...s3Data, secretAccessKey: '' })
        setAccounts(Array.isArray(accountData) ? accountData : [])
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

  /* ------------------------------ 存储驱动 / 策略 ------------------------------ */

  const saveConfig = async (next) => {
    setSavingConfig(true)
    try {
      const updated = await api.put(
        '/api/admin/storage/config',
        {
          driver: next.driver,
          strategy: next.strategy,
          local: { dir: next.local.dir, publicUrl: next.local.publicUrl },
        },
        { auth: true }
      )
      setConfig({
        driver: updated?.driver || next.driver,
        strategy: updated?.strategy || next.strategy,
        local: {
          dir: updated?.local?.dir ?? next.local.dir,
          publicUrl: updated?.local?.publicUrl ?? next.local.publicUrl,
        },
      })
      return true
    } catch (err) {
      toast.error(err.message)
      return false
    } finally {
      setSavingConfig(false)
    }
  }

  const changeDriver = async (driver) => {
    if (!config) return
    // 先切到该驱动的配置区，即使它还没配置好也能看到表单去补全
    setViewDriver(driver)
    if (config.driver === driver) return
    const previous = config
    const next = { ...config, driver }
    setConfig(next)
    const ok = await saveConfig(next)
    if (ok) toast.success(`已切换为「${DRIVERS.find((d) => d.value === driver)?.label}」`)
    else setConfig(previous)
  }

  /** 配置补全后尝试真正启用某个驱动（用户此前点过该卡片但被守卫拦下） */
  const activateDriver = async (driver) => {
    if (!config || config.driver === driver) return
    const next = { ...config, driver }
    const ok = await saveConfig(next)
    if (ok) {
      setConfig(next)
      setViewDriver(driver)
      toast.success(`已切换为「${DRIVERS.find((d) => d.value === driver)?.label}」`)
    }
  }

  const changeStrategy = async (strategy) => {
    if (!config || config.strategy === strategy) return
    const previous = config
    const next = { ...config, strategy }
    setConfig(next)
    const ok = await saveConfig(next)
    if (ok) toast.success('分配策略已更新')
    else setConfig(previous)
  }

  const saveLocal = async () => {
    if (!config) return
    setSavingLocal(true)
    const ok = await saveConfig(config)
    setSavingLocal(false)
    if (ok) toast.success('本机存储配置已保存')
  }

  /* ------------------------------- S3 上传设置 ------------------------------- */

  /** S3 表单统一校验，返回错误文案或 null */
  const validateS3Form = () => {
    if (!s3.endpoint.trim()) return '请填写 Endpoint'
    if (!s3.accessKeyId.trim()) return '请填写 Access Key ID'
    if (!s3.bucket.trim()) return '请填写 Bucket'
    // 首次配置必须填 Secret；已保存过则留空表示沿用原密钥
    if (!s3.configured && !s3.secretAccessKey) return '请填写 Secret Access Key'
    return null
  }

  const s3Payload = () => ({
    endpoint: s3.endpoint.trim(),
    region: s3.region.trim() || 'us-east-1',
    accessKeyId: s3.accessKeyId.trim(),
    secretAccessKey: s3.secretAccessKey,
    bucket: s3.bucket.trim(),
    publicUrl: s3.publicUrl.trim(),
    forcePathStyle: s3.forcePathStyle,
  })

  const saveS3 = async () => {
    const error = validateS3Form()
    if (error) {
      toast.error(error)
      return
    }
    setSavingS3(true)
    try {
      const updated = await api.put('/api/admin/storage/s3', s3Payload(), { auth: true })
      setS3({ ...EMPTY_S3, ...updated, secretAccessKey: '' })
      toast.success('S3 上传设置已保存')
      // 配置齐了，若用户此前点过 S3 卡片被拦下，这里自动完成切换
      await activateDriver('s3')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSavingS3(false)
    }
  }

  const testS3 = async () => {
    const error = validateS3Form()
    if (error) {
      toast.error(error)
      return
    }
    setTestingS3(true)
    try {
      const res = await api.post('/api/admin/storage/s3/test', s3Payload(), { auth: true })
      if (res?.ok) toast.success(`S3 连接成功：${res.message || 'OK'}`)
      else toast.error(`S3 连接失败：${res?.message || '未知错误'}`)
    } catch (err) {
      toast.error(`S3 连接失败：${err.message}`)
    } finally {
      setTestingS3(false)
    }
  }

  /* -------------------------------- R2 账号池 -------------------------------- */

  const testAccount = async (account) => {
    setTestingId(account.id)
    try {
      const res = await api.post(`/api/admin/storage/accounts/${account.id}/test`, undefined, {
        auth: true,
      })
      if (res?.ok) toast.success(`「${account.name}」连接成功：${res.message || 'OK'}`)
      else toast.error(`「${account.name}」连接失败：${res?.message || '未知错误'}`)
    } catch (err) {
      toast.error(`「${account.name}」连接失败：${err.message}`)
    } finally {
      setTestingId(null)
    }
  }

  const toggleEnabled = async (account) => {
    try {
      const updated = await api.patch(
        `/api/admin/storage/accounts/${account.id}`,
        { enabled: !account.enabled },
        { auth: true }
      )
      setAccounts((prev) => prev.map((item) => (item.id === account.id ? updated : item)))
      toast.success(updated.enabled ? '账号已启用' : '账号已停用')
      if (updated.enabled) await activateDriver('r2')
    } catch (err) {
      toast.error(err.message)
    }
  }

  const removeAccount = async (account) => {
    if (!window.confirm(`确定删除存储账号「${account.name}」吗？`)) return
    try {
      await api.del(`/api/admin/storage/accounts/${account.id}`, { auth: true })
      toast.success('账号已删除')
      loadAccounts()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const saveAccount = async () => {
    if (!editing.name.trim()) {
      toast.error('请填写账号名称')
      return
    }
    if (!editing.accessKeyId.trim() || !editing.bucket.trim()) {
      toast.error('请填写 Access Key ID 与 Bucket')
      return
    }
    if (!editing.id && !editing.secretAccessKey) {
      toast.error('请填写 Secret Access Key')
      return
    }
    setSavingAccount(true)
    try {
      const payload = {
        name: editing.name.trim(),
        accountId: editing.accountId.trim() || undefined,
        endpoint: editing.endpoint.trim() || undefined,
        region: editing.region.trim() || undefined,
        accessKeyId: editing.accessKeyId.trim(),
        bucket: editing.bucket.trim(),
        publicUrl: editing.publicUrl.trim() || undefined,
        forcePathStyle: editing.forcePathStyle,
        enabled: editing.enabled,
        weight: Number(editing.weight) || 1,
      }
      // 编辑时 Secret 留空表示不修改
      if (editing.secretAccessKey) payload.secretAccessKey = editing.secretAccessKey

      if (editing.id) await api.patch(`/api/admin/storage/accounts/${editing.id}`, payload, { auth: true })
      else await api.post('/api/admin/storage/accounts', payload, { auth: true })

      toast.success(editing.id ? '账号已更新' : '账号已添加')
      setEditing(null)
      loadAccounts()
      // 有了启用的账号，若用户此前点过 R2 卡片被拦下，这里自动完成切换
      if (editing.enabled) await activateDriver('r2')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSavingAccount(false)
    }
  }

  if (loading || !config) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  const { driver } = config
  const enabledR2 = accounts.filter((item) => item.enabled).length
  // 配置区跟随「正在查看」的驱动，卡片高亮也用它；「使用中」才是真正生效的驱动
  const active = viewDriver

  return (
    <div className="space-y-6">
      <div>
        <h1 className="admin-title">存储设置</h1>
        <p className="admin-subtitle">
          选择图片的存储方式，上传的图片会自动写入所选存储
        </p>
      </div>

      {/* 驱动切换 */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">存储驱动</h2>
          {savingConfig ? <Spinner size={14} className="text-slate-400" /> : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {DRIVERS.map((item) => {
            const Icon = item.icon
            const selected = active === item.value
            const inUse = driver === item.value
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => changeDriver(item.value)}
                disabled={savingConfig}
                className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition disabled:opacity-60 ${
                  selected
                    ? 'border-primary-400/70 bg-primary-50/70 shadow-lg shadow-primary-500/20 ring-1 ring-primary-400/60 dark:border-primary-500/50 dark:bg-primary-500/10'
                    : 'border-slate-200 bg-white shadow-sm hover:border-primary-300 dark:border-white/10 dark:bg-white/[0.045]'
                }`}
              >
                <span
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${
                    selected ? 'bg-primary-500 text-white' : 'bg-white text-slate-500 dark:bg-white/10 dark:text-slate-300'
                  }`}
                >
                  <Icon size={18} />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {item.label}
                    {inUse ? (
                      <span className="admin-badge bg-emerald-50 font-normal text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
                        使用中
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{item.desc}</span>
                </span>
              </button>
            )
          })}
        </div>
        {active !== driver ? (
          <p className="rounded-2xl border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
            当前实际生效的仍是「{DRIVERS.find((d) => d.value === driver)?.label}
            」。把下面的配置填写并保存后会自动切换过去。
          </p>
        ) : null}
      </section>

      {/* 本机存储配置：只有本机模式需要，无分配策略 */}
      {active === 'local' ? (
        <section className="admin-card space-y-4">
          <div>
            <h2 className="text-sm font-semibold">本机存储配置</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              图片直接写入服务器磁盘，由本服务提供访问
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className={labelClass}>存储目录</span>
              <input
                value={config.local.dir}
                onChange={(e) => setConfig((prev) => ({ ...prev, local: { ...prev.local, dir: e.target.value } }))}
                placeholder="uploads"
                className={inputClass}
              />
            </label>
            <label className="space-y-1.5">
              <span className={labelClass}>公开访问 URL 前缀</span>
              <input
                value={config.local.publicUrl}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, local: { ...prev.local, publicUrl: e.target.value } }))
                }
                placeholder="/uploads"
                className={inputClass}
              />
            </label>
          </div>
          <button
            type="button"
            onClick={saveLocal}
            disabled={savingLocal}
            className="admin-btn-primary"
          >
            {savingLocal ? <Spinner size={15} /> : <Save size={15} />}
            保存本机配置
          </button>
        </section>
      ) : null}

      {/* S3 上传设置：单套配置，无分配策略 */}
      {active === 's3' ? (
        <section className="admin-card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">S3 上传设置</h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                支持 AWS S3、MinIO、七牛等 S3 兼容服务（本模式为单套配置）
              </p>
            </div>
            {s3.configured ? (
              <span className="admin-badge bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
                已配置
              </span>
            ) : (
              <span className="admin-badge bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300">
                未配置
              </span>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 sm:col-span-2">
              <span className={labelClass}>Endpoint *</span>
              <input
                value={s3.endpoint}
                onChange={(e) => setS3((prev) => ({ ...prev, endpoint: e.target.value }))}
                placeholder="https://s3.us-east-1.amazonaws.com 或 https://minio.example.com"
                className={inputClass}
              />
            </label>
            <label className="space-y-1.5">
              <span className={labelClass}>Region</span>
              <input
                value={s3.region}
                onChange={(e) => setS3((prev) => ({ ...prev, region: e.target.value }))}
                placeholder="us-east-1"
                className={inputClass}
              />
            </label>
            <label className="space-y-1.5">
              <span className={labelClass}>Bucket *</span>
              <input
                value={s3.bucket}
                onChange={(e) => setS3((prev) => ({ ...prev, bucket: e.target.value }))}
                placeholder="my-wallpapers"
                className={inputClass}
              />
            </label>
            <label className="space-y-1.5">
              <span className={labelClass}>Access Key ID *</span>
              <input
                value={s3.accessKeyId}
                onChange={(e) => setS3((prev) => ({ ...prev, accessKeyId: e.target.value }))}
                className={inputClass}
              />
            </label>
            <label className="space-y-1.5">
              <span className={labelClass}>
                Secret Access Key {s3.configured ? '（留空表示不修改）' : '*'}
              </span>
              <input
                type="password"
                value={s3.secretAccessKey}
                onChange={(e) => setS3((prev) => ({ ...prev, secretAccessKey: e.target.value }))}
                placeholder={s3.configured ? '••••••••' : ''}
                autoComplete="new-password"
                className={inputClass}
              />
            </label>
            <label className="space-y-1.5 sm:col-span-2">
              <span className={labelClass}>公开访问 URL</span>
              <input
                value={s3.publicUrl}
                onChange={(e) => setS3((prev) => ({ ...prev, publicUrl: e.target.value }))}
                placeholder="https://cdn.example.com（留空则按 Endpoint + Bucket 拼接）"
                className={inputClass}
              />
            </label>
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={s3.forcePathStyle}
              onChange={(e) => setS3((prev) => ({ ...prev, forcePathStyle: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 accent-primary-500"
            />
            <span className="text-xs text-slate-500 dark:text-slate-400">
              使用 Path Style 访问（MinIO 等自建服务通常需要勾选）
            </span>
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveS3}
              disabled={savingS3}
              className="admin-btn-primary"
            >
              {savingS3 ? <Spinner size={15} /> : <Save size={15} />}
              保存 S3 设置
            </button>
            <button
              type="button"
              onClick={testS3}
              disabled={testingS3}
              className="admin-btn"
            >
              {testingS3 ? <Spinner size={15} /> : <PlugZap size={15} />}
              测试连接
            </button>
          </div>
        </section>
      ) : null}

      {/* R2：分配策略 + 账号池 */}
      {active === 'r2' ? (
        <>
          <section className="admin-card space-y-4">
            <div>
              <h2 className="text-sm font-semibold">分配策略</h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                上传时按该策略从账号池中挑选账号，某账号失败会自动切到其它账号重试
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {STRATEGIES.map((item) => {
                const active = config.strategy === item.value
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => changeStrategy(item.value)}
                    disabled={savingConfig || enabledR2 < 2}
                    className={`rounded-2xl border p-3 text-left transition disabled:opacity-50 ${
                      active
                        ? 'border-primary-400/70 bg-primary-50/70 ring-1 ring-primary-400/50 dark:border-primary-500/50 dark:bg-primary-500/10'
                        : 'border-slate-200 bg-white hover:border-primary-300 dark:border-white/10 dark:bg-white/5'
                    }`}
                  >
                    <span className="block text-sm font-medium">{item.label}</span>
                    <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{item.desc}</span>
                  </button>
                )
              })}
            </div>
            {enabledR2 < 2 ? (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                当前只有 {enabledR2} 个启用的 R2 账号，分配策略要等到启用 2 个以上账号后才会真正参与轮询。
              </p>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                当前有 {enabledR2} 个启用的 R2 账号参与分配
              </p>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">R2 账号池（{accounts.length}）</h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  可添加多个 Cloudflare R2 账号，按权重与分配策略轮询上传
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditing({ ...EMPTY_ACCOUNT })}
                className="admin-btn"
              >
                <Plus size={15} />
                添加账号
              </button>
            </div>

            {accounts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 py-16 text-center text-sm text-slate-400 dark:border-white/10 dark:bg-white/[0.03]">
                还没有 R2 账号，先添加一个吧
              </div>
            ) : (
              <div className="space-y-3">
                {accounts.map((account) => (
                  <div
                    key={account.id}
                    className="admin-card admin-row p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{account.name}</span>
                          <span
                            className={`admin-badge ${
                              account.enabled
                                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300'
                                : 'bg-slate-100/80 text-slate-500 dark:bg-white/5 dark:text-slate-400'
                            }`}
                          >
                            {account.enabled ? '启用中' : '已停用'}
                          </span>
                        </div>
                        <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs text-slate-500 sm:grid-cols-2 dark:text-slate-400">
                          <div className="flex gap-1">
                            <dt>Bucket：</dt>
                            <dd className="truncate text-slate-700 dark:text-slate-300">{account.bucket || '—'}</dd>
                          </div>
                          <div className="flex gap-1">
                            <dt>Endpoint：</dt>
                            <dd className="truncate text-slate-700 dark:text-slate-300">{account.endpoint || '—'}</dd>
                          </div>
                          <div className="flex gap-1 sm:col-span-2">
                            <dt>Public URL：</dt>
                            <dd className="truncate text-slate-700 dark:text-slate-300">{account.publicUrl || '—'}</dd>
                          </div>
                          {account.accountId ? (
                            <div className="flex gap-1">
                              <dt>Account ID：</dt>
                              <dd className="truncate text-slate-700 dark:text-slate-300">{account.accountId}</dd>
                            </div>
                          ) : null}
                          <div className="flex gap-1">
                            <dt>权重 / 已用次数：</dt>
                            <dd className="text-slate-700 dark:text-slate-300">
                              {account.weight ?? 1} / {formatNumber(account.usedCount)}
                            </dd>
                          </div>
                          <div className="flex gap-1 sm:col-span-2">
                            <dt>Secret：</dt>
                            <dd className="truncate text-slate-700 dark:text-slate-300">
                              {account.secretAccessKey || '—'}
                            </dd>
                          </div>
                        </dl>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => toggleEnabled(account)}
                          className="admin-btn px-2.5 py-1.5 text-xs"
                        >
                          {account.enabled ? '停用' : '启用'}
                        </button>
                        <button
                          type="button"
                          onClick={() => testAccount(account)}
                          disabled={testingId === account.id}
                          className="admin-btn px-2.5 py-1.5 text-xs"
                        >
                          {testingId === account.id ? <Spinner size={13} /> : <PlugZap size={13} />}
                          测试连接
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setEditing({
                              id: account.id,
                              name: account.name || '',
                              accountId: account.accountId || '',
                              endpoint: account.endpointRaw || account.endpoint || '',
                              region: account.region || '',
                              accessKeyId: account.accessKeyId || '',
                              secretAccessKey: '',
                              bucket: account.bucket || '',
                              publicUrl: account.publicUrl || '',
                              forcePathStyle: Boolean(account.forcePathStyle),
                              enabled: account.enabled !== false,
                              weight: account.weight ?? 1,
                            })
                          }
                          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-primary-600 dark:hover:bg-white/10 dark:hover:text-primary-300"
                          title="编辑"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeAccount(account)}
                          className="admin-btn-danger px-2 py-1.5"
                          title="删除"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}

      {/* R2 账号编辑弹窗 */}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? '编辑 R2 账号' : '添加 R2 账号'}
        maxWidth="max-w-2xl"
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
              onClick={saveAccount}
              disabled={savingAccount}
              className="admin-btn-primary"
            >
              {savingAccount ? <Spinner size={15} /> : null}
              保存
            </button>
          </>
        }
      >
        {editing ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className={labelClass}>账号名称 *</span>
                <input
                  value={editing.name}
                  onChange={(e) => setEditing((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="例如：R2 主账号"
                  className={inputClass}
                />
              </label>
              <label className="space-y-1.5">
                <span className={labelClass}>R2 Account ID</span>
                <input
                  value={editing.accountId}
                  onChange={(e) => setEditing((prev) => ({ ...prev, accountId: e.target.value }))}
                  placeholder="例如：a1b2c3d4e5f6"
                  className={inputClass}
                />
              </label>
            </div>

            <p className="rounded-2xl border border-amber-200/80 bg-amber-50/80 p-3 text-xs leading-5 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              R2 的 Endpoint 形如 <code>https://&lt;AccountID&gt;.r2.cloudflarestorage.com</code>，Region 填{' '}
              <code>auto</code>；Endpoint 留空时会由后端根据 Account ID 自动生成。
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className={labelClass}>Endpoint（可留空自动生成）</span>
                <input
                  value={editing.endpoint}
                  onChange={(e) => setEditing((prev) => ({ ...prev, endpoint: e.target.value }))}
                  placeholder="https://<AccountID>.r2.cloudflarestorage.com"
                  className={inputClass}
                />
              </label>
              <label className="space-y-1.5">
                <span className={labelClass}>Region</span>
                <input
                  value={editing.region}
                  onChange={(e) => setEditing((prev) => ({ ...prev, region: e.target.value }))}
                  placeholder="auto"
                  className={inputClass}
                />
              </label>
              <label className="space-y-1.5">
                <span className={labelClass}>Access Key ID *</span>
                <input
                  value={editing.accessKeyId}
                  onChange={(e) => setEditing((prev) => ({ ...prev, accessKeyId: e.target.value }))}
                  className={inputClass}
                />
              </label>
              <label className="space-y-1.5">
                <span className={labelClass}>
                  Secret Access Key {editing.id ? '（留空表示不修改）' : '*'}
                </span>
                <input
                  type="password"
                  value={editing.secretAccessKey}
                  onChange={(e) => setEditing((prev) => ({ ...prev, secretAccessKey: e.target.value }))}
                  placeholder={editing.id ? '••••••••' : ''}
                  autoComplete="new-password"
                  className={inputClass}
                />
              </label>
              <label className="space-y-1.5">
                <span className={labelClass}>Bucket *</span>
                <input
                  value={editing.bucket}
                  onChange={(e) => setEditing((prev) => ({ ...prev, bucket: e.target.value }))}
                  className={inputClass}
                />
              </label>
              <label className="space-y-1.5">
                <span className={labelClass}>公开访问 URL</span>
                <input
                  value={editing.publicUrl}
                  onChange={(e) => setEditing((prev) => ({ ...prev, publicUrl: e.target.value }))}
                  placeholder="https://cdn.example.com（R2 自定义域名）"
                  className={inputClass}
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-5">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="number"
                  min="1"
                  value={editing.weight}
                  onChange={(e) => setEditing((prev) => ({ ...prev, weight: e.target.value }))}
                  className="admin-input w-20"
                />
                <span className="text-xs text-slate-500 dark:text-slate-400">权重</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.forcePathStyle}
                  onChange={(e) => setEditing((prev) => ({ ...prev, forcePathStyle: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 accent-primary-500"
                />
                <span className="text-xs text-slate-500 dark:text-slate-400">使用 Path Style 访问</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.enabled}
                  onChange={(e) => setEditing((prev) => ({ ...prev, enabled: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 accent-primary-500"
                />
                <span className="text-xs text-slate-500 dark:text-slate-400">启用该账号</span>
              </label>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
