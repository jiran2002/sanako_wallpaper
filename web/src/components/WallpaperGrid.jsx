import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ImageOff, Loader2 } from 'lucide-react'
import { api } from '../lib/api'
import { useToast } from './Toast'
import WallpaperCard from './WallpaperCard'
import Lightbox from './Lightbox'
import { WallpaperSkeleton } from './Skeleton'

/**
 * 瀑布流 + 无限滚动
 * @param {object} props
 * @param {object} props.filters 传给列表接口的筛选参数（category/tag/q/orientation/sort）
 * @param {string} props.endpoint 列表接口地址，默认 /api/images
 * @param {boolean} props.auth 列表接口是否需要携带登录态（如 /api/favorites）
 * @param {string} props.uniformRatio 统一卡片比例（如 '4 / 3'）；传入后改为等高网格，不再用瀑布流
 * @param {string} props.uniformColumns 等高网格的列数 class（如手机竖图样式用更密的列）
 * @param {number} props.pageSize 每页数量
 * @param {string} props.emptyText 空状态文案
 * @param {React.ReactNode} props.toolbar 结果条左侧的额外内容（如排序切换）
 * @param {(image: object) => React.ReactNode} props.cardActions 每张卡片右上角的附加操作
 */
export default function WallpaperGrid({
  filters = {},
  endpoint = '/api/images',
  auth = false,
  uniformRatio = null,
  uniformColumns = 'grid-cols-2 gap-4 md:gap-6 sm:grid-cols-3 md:grid-cols-4',
  pageSize = 24,
  emptyText = '暂时还没有壁纸',
  toolbar = null,
  cardActions = null,
}) {
  const toast = useToast()
  const [items, setItems] = useState([])
  const [page, setPage] = useState(0)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [previewIndex, setPreviewIndex] = useState(-1)

  const filtersKey = JSON.stringify(filters)
  const query = useMemo(() => JSON.parse(filtersKey), [filtersKey])

  const genRef = useRef(0)
  const loadingRef = useRef(false)
  const sentinelRef = useRef(null)

  const load = useCallback(
    async (pageNum) => {
      if (loadingRef.current) return
      loadingRef.current = true
      const gen = genRef.current
      setLoading(true)
      try {
        const data = await api.get(endpoint, { query: { page: pageNum, pageSize, ...query }, auth })
        if (gen !== genRef.current) return
        const list = data.items || []
        setItems((prev) => (pageNum === 1 ? list : [...prev, ...list]))
        setPages(data.pages || 1)
        setTotal(data.total || 0)
        setPage(pageNum)
        setError('')
      } catch (err) {
        if (gen !== genRef.current) return
        setError(err.message)
        toast.error(err.message)
      } finally {
        if (gen === genRef.current) {
          setLoading(false)
          loadingRef.current = false
        }
      }
    },
    [endpoint, auth, query, pageSize, toast]
  )

  // 筛选条件变化时重置列表
  useEffect(() => {
    genRef.current += 1
    loadingRef.current = false
    setItems([])
    setPage(0)
    setPages(1)
    setTotal(0)
    setError('')
    load(1)
  }, [load])

  // 触底自动加载下一页
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return undefined
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingRef.current && page > 0 && page < pages) {
          load(page + 1)
        }
      },
      { rootMargin: '600px 0px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [page, pages, load])

  const showSkeleton = loading && items.length === 0
  const showEmpty = !loading && !error && items.length === 0

  return (
    <div>
      {total > 0 || toolbar ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-slate-200 pb-2 text-xs text-slate-400 dark:border-white/5">
          <div className="flex items-center gap-1">{toolbar}</div>
          {total > 0 ? (
            <span>
              共 <span className="font-medium text-slate-600 dark:text-slate-300">{total}</span> 张壁纸
            </span>
          ) : null}
        </div>
      ) : null}

      {showSkeleton ? (
        <WallpaperSkeleton count={pageSize > 15 ? 15 : pageSize} uniform={Boolean(uniformRatio)} />
      ) : null}

      {showEmpty ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 py-20 text-slate-400 dark:border-white/10">
          <ImageOff size={40} />
          <p className="text-sm">{error ? `加载失败：${error}` : emptyText}</p>
          {error ? (
            <button
              type="button"
              onClick={() => load(1)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs transition hover:border-primary-400 hover:text-primary-500 dark:border-white/10"
            >
              点击重试
            </button>
          ) : null}
        </div>
      ) : null}

      {items.length > 0 ? (
        uniformRatio ? (
          <div className={`grid ${uniformColumns}`}>
            {items.map((image, index) => (
              <WallpaperCard
                key={image.id}
                image={image}
                ratio={uniformRatio}
                actions={cardActions ? cardActions(image) : null}
                onPreview={() => setPreviewIndex(index)}
              />
            ))}
          </div>
        ) : (
          <div className="wp-columns columns-2 md:columns-3 lg:columns-4 xl:columns-5">
            {items.map((image, index) => (
              <WallpaperCard
                key={image.id}
                image={image}
                actions={cardActions ? cardActions(image) : null}
                onPreview={() => setPreviewIndex(index)}
              />
            ))}
          </div>
        )
      ) : null}

      {!showEmpty ? (
        <div ref={sentinelRef} className="flex items-center justify-center py-8 text-sm text-slate-400">
          {loading && items.length > 0 ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" />
              正在加载更多…
            </span>
          ) : null}
          {!loading && error && items.length > 0 ? (
            <button
              type="button"
              onClick={() => load(page + 1)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 transition hover:border-primary-400 hover:text-primary-500 dark:border-white/10"
            >
              加载失败，点击重试
            </button>
          ) : null}
          {!loading && !error && items.length > 0 && page >= pages ? (
            <span className="inline-flex items-center gap-2 text-xs">
              <span className="h-px w-8 bg-slate-200 dark:bg-white/10" />
              已经到底啦
              <span className="h-px w-8 bg-slate-200 dark:bg-white/10" />
            </span>
          ) : null}
        </div>
      ) : null}

      <Lightbox
        images={items}
        index={previewIndex}
        onClose={() => setPreviewIndex(-1)}
        onIndexChange={(next) => setPreviewIndex(next)}
      />
    </div>
  )
}
