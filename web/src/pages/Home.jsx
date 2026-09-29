import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { useSite } from '../App'
import WallpaperSection from '../components/WallpaperSection'

/** Banner 三种布局：铺满 / 拉伸用固定高度 + object-fit，自适应按图片比例撑高 */
const BANNER_FIT = { cover: 'cover', stretch: 'fill' }

/**
 * 分区布局由分类的「显示样式」决定：
 * - pc（默认）：保持现有的宽高自适应网格
 * - mobile：竖图适配，卡片按手机竖屏比例，一排最多 6 个
 * - small：小图模式，缩略图更小，一排最多 8 个
 */
const SECTION_LAYOUT = {
  pc: {
    ratio: '16 / 9',
    columns: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4',
    pageSize: 12,
  },
  mobile: {
    ratio: '9 / 16',
    columns: 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6',
    pageSize: 12,
  },
  small: {
    ratio: '1 / 1',
    columns: 'grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8',
    pageSize: 16,
  },
}

/**
 * 标签自动配色：按标签 id 稳定取色，同一个标签每次刷新颜色都不变。
 * 用完整的类名常量，保证 Tailwind 能把它们编译进产物。
 */
const TAG_TONES = [
  'border-rose-100 bg-rose-50 text-rose-600 hover:bg-rose-100 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20',
  'border-amber-100 bg-amber-50 text-amber-600 hover:bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20',
  'border-emerald-100 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20',
  'border-sky-100 bg-sky-50 text-sky-600 hover:bg-sky-100 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20',
  'border-violet-100 bg-violet-50 text-violet-600 hover:bg-violet-100 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/20',
  'border-fuchsia-100 bg-fuchsia-50 text-fuchsia-600 hover:bg-fuchsia-100 dark:border-fuchsia-500/20 dark:bg-fuchsia-500/10 dark:text-fuchsia-300 dark:hover:bg-fuchsia-500/20',
  'border-teal-100 bg-teal-50 text-teal-600 hover:bg-teal-100 dark:border-teal-500/20 dark:bg-teal-500/10 dark:text-teal-300 dark:hover:bg-teal-500/20',
  'border-indigo-100 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20',
]

const tagTone = (tag) => TAG_TONES[Math.abs(Number(tag?.id) || 0) % TAG_TONES.length]

