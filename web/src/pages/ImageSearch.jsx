import { useRef, useState } from 'react'
import { ImageOff, ImagePlus, Loader2 } from 'lucide-react'
import { useToast } from '../components/Toast'
import { xhrUpload } from '../lib/api'
import WallpaperCard from '../components/WallpaperCard'

/**
 * 以图搜图：上传一张图，后端按感知哈希（dHash）返回视觉最相似的已发布壁纸。
 * 结果卡片点击进入详情页；仅展示已发布壁纸，与「全部壁纸」口径一致。
 */
export default function ImageSearch() {
  const toast = useToast()
  const inputRef = useRef(null)
  const dropRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState('')
  const [searched, setSearched] = useState(false)
  const [results, setResults] = useState([])

  const searchFile = async (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('请选择图片文件')
      return
    }
    if (preview) URL.revokeObjectURL(preview)
    setPreview(URL.createObjectURL(file))
    setLoading(true)
    setSearched(false)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const data = await xhrUpload('/api/search/by-image', fd, { auth: true })
      const list = data?.items || []
      setResults(list)
      setSearched(true)
      if (list.length === 0) toast.info('没有找到相似的壁纸')
    } catch (err) {
      setResults([])
      setSearched(true)
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  const onSelect = (e) => searchFile(e.target.files?.[0])
  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    searchFile(e.dataTransfer.files?.[0])
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">以图搜图</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          上传一张图片，找出视觉最相似的壁纸
        </p>
      </div>

      <div
        ref={dropRef}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-12 text-center transition ${
          dragging
            ? 'border-primary-500 bg-primary-50 dark:border-primary-500/60 dark:bg-primary-500/10'
            : 'border-slate-200 hover:border-primary-300 dark:border-white/10 dark:hover:border-primary-500/40'
        }`}
      >
        <input ref={inputRef} type="file" accept="image/*" onChange={onSelect} className="hidden" />
        {loading ? (
          <>
            <Loader2 size={32} className="animate-spin text-primary-500" />
            <p className="text-sm text-slate-500 dark:text-slate-400">正在比对相似壁纸…</p>
          </>
        ) : preview ? (
          <>
            <img
              src={preview}
              alt="已上传的图片"
              className="max-h-48 rounded-xl object-contain ring-1 ring-slate-200 dark:ring-white/10"
            />
            <p className="text-sm text-slate-500 dark:text-slate-400">点击或拖拽可更换图片</p>
          </>
        ) : (
          <>
            <ImagePlus size={32} className="text-slate-300 dark:text-slate-600" />
            <p className="text-sm text-slate-500 dark:text-slate-400">点击选择图片，或将图片拖到此处</p>
          </>
        )}
      </div>

      {searched && !loading && results.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 py-20 text-slate-400 dark:border-white/10">
          <ImageOff size={40} />
          <p className="text-sm">没有找到相似的壁纸，试试换一张更清晰的图片</p>
        </div>
      ) : null}

      {results.length > 0 ? (
        <div>
          <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2 text-xs text-slate-400 dark:border-white/5">
            <span>相似结果</span>
            <span>
              共 <span className="font-medium text-slate-600 dark:text-slate-300">{results.length}</span> 张
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {results.map((image) => (
              <WallpaperCard key={image.id} image={image} ratio="16 / 9" />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}