import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react'
import { useSite } from '../App'
import CategoryOptions from '../components/CategoryOptions'
import WallpaperGrid from '../components/WallpaperGrid'

const ORIENTATIONS = [
  { value: '', label: '全部方向' },
  { value: 'landscape', label: '横图' },
  { value: 'portrait', label: '竖图' },
  { value: 'square', label: '方图' },
]

const SORTS = [
  { value: 'latest', label: '最新发布' },
  { value: 'popular', label: '最多浏览' },
  { value: 'downloads', label: '最多下载' },
]

/** 分辨率下限：只关心「至少多宽」，故同时给出宽高下限 */
const RESOLUTIONS = [
  { value: '', label: '不限分辨率' },
  { value: '1920x1080', label: '≥ 1080P' },
  { value: '2560x1440', label: '≥ 2K' },
  { value: '3840x2160', label: '≥ 4K' },
  { value: '1080x1920', label: '≥ 手机 1080P' },
]

/** 时间范围用「最近 N 天」表达，提交时换算成 dateFrom */
const WITHIN_RANGES = [
  { value: '', label: '全部时间' },
  { value: '7', label: '最近一周' },
  { value: '30', label: '最近一月' },
  { value: '365', label: '最近一年' },
]

const FORMATS = ['jpg', 'png', 'webp', 'gif', 'avif']

/** 主色分桶（与后端 COLOR_BUCKETS 一致） */
const COLORS = [
  { value: 'red', label: '红', hex: '#ef4444' },
  { value: 'orange', label: '橙', hex: '#f97316' },
  { value: 'yellow', label: '黄', hex: '#eab308' },
  { value: 'green', label: '绿', hex: '#22c55e' },
  { value: 'cyan', label: '青', hex: '#06b6d4' },
  { value: 'blue', label: '蓝', hex: '#3b82f6' },
  { value: 'purple', label: '紫', hex: '#8b5cf6' },
  { value: 'pink', label: '粉', hex: '#ec4899' },
  { value: 'brown', label: '棕', hex: '#92400e' },
  { value: 'gray', label: '灰', hex: '#9ca3af' },
  { value: 'black', label: '黑', hex: '#1f2937' },
  { value: 'white', label: '白', hex: '#f1f5f9' },
]

const fieldClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-primary-500/60 dark:border-white/10 dark:bg-white/5 dark:focus:bg-white/10'
const labelClass = 'text-[11px] text-slate-400'
const chipClass = (active) =>
  `rounded-full border px-2.5 py-1 text-xs transition ${
    active
      ? 'border-primary-500 bg-primary-50 text-primary-600 dark:border-primary-500/60 dark:bg-primary-500/15 dark:text-primary-300'
      : 'border-slate-200 text-slate-500 hover:border-primary-300 hover:text-primary-500 dark:border-white/10 dark:text-slate-400'
  }`

