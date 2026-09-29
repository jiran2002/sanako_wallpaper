import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useSite } from '../App'
import WallpaperGrid from '../components/WallpaperGrid'
import SortTabs from '../components/SortTabs'

/** 手机样式（竖图适配），一排最多 6 个 */
const MOBILE_COLUMNS = 'grid-cols-3 gap-4 md:gap-5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6'
/** 小图模式：缩略图更小，一排最多 8 个 */
const SMALL_COLUMNS = 'grid-cols-4 gap-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8'

export default function CategoryPage() {
  const { slug } = useParams()
  const { categories } = useSite()
  const [sort, setSort] = useState('latest')

  const category = useMemo(() => categories.find((item) => item.slug === slug), [categories, slug])
  // 展示样式：二级分类已在后端跟随其一级分类，这里直接读即可
  const style = category?.displayStyle || 'pc'
  const parent = useMemo(
    () => (category?.parentId ? categories.find((item) => item.id === category.parentId) : null),
    [categories, category]
  )
  // 一级分类展示它的二级分类；二级分类展示同一父级下的其他分类
  const related = useMemo(() => {
    if (!category) return []
    return category.parentId
      ? categories.filter((item) => item.parentId === category.parentId && item.id !== category.id)
      : categories.filter((item) => item.parentId === category.id)
  }, [categories, category])

  return (
    <div className="space-y-5">
      <div>
        <nav className="flex flex-wrap items-center gap-1 text-xs text-slate-400">
          <Link to="/" className="transition hover:text-primary-500">
            首页
          </Link>
          <ChevronRight size={12} />
          <Link to="/wallpapers" className="transition hover:text-primary-500">
            全部壁纸
          </Link>
          <ChevronRight size={12} />
          {parent ? (
            <>
              <Link to={`/category/${parent.slug}`} className="transition hover:text-primary-500">
                {parent.name}
              </Link>
              <ChevronRight size={12} />
            </>
          ) : null}
          <span className="text-slate-500 dark:text-slate-300">{category?.name || slug}</span>
        </nav>

        <h1 className="mt-3 text-xl font-semibold tracking-tight">
          {parent ? `${parent.name} · ` : '分类：'}
          {category?.name || slug}
        </h1>
        {category?.description ? (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{category.description}</p>
        ) : null}

        {related.length > 0 ? (
          <div className="wp-scroll-x mt-3 flex items-center gap-2">
            {related.map((item) => (
              <Link
                key={item.id}
                to={`/category/${item.slug}`}
                className="shrink-0 rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 transition hover:border-primary-500/50 hover:text-primary-500 dark:border-white/10 dark:text-slate-400 dark:hover:border-primary-500/50 dark:hover:text-primary-400"
              >
                {item.name}
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      <WallpaperGrid
        filters={{ category: slug, sort }}
        uniformRatio={style === 'mobile' ? '9 / 16' : style === 'small' ? '1 / 1' : '16 / 9'}
        uniformColumns={
          style === 'mobile' ? MOBILE_COLUMNS : style === 'small' ? SMALL_COLUMNS : undefined
        }
        toolbar={<SortTabs value={sort} onChange={setSort} />}
        emptyText="该分类下还没有壁纸"
      />
    </div>
  )
}
