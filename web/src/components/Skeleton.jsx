/** 骨架块 */
export default function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200 dark:bg-ink-850 ${className}`} />
}

/** 图片墙骨架屏：默认高度错落模拟瀑布流；uniform 时改为统一比例网格 */
export function WallpaperSkeleton({ count = 12, uniform = false }) {
  if (uniform) {
    return (
      <div className="grid grid-cols-2 gap-4 md:gap-6 sm:grid-cols-3 md:grid-cols-4">
        {Array.from({ length: count }).map((_, index) => (
          <Skeleton key={index} className="aspect-[16/9] w-full rounded-2xl" />
        ))}
      </div>
    )
  }

  const heights = ['h-56', 'h-72', 'h-44', 'h-64', 'h-80', 'h-52']
  return (
    <div className="wp-columns columns-2 md:columns-3 lg:columns-4 xl:columns-5">
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className={`mb-3 w-full break-inside-avoid ${heights[index % heights.length]}`} />
      ))}
    </div>
  )
}

/** 表格 / 列表骨架 */
export function RowSkeleton({ rows = 6 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
    </div>
  )
}
