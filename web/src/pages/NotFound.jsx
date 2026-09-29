import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-32 text-center">
      <Compass size={44} className="text-slate-300 dark:text-slate-700" />
      <p className="text-5xl font-bold tracking-tight text-slate-700 dark:text-slate-200">404</p>
      <p className="text-sm text-slate-500 dark:text-slate-400">页面走丢了，看看别的壁纸吧</p>
      <div className="flex gap-2">
        <Link
          to="/"
          className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-600"
        >
          返回首页
        </Link>
        <Link
          to="/wallpapers"
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-primary-500/50 hover:text-primary-500 dark:border-white/10 dark:text-slate-300"
        >
          浏览全部壁纸
        </Link>
      </div>
    </div>
  )
}