/** 「最近 N 天」→ YYYY-MM-DD */
function dateFromOf(within) {
  const days = Number(within)
  if (!Number.isInteger(days) || days <= 0) return ''
  const d = new Date()
  d.setDate(d.getDate() - days)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export default function Wallpapers() {
  const { categories, tags, loading } = useSite()
  const [searchParams, setSearchParams] = useSearchParams()
  const [keywordInput, setKeywordInput] = useState(searchParams.get('q') || '')
  const [panelOpen, setPanelOpen] = useState(false)

  const raw = {
    q: searchParams.get('q') || '',
    category: searchParams.get('category') || '',
    tag: searchParams.get('tag') || '',
    orientation: searchParams.get('orientation') || '',
    sort: searchParams.get('sort') || 'latest',
    format: searchParams.get('format') || '',
    resolution: searchParams.get('resolution') || '',
    color: searchParams.get('color') || '',
    within: searchParams.get('within') || '',
  }

  const selectedFormats = raw.format ? raw.format.split(',') : []
  const [resW, resH] = raw.resolution ? raw.resolution.split('x') : ['', '']

  const filters = useMemo(
    () => ({
      q: raw.q || undefined,
      category: raw.category || undefined,
      tag: raw.tag || undefined,
      orientation: raw.orientation || undefined,
      sort: raw.sort,
      format: raw.format || undefined,
      minWidth: resW || undefined,
      minHeight: resH || undefined,
      color: raw.color || undefined,
      dateFrom: dateFromOf(raw.within) || undefined,
    }),
    [raw.q, raw.category, raw.tag, raw.orientation, raw.sort, raw.format, resW, resH, raw.color, raw.within],
  )

  const updateFilter = (key, value) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
  }

  const toggleFormat = (value) => {
    const set = new Set(selectedFormats)
    if (set.has(value)) set.delete(value)
    else set.add(value)
    updateFilter('format', [...set].join(','))
  }

  const resetFilters = () => {
    setKeywordInput('')
    setSearchParams({}, { replace: true })
  }

  const submitSearch = (e) => {
    e.preventDefault()
    updateFilter('q', keywordInput.trim())
  }

  const activeCount = [
    raw.category,
    raw.tag,
    raw.orientation,
    raw.format,
    raw.resolution,
    raw.color,
    raw.within,
  ].filter(Boolean).length
  const hasFilter = Boolean(raw.q) || activeCount > 0

  /** 筛选面板内容：桌面端内联展示，移动端放进抽屉，故复用同一份 JSX */
  const panel = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <label className="col-span-2 flex flex-col gap-1 lg:col-span-1">
          <span className={labelClass}>分类</span>
          <select
            value={raw.category}
            onChange={(e) => updateFilter('category', e.target.value)}
            className={fieldClass}
          >
            <option value="">全部分类</option>
            <CategoryOptions categories={categories} includeParents showCount />
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelClass}>标签</span>
          <select
            value={raw.tag}
            onChange={(e) => updateFilter('tag', e.target.value)}
            disabled={loading}
            className={fieldClass}
          >
            <option value="">全部标签</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.slug}>
                {tag.name}（{tag.count ?? 0}）
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelClass}>方向</span>
          <select
            value={raw.orientation}
            onChange={(e) => updateFilter('orientation', e.target.value)}
            className={fieldClass}
          >
            {ORIENTATIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelClass}>分辨率</span>
          <select
            value={raw.resolution}
            onChange={(e) => updateFilter('resolution', e.target.value)}
            className={fieldClass}
          >
            {RESOLUTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelClass}>发布时间</span>
          <select
            value={raw.within}
            onChange={(e) => updateFilter('within', e.target.value)}
            className={fieldClass}
          >
            {WITHIN_RANGES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelClass}>排序</span>
          <select
            value={raw.sort}
            onChange={(e) => updateFilter('sort', e.target.value)}
            className={fieldClass}
          >
            {SORTS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className={labelClass}>格式</span>
        {FORMATS.map((format) => (
          <button
            key={format}
            type="button"
            onClick={() => toggleFormat(format)}
            className={chipClass(selectedFormats.includes(format))}
          >
            {format.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className={labelClass}>颜色</span>
        <button
          type="button"
          onClick={() => updateFilter('color', '')}
          className={chipClass(!raw.color)}
        >
          全部
        </button>
        {COLORS.map((color) => (
          <button
            key={color.value}
            type="button"
            title={color.label}
            aria-label={color.label}
            onClick={() => updateFilter('color', raw.color === color.value ? '' : color.value)}
            className={`h-6 w-6 rounded-full border transition ${
              raw.color === color.value
                ? 'border-primary-500 ring-2 ring-primary-500/40'
                : 'border-slate-200 hover:scale-110 dark:border-white/15'
            }`}
            style={{ backgroundColor: color.hex }}
          />
        ))}
      </div>
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">全部壁纸</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            按分类、标签、尺寸、颜色与时间筛选
          </p>
        </div>
        {hasFilter ? (
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-500 transition hover:border-primary-500/50 hover:text-primary-500 dark:border-white/10 dark:text-slate-400"
          >
            <RotateCcw size={14} />
            清空筛选
          </button>
        ) : null}
      </div>

      {/* 搜索框 + 筛选入口 */}
      <div className="flex items-center gap-2">
        <form onSubmit={submitSearch} className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            placeholder="搜索关键词，回车确认…"
            className={`${fieldClass} pl-9`}
          />
        </form>
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          className="relative inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 transition hover:border-primary-300 hover:text-primary-500 dark:border-white/10 dark:text-slate-300 lg:hidden"
        >
          <SlidersHorizontal size={15} />
          筛选
          {activeCount > 0 ? (
            <span className="ml-0.5 rounded-full bg-primary-500 px-1.5 text-[11px] font-medium text-white">
              {activeCount}
            </span>
          ) : null}
        </button>
      </div>

      {/* 桌面端：筛选面板内联展示 */}
      <div className="hidden rounded-2xl border border-slate-200 p-4 dark:border-white/10 lg:block">
        {panel}
      </div>

      {/* 移动端：底部抽屉 */}
      {panelOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="关闭筛选"
            onClick={() => setPanelOpen(false)}
            className="absolute inset-0 bg-slate-900/40"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white p-4 dark:bg-ink-900">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">筛选</h2>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-white/10"
              >
                <X size={16} />
              </button>
            </div>
            {panel}
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={resetFilters} className="flex-1 rounded-lg border border-slate-200 py-2 text-sm text-slate-600 dark:border-white/10 dark:text-slate-300">
                重置
              </button>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                className="flex-1 rounded-lg bg-primary-500 py-2 text-sm font-medium text-white"
              >
                查看结果
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <WallpaperGrid
        filters={filters}
        uniformRatio="16 / 9"
        emptyText="没有符合条件的壁纸，试试调整筛选条件"
      />
    </div>
  )
}