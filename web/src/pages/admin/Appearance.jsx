import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, RotateCcw, Save, Trash2, Upload, X } from 'lucide-react'
import { api, xhrUpload } from '../../lib/api'
import { useToast } from '../../components/Toast'
import Spinner from '../../components/Spinner'
import Skeleton from '../../components/Skeleton'

const labelClass = 'text-xs font-medium text-slate-500 dark:text-slate-400'

/** Banner 背景图的三种布局方式 */
const BANNER_MODES = [
  { value: 'cover', label: '铺满', hint: '固定高度，图片等比放大铺满整宽，上下裁切（推荐）' },
  { value: 'stretch', label: '拉伸', hint: '固定高度，强制拉伸填满，图片会被拉变形' },
  { value: 'adapt', label: '自适应', hint: 'Banner 高度跟着图片比例走，整张图完整显示' },
]

/** 链接可见性：决定前台在什么状态下展示该链接 */
const VISIBILITIES = [
  { value: 'all', label: '所有人' },
  { value: 'auth', label: '仅登录' },
  { value: 'guest', label: '仅游客' },
  { value: 'admin', label: '仅管理员' },
]

const FIT = { cover: 'cover', stretch: 'fill' }

const EMPTY_BANNER = {
  enabled: true,
  mode: 'cover',
  image: '',
  title: '',
  subtitle: '',
  height: 320,
  overlay: 55,
  showSearch: true,
  showHotTags: true,
}

const EMPTY_FOOTER = { promoTitle: '', promoText: '', columns: [] }

function visibilityOf(item) {
  if (item.adminOnly) return 'admin'
  if (item.authOnly) return 'auth'
  if (item.guestOnly) return 'guest'
  return 'all'
}

function withVisibility(item, visibility) {
  return {
    ...item,
    authOnly: visibility === 'auth',
    guestOnly: visibility === 'guest',
    adminOnly: visibility === 'admin',
  }
}

/** 小开关：复用于 Banner 的启用 / 显示搜索 / 显示标签 */
function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="flex items-start gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-primary-500 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-800"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-slate-400">{hint}</span> : null}
      </span>
    </label>
  )
}

/* ============================ 首页 Banner ============================ */

