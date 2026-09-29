const SORTS = [
  { value: 'latest', label: '最新' },
  { value: 'popular', label: '最热' },
  { value: 'downloads', label: '下载最多' },
]

/** 排序切换（首页 / 分类页 / 标签页共用） */
export default function SortTabs({ value, onChange }) {
  return (
    <div className="flex items-center gap-0.5">
      {SORTS.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => onChange(item.value)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
            value === item.value
              ? 'bg-primary-500/15 text-primary-500'
              : 'text-slate-500 hover:bg-slate-200/60 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white'
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
