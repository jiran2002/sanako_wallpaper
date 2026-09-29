import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useSite } from '../App'
import WallpaperGrid from '../components/WallpaperGrid'
import SortTabs from '../components/SortTabs'

export default function TagPage() {
  const { slug } = useParams()
  const { tags } = useSite()
  const [sort, setSort] = useState('latest')

  const tag = useMemo(() => tags.find((item) => item.slug === slug), [tags, slug])
  const siblings = tags.filter((item) => item.slug !== slug)

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
          <span className="text-slate-500 dark:text-slate-300">#{tag?.name || slug}</span>
        </nav>

        <h1 className="mt-3 text-xl font-semibold tracking-tight">#{tag?.name || slug}</h1>

        {siblings.length > 0 ? (
          <div className="wp-scroll-x mt-3 flex items-center gap-2">
            {siblings.map((item) => (
              <Link
                key={item.id}
                to={`/tag/${item.slug}`}
                className="shrink-0 rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 transition hover:border-primary-500/50 hover:text-primary-500 dark:border-white/10 dark:text-slate-400 dark:hover:border-primary-500/50 dark:hover:text-primary-400"
              >
                #{item.name}
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      <WallpaperGrid
        filters={{ tag: slug, sort }}
        uniformRatio="16 / 9"
        toolbar={<SortTabs value={sort} onChange={setSort} />}
        emptyText="该标签下还没有壁纸"
      />
    </div>
  )
}