export default function Home() {
  const { site, categories, tags } = useSite()
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState('')

  // 热门标签：按收录数量排序取前 8 个
  const hotTags = useMemo(
    () => [...(tags || [])].sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 8),
    [tags]
  )

  // 首页分区来自分类：后台勾选「主页显示」的分类，按排序依次成区
  const homeSections = useMemo(() => (categories || []).filter((c) => c.showOnHome), [categories])

  // 外观设置（后台可改）：Banner 图片布局 / 高度 / 遮罩 / 是否显示搜索与标签
  const banner = site?.appearance?.banner || {}
  const bannerEnabled = banner.enabled !== false
  const bannerHeight = Number(banner.height) > 0 ? Number(banner.height) : 320
  const bannerOverlay = Number.isFinite(Number(banner.overlay)) ? Number(banner.overlay) : 55
  const bannerImage = banner.image || ''
  // 自适应模式：无图时不适用，退回固定高度
  const bannerAdapt = (banner.mode || 'cover') === 'adapt' && Boolean(bannerImage)
  // 固定高度模式（铺满 / 拉伸 / 无图兜底）
  const bannerFixed = !bannerAdapt

  const submitSearch = (e) => {
    e.preventDefault()
    const q = keyword.trim()
    navigate(q ? `/wallpapers?q=${encodeURIComponent(q)}` : '/wallpapers')
  }

  return (
    <div>
      {/* 首屏 Banner：满屏宽 + 固定高度，图片铺满整宽并裁切上下；布局由后台「外观管理」控制 */}
      {bannerEnabled ? (
        <section
          className="relative w-full overflow-hidden bg-ink-950"
          style={bannerFixed ? { minHeight: `${bannerHeight}px` } : undefined}
        >
          {bannerImage ? (
            bannerAdapt ? (
              // 自适应：图片按自身比例完整铺开，容器高度由图片决定
              <img src={bannerImage} alt="" className="block h-auto w-full" />
            ) : (
              <img
                src={bannerImage}
                alt=""
                className="absolute inset-0 h-full w-full"
                style={{ objectFit: BANNER_FIT[banner.mode] || 'cover' }}
              />
            )
          ) : (
            <div className="absolute inset-0 bg-[radial-gradient(60%_80%_at_20%_15%,rgba(22,93,255,0.40),transparent_60%),radial-gradient(55%_70%_at_85%_10%,rgba(99,102,241,0.30),transparent_60%)]" />
          )}

          {/* 文字遮罩：保证白字在任何背景图上都可读 */}
          <div
            className="absolute inset-0"
            style={{ backgroundColor: `rgba(2,6,23,${bannerOverlay / 100})` }}
          />

          <div className="absolute inset-0 flex flex-col items-center justify-center px-4 py-8 text-center">
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              {banner.title || site?.title || '壁纸集'}
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-sm text-white/70 sm:text-base">
              {banner.subtitle || site?.description || '发现并下载高质量桌面 / 手机壁纸'}
            </p>

            {banner.showSearch !== false ? (
              <form onSubmit={submitSearch} className="mx-auto mt-7 flex w-full max-w-xl gap-2">
                <div className="relative flex-1">
                  <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/50" />
                  <input
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="搜索壁纸关键词…"
                    className="w-full rounded-full border border-white/15 bg-white/10 py-2.5 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-white/50 focus:border-primary-400/70 focus:bg-white/15"
                  />
                </div>
                <button
                  type="submit"
                  className="shrink-0 rounded-full bg-primary-500 px-6 text-sm font-medium text-white transition hover:bg-primary-600"
                >
                  搜索
                </button>
              </form>
            ) : null}

            {banner.showHotTags !== false && hotTags.length > 0 ? (
              <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                <span className="text-sm text-white/55">热门：</span>
                {hotTags.map((tag) => (
                  <Link
                    key={tag.id}
                    to={`/tag/${tag.slug}`}
                    className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/85 backdrop-blur-sm transition hover:bg-white/20 hover:text-white"
                  >
                    # {tag.name}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* 内容区：1536px 居中容器 */}
      <div className="mx-auto w-full max-w-[1536px] space-y-2 px-4 py-6">
        {/* 分区来自后台「分类管理」中勾选了「主页显示」的分类 */}
        {homeSections.length > 0 ? (
          homeSections.map((category) => {
            const layout = SECTION_LAYOUT[category.displayStyle] || SECTION_LAYOUT.pc
            return (
              <WallpaperSection
                key={category.id}
                title={category.name}
                subtitle={category.description}
                moreTo={`/category/${category.slug}`}
                query={{ category: category.slug }}
                ratio={layout.ratio}
                columns={layout.columns}
                pageSize={layout.pageSize}
              />
            )
          })
        ) : (
          // 还没勾选任何「主页显示」的分类时，退化成最新上传，避免首页空着
          <WallpaperSection
            title="最新上传"
            subtitle="刚刚收录的高清壁纸"
            moreTo="/wallpapers?sort=latest"
            query={{ sort: 'latest' }}
            ratio={SECTION_LAYOUT.pc.ratio}
            columns={SECTION_LAYOUT.pc.columns}
            pageSize={12}
          />
        )}

        {/* 探索发现：标签跑马灯 */}
        {tags?.length > 0 ? (
          <section className="py-8 sm:py-10">
            <div className="mb-4">
              <h2 className="text-lg font-semibold tracking-tight sm:text-xl">探索发现</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">按标签快速找到想要的风格</p>
            </div>
            <div className="wp-marquee-wrap relative overflow-hidden">
              <div className="wp-marquee flex w-max">
                {[0, 1].map((group) => (
                  <div key={group} className="flex shrink-0 gap-3 pr-3">
                    {tags.map((tag) => (
                      <Link
                        key={`${group}-${tag.id}`}
                        to={`/tag/${tag.slug}`}
                        className={`shrink-0 rounded-full border px-5 py-2.5 text-sm transition ${tagTone(tag)}`}
                      >
                        # {tag.name}
                        <span className="ml-1 opacity-70">({tag.count ?? 0})</span>
                      </Link>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}
