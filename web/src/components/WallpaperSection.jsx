import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ImageOff } from 'lucide-react'
import { api } from '../lib/api'
import WallpaperCard from './WallpaperCard'
import Lightbox from './Lightbox'
import { WallpaperSkeleton } from './Skeleton'

/**
 * 首页分区：标题 + 「查看更多」+ 等高网格
 * @param {object} props
 * @param {string} props.title 分区标题
 * @param {string} props.subtitle 标题下的说明文字
 * @param {string} props.moreTo 「查看更多」跳转地址
 * @param {object} props.query 传给列表接口的筛选参数（orientation / sort / category 等）
 * @param {string} props.ratio 卡片统一比例
 * @param {string} props.columns 网格列数 class
 * @param {number} props.pageSize 该分区展示的数量
 */
export default function WallpaperSection({
  title,
  subtitle = '',
  moreTo = '',
  query = {},
  ratio = '16 / 9',
  columns = 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4',
  pageSize = 10,
}) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [previewIndex, setPreviewIndex] = useState(-1)

  const queryKey = JSON.stringify(query)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api
      .get('/api/images', { query: { page: 1, pageSize, ...JSON.parse(queryKey) } })
      .then((data) => {
        if (!cancelled) setItems(data.items || [])
      })
      .catch(() => {
        if (!cancelled) setItems([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [queryKey, pageSize])

  let body = null
  if (loading) {
    body = <WallpaperSkeleton count={pageSize} uniform />
  } else if (items.length === 0) {
    body = (
      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 py-14 text-slate-400 dark:border-white/10">
        <ImageOff size={32} />
        <p className="text-sm">该分区暂时还没有壁纸</p>
      </div>
    )
  } else {
    body = (
      <div className={`grid gap-4 md:gap-6 ${columns}`}>
        {items.map((image, index) => (
          <WallpaperCard key={image.id} image={image} ratio={ratio} onPreview={() => setPreviewIndex(index)} />
        ))}
      </div>
    )
  }

  return (
    <section className="py-8 sm:py-10">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight sm:text-xl">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
        </div>
        {moreTo ? (
          <Link
            to={moreTo}
            className="inline-flex shrink-0 items-center gap-1 text-sm text-slate-500 transition hover:text-primary-500 dark:text-slate-400 dark:hover:text-primary-400"
          >
            查看更多
            <ArrowRight size={15} />
          </Link>
        ) : null}
      </div>

      {body}

      <Lightbox
        images={items}
        index={previewIndex}
        onClose={() => setPreviewIndex(-1)}
        onIndexChange={(next) => setPreviewIndex(next)}
      />
    </section>
  )
}