export function AppearanceBanner() {
  const toast = useToast()
  const fileRef = useRef(null)
  const [banner, setBanner] = useState(EMPTY_BANNER)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .get('/api/admin/appearance', { auth: true })
      .then((data) => {
        if (cancelled) return
        setBanner({ ...EMPTY_BANNER, ...(data?.banner || {}) })
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

  const patchBanner = (patch) => setBanner((prev) => ({ ...prev, ...patch }))

  // 自适应（且有图）时高度由图片比例决定，固定高度的滑杆与裁切逻辑都不生效
  const previewAdapt = (banner.mode || 'cover') === 'adapt' && Boolean(banner.image)

  const uploadBanner = async (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('请选择图片文件')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Banner 图片不能超过 5MB')
      return
    }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const data = await xhrUpload('/api/admin/appearance/banner', formData, { auth: true })
      patchBanner({ image: data?.url || '' })
      toast.success('Banner 图片已上传，别忘了点保存')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setUploading(false)
    }
  }

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const data = await api.put('/api/admin/appearance', { banner }, { auth: true })
      setBanner({ ...EMPTY_BANNER, ...(data?.banner || {}) })
      toast.success('首页 Banner 已保存，刷新前台即可看到效果')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    )
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <div>
        <h1 className="admin-title">首页 Banner</h1>
        <p className="admin-subtitle">设置首页顶部 Banner 的布局、文案与显示项</p>
      </div>

      <section className="admin-card space-y-4">
        <Toggle
          checked={banner.enabled}
          onChange={(checked) => patchBanner({ enabled: checked })}
          label="显示首页 Banner"
          hint="关闭后首页直接进入壁纸分区"
        />

        <div className="space-y-2">
          <span className={labelClass}>图片布局方式</span>
          <div className="grid gap-3 sm:grid-cols-3">
            {BANNER_MODES.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => patchBanner({ mode: item.value })}
                className={`rounded-2xl border p-3 text-left transition ${
                  banner.mode === item.value
                    ? 'border-primary-400 bg-primary-50/80 shadow-md shadow-primary-500/10 dark:border-primary-500 dark:bg-primary-500/10'
                    : 'border-slate-200 bg-white hover:border-primary-200 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20'
                }`}
              >
                <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">{item.label}</span>
                <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{item.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <span className={labelClass}>背景图片（自定义）</span>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative h-24 w-40 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 dark:border-white/10 dark:bg-white/5">
              {banner.image ? (
                <img src={banner.image} alt="Banner 预览" className="h-full w-full object-cover" />
              ) : (
                <span className="grid h-full place-items-center text-xs text-slate-400">未设置</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="admin-btn"
              >
                {uploading ? <Spinner size={15} /> : <Upload size={15} />}
                {uploading ? '上传中…' : '上传图片'}
              </button>
              {banner.image ? (
                <button type="button" onClick={() => patchBanner({ image: '' })} className="admin-btn">
                  <X size={15} />
                  清除
                </button>
              ) : null}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  uploadBanner(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </div>
          </div>
          <input
            value={banner.image}
            onChange={(e) => patchBanner({ image: e.target.value })}
            placeholder="也可直接填写图片地址，如 /uploads/banners/xxx.jpg 或 https://…"
            className="admin-input"
          />
          <p className="text-xs text-slate-400">
            铺满 / 拉伸模式下 Banner 高度固定（滑杆可调）；自适应模式高度由图片比例决定。建议用超宽大图（≥1920×600），
            图太小放大后会发虚；留空则使用渐变底色
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className={labelClass}>主标题（留空用站点标题）</span>
            <input
              value={banner.title}
              onChange={(e) => patchBanner({ title: e.target.value })}
              placeholder="壁纸集"
              className="admin-input"
            />
          </label>
          <label className="space-y-1.5">
            <span className={labelClass}>副标题（留空用站点描述）</span>
            <input
              value={banner.subtitle}
              onChange={(e) => patchBanner({ subtitle: e.target.value })}
              placeholder="发现并下载高质量桌面 / 手机壁纸"
              className="admin-input"
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className={labelClass}>
              Banner 高度：{banner.height} px
              {previewAdapt ? <span className="ml-1 text-slate-400">（自适应模式下不生效）</span> : null}
            </span>
            <input
              type="range"
              min={160}
              max={720}
              step={10}
              value={banner.height}
              onChange={(e) => patchBanner({ height: Number(e.target.value) })}
              disabled={previewAdapt}
              className="w-full accent-primary-500 disabled:opacity-40"
            />
          </label>
          <label className="space-y-1.5">
            <span className={labelClass}>文字遮罩浓度：{banner.overlay}%</span>
            <input
              type="range"
              min={0}
              max={95}
              step={5}
              value={banner.overlay}
              onChange={(e) => patchBanner({ overlay: Number(e.target.value) })}
              className="w-full accent-primary-500"
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Toggle
            checked={banner.showSearch}
            onChange={(checked) => patchBanner({ showSearch: checked })}
            label="显示搜索框"
          />
          <Toggle
            checked={banner.showHotTags}
            onChange={(checked) => patchBanner({ showHotTags: checked })}
            label="显示热门标签"
          />
        </div>

        {/* 实时预览 */}
        <div className="space-y-2">
          <span className={labelClass}>预览</span>
          <div
            className="relative overflow-hidden rounded-2xl bg-slate-900"
            style={previewAdapt ? { maxHeight: 320 } : { height: Math.min(banner.height, 240) }}
          >
            {banner.image ? (
              previewAdapt ? (
                <img src={banner.image} alt="" className="block h-auto w-full" />
              ) : (
                <img
                  src={banner.image}
                  alt=""
                  className="absolute inset-0 h-full w-full"
                  style={{ objectFit: FIT[banner.mode] || 'cover' }}
                />
              )
            ) : (
              <div className="absolute inset-0 bg-[radial-gradient(60%_80%_at_20%_15%,rgba(22,93,255,0.45),transparent_60%),radial-gradient(55%_70%_at_85%_10%,rgba(99,102,241,0.35),transparent_60%)]" />
            )}
            <div
              className="absolute inset-0"
              style={{ backgroundColor: `rgba(2,6,23,${banner.overlay / 100})` }}
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-4 text-center">
              <p className="text-lg font-semibold text-white">{banner.title || '站点标题'}</p>
              <p className="text-xs text-white/70">{banner.subtitle || '站点描述'}</p>
            </div>
          </div>
        </div>

        <button type="submit" disabled={saving} className="admin-btn-primary">
          {saving ? <Spinner size={15} /> : <Save size={15} />}
          保存 Banner 设置
        </button>
      </section>
    </form>
  )
}

/* ============================== 页脚管理 ============================== */

export function AppearanceFooter() {
  const toast = useToast()
  const [footer, setFooter] = useState(EMPTY_FOOTER)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .get('/api/admin/appearance', { auth: true })
      .then((data) => {
        if (cancelled) return
        setFooter({
          promoTitle: data?.footer?.promoTitle || '',
          promoText: data?.footer?.promoText || '',
          columns: Array.isArray(data?.footer?.columns) ? data.footer.columns : [],
        })
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

  const patchColumn = (index, patch) =>
    setFooter((prev) => ({
      ...prev,
      columns: prev.columns.map((col, i) => (i === index ? { ...col, ...patch } : col)),
    }))

  const moveColumn = (index, delta) =>
    setFooter((prev) => {
      const next = [...prev.columns]
      const target = index + delta
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return { ...prev, columns: next }
    })

  const removeColumn = (index) =>
    setFooter((prev) => ({ ...prev, columns: prev.columns.filter((_, i) => i !== index) }))

  const addColumn = () =>
    setFooter((prev) => ({
      ...prev,
      columns: [...prev.columns, { title: '新栏目', items: [{ label: '', to: '' }], notes: [] }],
    }))

  const resetColumns = async () => {
    try {
      const data = await api.get('/api/admin/appearance/footer-defaults', { auth: true })
      setFooter((prev) => ({ ...prev, columns: data?.columns || [] }))
      toast.info('已填回默认栏目，点保存后生效')
    } catch (err) {
      toast.error(err.message)
    }
  }

  const patchItem = (colIndex, itemIndex, patch) =>
    patchColumn(colIndex, {
      items: footer.columns[colIndex].items.map((item, i) => (i === itemIndex ? { ...item, ...patch } : item)),
    })

  const addItem = (colIndex) =>
    patchColumn(colIndex, { items: [...footer.columns[colIndex].items, { label: '', to: '' }] })

  const removeItem = (colIndex, itemIndex) =>
    patchColumn(colIndex, { items: footer.columns[colIndex].items.filter((_, i) => i !== itemIndex) })

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const data = await api.put('/api/admin/appearance', { footer }, { auth: true })
      setFooter({
        promoTitle: data?.footer?.promoTitle || '',
        promoText: data?.footer?.promoText || '',
        columns: Array.isArray(data?.footer?.columns) ? data.footer.columns : [],
      })
      toast.success('页脚设置已保存，刷新前台即可看到效果')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <div>
        <h1 className="admin-title">页脚管理</h1>
        <p className="admin-subtitle">设置前台页脚的宣传文案与链接栏目</p>
      </div>

      <section className="admin-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">栏目设置</h2>
          <button type="button" onClick={resetColumns} className="admin-btn text-xs">
            <RotateCcw size={14} />
            恢复默认栏目
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className={labelClass}>宣传标题（留空用站点标题）</span>
            <input
              value={footer.promoTitle}
              onChange={(e) => setFooter((prev) => ({ ...prev, promoTitle: e.target.value }))}
              placeholder="壁纸集"
              className="admin-input"
            />
          </label>
          <label className="space-y-1.5">
            <span className={labelClass}>宣传文案（留空用站点描述）</span>
            <input
              value={footer.promoText}
              onChange={(e) => setFooter((prev) => ({ ...prev, promoText: e.target.value }))}
              placeholder="收录高清桌面与手机壁纸，支持分类、标签检索与一键下载原图。"
              className="admin-input"
            />
          </label>
        </div>

        {footer.columns.map((column, colIndex) => (
          <div
            key={colIndex}
            className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/5"
          >
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={column.title}
                onChange={(e) => patchColumn(colIndex, { title: e.target.value })}
                placeholder="栏目名称，如：浏览"
                className="admin-input sm:max-w-56"
              />
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => moveColumn(colIndex, -1)}
                  disabled={colIndex === 0}
                  title="上移"
                  className="admin-btn px-2 py-1.5"
                >
                  <ArrowUp size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => moveColumn(colIndex, 1)}
                  disabled={colIndex === footer.columns.length - 1}
                  title="下移"
                  className="admin-btn px-2 py-1.5"
                >
                  <ArrowDown size={15} />
                </button>
                <button type="button" onClick={() => removeColumn(colIndex)} title="删除栏目" className="admin-btn-danger px-2 py-1.5">
                  <Trash2 size={14} />
                  删除
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <span className={labelClass}>链接</span>
              {column.items.map((item, itemIndex) => (
                <div key={itemIndex} className="flex flex-wrap items-center gap-2">
                  <input
                    value={item.label}
                    onChange={(e) => patchItem(colIndex, itemIndex, { label: e.target.value })}
                    placeholder="显示文字"
                    className="admin-input sm:w-40"
                  />
                  <input
                    value={item.to}
                    onChange={(e) => patchItem(colIndex, itemIndex, { to: e.target.value })}
                    placeholder="链接地址，如 /wallpapers 或 https://…"
                    className="admin-input sm:min-w-64 sm:flex-1"
                  />
                  <select
                    value={visibilityOf(item)}
                    onChange={(e) =>
                      patchColumn(colIndex, {
                        items: column.items.map((row, i) =>
                          i === itemIndex ? withVisibility(row, e.target.value) : row,
                        ),
                      })
                    }
                    className="admin-input sm:w-32"
                  >
                    {VISIBILITIES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeItem(colIndex, itemIndex)}
                    title="删除链接"
                    className="admin-btn px-2 py-2"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => addItem(colIndex)}
                className="inline-flex items-center gap-1 text-xs text-primary-600 transition hover:underline dark:text-primary-400"
              >
                <Plus size={14} />
                添加链接
              </button>
            </div>

            <label className="block space-y-1.5">
              {/* 备注为纯文字行，一行一条，适合放「壁纸均来自网络收集」这类声明 */}
              <span className={labelClass}>说明文字（一行一条，可留空）</span>
              <textarea
                rows={2}
                value={(column.notes || []).join('\n')}
                onChange={(e) => patchColumn(colIndex, { notes: e.target.value.split('\n') })}
                placeholder={'壁纸均来自网络收集\n仅供个人学习与欣赏'}
                className="admin-input resize-y"
              />
            </label>
          </div>
        ))}

        <button type="button" onClick={addColumn} className="admin-btn text-sm">
          <Plus size={15} />
          添加栏目
        </button>

        <div>
          <button type="submit" disabled={saving} className="admin-btn-primary">
            {saving ? <Spinner size={15} /> : <Save size={15} />}
            保存页脚设置
          </button>
        </div>
      </section>
    </form>
  )
}

/* ============================== 网站图标 ============================== */

export function AppearanceLogo() {
  const toast = useToast()
  const fileRef = useRef(null)
  const [logo, setLogo] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .get('/api/admin/appearance', { auth: true })
      .then((data) => {
        if (cancelled) return
        setLogo(data?.logo || '')
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

  const uploadLogo = async (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('请选择图片文件')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Logo 图片不能超过 2MB')
      return
    }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const data = await xhrUpload('/api/admin/appearance/logo', formData, { auth: true })
      setLogo(data?.url || '')
      toast.success('Logo 已上传，别忘了点保存')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setUploading(false)
    }
  }

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const data = await api.put('/api/admin/appearance', { logo }, { auth: true })
      setLogo(data?.logo || '')
      toast.success('网站图标已保存，刷新前台即可看到效果')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <div>
        <h1 className="admin-title">网站图标</h1>
        <p className="admin-subtitle">自定义导航栏左侧 Logo；留空则只显示站点标题</p>
      </div>

      <section className="admin-card space-y-4">
        <div className="space-y-2">
          <span className={labelClass}>Logo 图标（固定高度、宽度自适应，留空显示站点标题）</span>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-16 w-44 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/5">
              {logo ? (
                <img src={logo} alt="Logo 预览" className="max-h-10 max-w-[150px] object-contain" />
              ) : (
                <span className="text-xs text-slate-400">未设置</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="admin-btn"
              >
                {uploading ? <Spinner size={15} /> : <Upload size={15} />}
                {uploading ? '上传中…' : '上传图片'}
              </button>
              {logo ? (
                <button type="button" onClick={() => setLogo('')} className="admin-btn">
                  <X size={15} />
                  清除
                </button>
              ) : null}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  uploadLogo(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </div>
          </div>
          <input
            value={logo}
            onChange={(e) => setLogo(e.target.value)}
            placeholder="也可直接填写图片地址，如 /uploads/logo/xxx.png 或 https://…"
            className="admin-input"
          />
          <p className="text-xs text-slate-400">
            建议使用透明底 PNG / SVG（≤2MB），前台固定 32px 高、宽度按原比例自适应，长图也不会撑破导航栏
          </p>
        </div>

        <button type="submit" disabled={saving} className="admin-btn-primary">
          {saving ? <Spinner size={15} /> : <Save size={15} />}
          保存网站图标
        </button>
      </section>
    </form>
  )
}
