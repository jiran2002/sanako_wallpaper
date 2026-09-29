import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  Crown,
  Film,
  ImagePlus,
  Layers,
  Link2,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
  XCircle,
} from 'lucide-react'
import { useAuth } from '../../App'
import { api, xhrUpload } from '../../lib/api'
import { userHasPermission } from '../../lib/auth'
import { useToast } from '../../components/Toast'
import CategoryOptions from '../../components/CategoryOptions'
import Modal from '../../components/Modal'
import Spinner from '../../components/Spinner'
import { formatBytes, resolutionText } from '../../lib/format'

let uid = 0
const nextKey = () => `f-${Date.now()}-${uid++}`

/** 是否视频文件（按 MIME 判断，兜底看扩展名） */
const VIDEO_RE = /\.(mp4|m4v|webm|ogv|mov|mkv|avi)$/i
const isVideoFile = (file) => file.type.startsWith('video/') || VIDEO_RE.test(file.name || '')

/**
 * 用 canvas 截取视频第 5 秒的画面当封面（后端拿它生成缩略图与读取尺寸，无需 ffmpeg）。
 * 视频不足 5 秒时取接近末尾的一帧；截不到时返回 null，视频依然可以上传，只是没有缩略图。
 */
function captureVideoPoster(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    let settled = false
    const finish = (blob) => {
      if (settled) return
      settled = true
      URL.revokeObjectURL(url)
      video.removeAttribute('src')
      resolve(blob)
    }
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.src = url
    video.onloadedmetadata = () => {
      // 封面取第 5 秒的画面（短视频退到接近末尾，避免超出时长）
      const duration = Number(video.duration) || 0
      const target = duration > 0.2 ? Math.min(5, duration - 0.1) : 0.1
      try {
        video.currentTime = target
      } catch {
        /* 个别浏览器不允许设置，直接等 seeked */
      }
    }
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth || 1280
        canvas.height = video.videoHeight || 720
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
        canvas.toBlob((blob) => finish(blob), 'image/jpeg', 0.86)
      } catch {
        finish(null)
      }
    }
    video.onerror = () => finish(null)
    setTimeout(() => finish(null), 15000)
  })
}

/** 网盘链接默认行 */
const emptyMirror = () => ({ name: '', url: '', code: '' })

/** 玻璃拟态容器 */
const GLASS =
  'border border-white/70 bg-white/70 backdrop-blur-xl ring-1 ring-slate-900/[0.04] dark:border-white/10 dark:bg-white/[0.04] dark:ring-white/5'
/** 卡片里的无边框输入框（避免表单感） */
const SOFT_INPUT =
  'w-full rounded-xl border-0 bg-slate-900/[0.04] px-2.5 py-1.5 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-primary-400/60 disabled:opacity-60 dark:bg-white/[0.06] dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus:bg-white/10'
const GRADIENT_BTN =
  'bg-gradient-to-r from-primary-500 to-violet-500 text-white shadow-md shadow-primary-500/25 transition hover:brightness-110 disabled:opacity-50 disabled:shadow-none'

/** 头部统计胶囊 */
function StatPill({ label, value, tone = 'slate' }) {
  const tones = {
    slate: 'text-slate-500 dark:text-slate-400',
    primary: 'text-primary-600 dark:text-primary-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    rose: 'text-rose-500',
  }
  return (
    <span
      className={`inline-flex items-baseline gap-1 rounded-full bg-white/70 px-3 py-1 text-xs ring-1 ring-slate-900/[0.04] backdrop-blur dark:bg-white/[0.06] dark:ring-white/5 ${tones[tone]}`}
    >
      {label}
      <b className="text-sm font-semibold tabular-nums">{value}</b>
    </span>
  )
}

/**
 * 单张待发布卡片：缩略图（可拖拽排序）+ 独立标题 / 描述 + 状态
 * 分类与标签是整批共用的，所以只放在顶部设置条里。
 */
function FileCard({
  item,
  index,
  uploading,
  isDragging,
  isDragOver,
  asPack,
  isCover,
  onEdit,
  onRemove,
  onMakeFirst,
  onSetCover,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}) {
  const [descOpen, setDescOpen] = useState(Boolean(item.description))
  const done = item.status === 'success'
  const result = item.result
  // 图包模式下高亮的是「主图」，普通模式高亮第一张
  const coverBadge = asPack ? '主图' : '首图'
  const canSetCover = !done && (asPack ? !isCover : index > 0)

  return (
    <article
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`group relative overflow-hidden rounded-3xl transition ${GLASS} ${
        isDragOver ? 'ring-2 ring-primary-400' : ''
      } ${isDragging ? 'opacity-40' : ''}`}
    >
      {/* 缩略图区域：按住这里可以拖动排序 */}
      <div
        draggable={!uploading && !done}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        className={`relative aspect-[3/4] overflow-hidden bg-slate-100 dark:bg-white/5 ${
          uploading || done ? '' : 'cursor-grab active:cursor-grabbing'
        }`}
        title={uploading || done ? undefined : '按住拖动可以调整顺序'}
      >
        {item.posterPreview ? (
          <img
            src={item.posterPreview}
            alt={item.file.name}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
          />
        ) : item.isVideo ? (
          <video
            src={item.preview}
            muted
            playsInline
            preload="metadata"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <img
            src={item.preview}
            alt={item.file.name}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
          />
        )}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black/45 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/45 to-transparent" />

        <span className="absolute left-2.5 top-2.5 rounded-full bg-black/45 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
          {index + 1}
        </span>
        {item.isVideo ? (
          <span className="absolute left-2.5 top-8 inline-flex items-center gap-1 rounded-full bg-black/45 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
            <Film size={11} />
            视频
          </span>
        ) : null}
        {isCover ? (
          <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-white/85 px-2 py-0.5 text-[11px] font-medium text-primary-600 backdrop-blur-sm">
            <Crown size={11} />
            {coverBadge}
          </span>
        ) : null}

        {/* 状态 */}
        {item.status === 'uploading' ? (
          <span className="absolute bottom-2.5 right-2.5 rounded-full bg-black/45 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm tabular-nums">
            {item.progress}%
          </span>
        ) : null}
        {done ? (
          <span className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
            <CheckCircle2 size={11} />
            {result?.status === 2 ? '待审核' : '已发布'}
          </span>
        ) : null}
        {item.status === 'error' ? (
          <span className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-rose-500/90 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
            <XCircle size={11} />
            失败
          </span>
        ) : null}
        {item.status === 'duplicate' ? (
          <span className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-amber-500/90 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
            <AlertTriangle size={11} />
            疑似重复
          </span>
        ) : null}

        {item.status === 'uploading' ? (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/15">
            <div
              className="h-full bg-gradient-to-r from-primary-400 to-violet-400 transition-all"
              style={{ width: `${item.progress}%` }}
            />
          </div>
        ) : null}
      </div>

      {/* 悬浮操作 */}
      <div className="absolute right-2.5 top-2.5 z-10 flex gap-1.5 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
        {canSetCover ? (
          <button
            type="button"
            onClick={asPack ? onSetCover : onMakeFirst}
            title={asPack ? '设为主图' : '设为首图'}
            className="rounded-full bg-black/45 p-1.5 text-white backdrop-blur-sm transition hover:bg-black/70"
          >
            <Crown size={14} />
          </button>
        ) : null}
        <button
          type="button"
          onClick={onRemove}
          disabled={uploading}
          title="移除"
          className="rounded-full bg-black/45 p-1.5 text-white backdrop-blur-sm transition hover:bg-rose-500/90 disabled:opacity-40"
        >
          <X size={14} />
        </button>
      </div>

      {/* 独立标题 / 描述 */}
      <div className="space-y-2 p-3">
        <input
          value={item.title}
          onChange={(e) => onEdit(item.key, { title: e.target.value })}
          disabled={done}
          placeholder="标题（留空则用文件名）"
          className={SOFT_INPUT}
        />

        {descOpen ? (
          <textarea
            value={item.description}
            onChange={(e) => onEdit(item.key, { description: e.target.value })}
            disabled={done}
            rows={2}
            placeholder="描述（会显示在详情页）"
            className={`${SOFT_INPUT} resize-none`}
          />
        ) : (
          <button
            type="button"
            onClick={() => setDescOpen(true)}
            className="text-[11px] text-slate-400 transition hover:text-primary-500"
          >
            + 添加描述
          </button>
        )}

        <p className="truncate text-[11px] text-slate-400" title={item.file.name}>
          {item.file.name} · {formatBytes(item.file.size)}
        </p>

        {done && result ? (
          <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-400">
            <span>
              {resolutionText(result.width, result.height)} · {(result.format || '').toUpperCase()}
            </span>
            <Link to={`/image/${result.id}`} className="text-primary-500 transition hover:underline">
              查看
            </Link>
          </p>
        ) : null}

        {item.error ? <p className="text-[11px] text-rose-500">{item.error}</p> : null}
      </div>
    </article>
  )
}

/**
 * 发布壁纸面板：前台「上传壁纸」与后台「上传壁纸」共用
 * 交互：拖拽 / 点击 / Ctrl+V 粘贴加入队列 → 卡片流里逐张改标题描述、拖动排序 → 一键发布
 */
export default function Upload() {
  const toast = useToast()
  const { user } = useAuth()
  // 只有具备「管理分类标签」权限的用户才能在上传时新建标签
  const isAdmin = userHasPermission(user, 'manageTaxonomy')
  const inputRef = useRef(null)
  const [files, setFiles] = useState([])
  const [categories, setCategories] = useState([])
  const [tags, setTags] = useState([])
  const [categoryId, setCategoryId] = useState('')
  const [tagIds, setTagIds] = useState([])
  const [newTagName, setNewTagName] = useState('')
  const [creatingTag, setCreatingTag] = useState(false)
  const [dragDepth, setDragDepth] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [run, setRun] = useState({ total: 0, done: 0 })
  const [dragIndex, setDragIndex] = useState(-1)
  const [overIndex, setOverIndex] = useState(-1)
  // 图包：勾选后本次上传的图片会归为同一组，可指定主图、详情页左右切换、一键打包 zip 下载
  const [asPack, setAsPack] = useState(false)
  const [coverKey, setCoverKey] = useState('')
  // 网盘下载：除站内直链外，作者可自行补充其它网盘地址
  const [mirrors, setMirrors] = useState([])
  // 上传查重：命中疑似重复时弹窗，让用户选择跳过或强制上传
  const [dupePrompt, setDupePrompt] = useState(null)

  // 加载分类 / 标签（前台公开接口，登录用户均可用）
  useEffect(() => {
    let cancelled = false
    Promise.all([api.get('/api/categories'), api.get('/api/tags')])
      .then(([categoryData, tagData]) => {
        if (cancelled) return
        setCategories(Array.isArray(categoryData) ? categoryData : [])
        setTags(Array.isArray(tagData) ? tagData : [])
      })
      .catch((err) => {
        if (!cancelled) toast.error(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [toast])

  // 组件卸载时释放预览地址
  const filesRef = useRef(files)
  filesRef.current = files
  useEffect(
    () => () => {
      filesRef.current.forEach((item) => {
        URL.revokeObjectURL(item.preview)
        if (item.posterPreview) URL.revokeObjectURL(item.posterPreview)
      })
    },
    []
  )

  const addFiles = useCallback(
    (fileList) => {
      const incoming = Array.from(fileList).filter(
        (file) => file.type.startsWith('image/') || file.type.startsWith('video/') || isVideoFile(file),
      )
      if (incoming.length === 0) {
        toast.error('请选择图片或视频文件')
        return
      }
      const added = incoming.map((file) => ({
        key: nextKey(),
        file,
        isVideo: isVideoFile(file),
        preview: URL.createObjectURL(file),
        poster: null,
        posterPreview: '',
        progress: 0,
        status: 'pending',
        result: null,
        error: '',
        title: '',
        description: '',
      }))
      setFiles((prev) => [...prev, ...added])
      // 默认把第一张设为主图
      setCoverKey((prev) => prev || added[0]?.key || '')

      // 视频：后台截首帧当封面（同时用于卡片缩略图）
      added
        .filter((item) => item.isVideo)
        .forEach(async (item) => {
          const blob = await captureVideoPoster(item.file)
          if (!blob) return
          setFiles((prev) =>
            prev.map((f) =>
              f.key === item.key
                ? { ...f, poster: blob, posterPreview: URL.createObjectURL(blob) }
                : f,
            ),
          )
        })
    },
    [toast]
  )

  // 整页都可以作为放置区：拖到窗口任意位置都能添加
  useEffect(() => {
    const hasFile = (e) => Array.from(e.dataTransfer?.types || []).includes('Files')
    const onDragEnter = (e) => {
      if (!hasFile(e)) return
      e.preventDefault()
      setDragDepth((depth) => depth + 1)
    }
    const onDragOver = (e) => {
      if (!hasFile(e)) return
      e.preventDefault()
    }
    const onDragLeave = (e) => {
      if (!hasFile(e)) return
      // relatedTarget 为空说明是离开了整个窗口，直接收起提示层
      if (!e.relatedTarget) {
        setDragDepth(0)
        return
      }
      setDragDepth((depth) => Math.max(0, depth - 1))
    }
    const onDrop = (e) => {
      if (!hasFile(e)) return
      e.preventDefault()
      setDragDepth(0)
      addFiles(e.dataTransfer.files)
    }
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [addFiles])

  // 截图后 Ctrl+V 直接进队列
  useEffect(() => {
    const onPaste = (e) => {
      const picked = Array.from(e.clipboardData?.items || [])
        .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter(Boolean)
      if (picked.length === 0) return
      e.preventDefault()
      addFiles(picked)
      toast.success(`已从剪贴板加入 ${picked.length} 张图片`)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [addFiles, toast])

  const editFile = (key, patch) =>
    setFiles((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)))

  const revokeItem = (item) => {
    URL.revokeObjectURL(item.preview)
    if (item.posterPreview) URL.revokeObjectURL(item.posterPreview)
  }

  const removeFile = (key) => {
    const target = filesRef.current.find((item) => item.key === key)
    if (target) revokeItem(target)
    const next = filesRef.current.filter((item) => item.key !== key)
    setFiles(next)
    if (!next.some((item) => item.key === coverKey)) setCoverKey(next[0]?.key || '')
  }

  const clearAll = () => {
    filesRef.current.forEach(revokeItem)
    setFiles([])
    setCoverKey('')
  }

  const clearSuccess = () => {
    const keep = filesRef.current.filter((item) => item.status !== 'success')
    filesRef.current.filter((item) => item.status === 'success').forEach(revokeItem)
    setFiles(keep)
    if (!keep.some((item) => item.key === coverKey)) setCoverKey(keep[0]?.key || '')
    toast.info('已移除上传成功的图片')
  }

  /** 拖拽排序：把 from 位置的卡片移动到 to 位置 */
  const moveFile = (from, to) => {
    setFiles((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  const makeFirst = (key) =>
    setFiles((prev) => {
      const index = prev.findIndex((item) => item.key === key)
      if (index <= 0) return prev
      const next = [...prev]
      const [moved] = next.splice(index, 1)
      next.unshift(moved)
      return next
    })

  const toggleTag = (id) => {
    setTagIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  const createTag = async () => {
    const name = newTagName.trim()
    if (!name) return
    setCreatingTag(true)
    try {
      const created = await api.post('/api/admin/tags', { name }, { auth: true })
      setTags((prev) => [...prev, created])
      setTagIds((prev) => [...prev, created.id])
      setNewTagName('')
      toast.success(`标签「${name}」已创建`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setCreatingTag(false)
    }
  }

  const updateMirror = (index, patch) =>
    setMirrors((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  const addMirror = () => setMirrors((prev) => [...prev, emptyMirror()])
  const removeMirror = (index) => setMirrors((prev) => prev.filter((_, i) => i !== index))

  // 只把填了链接的行提交给后端，名称留空自动记为「网盘」
  const validMirrors = useMemo(
    () =>
      mirrors
        .map((m) => ({ name: m.name.trim() || '网盘', url: m.url.trim(), code: m.code.trim() }))
        .filter((m) => m.url),
    [mirrors]
  )

  const pendingCount = files.filter((item) => item.status !== 'success').length
  const successCount = files.filter((item) => item.status === 'success').length
  const errorCount = files.filter((item) => item.status === 'error').length

  const openDupePrompt = (list) => {
    setDupePrompt(list)
    toast.info(`检测到 ${list.length} 张疑似重复的壁纸`)
  }

  /**
   * 上传：force=true 时忽略「疑似重复」校验（用户在弹窗里确认继续）；
   * keys 有值时只重传指定的几张（用于「仍然上传」）。
   */
  const startUpload = async ({ force = false, keys = null } = {}) => {
    if (uploading) return
    const pending = files.filter(
      (item) => item.status !== 'success' && (!keys || keys.includes(item.key))
    )
    if (pending.length === 0) {
      toast.error('先选几张图片吧')
      return
    }
    if (!categoryId) {
      toast.error('请先选择分类')
      return
    }

    setUploading(true)
    setRun({ total: pending.length, done: 0 })
    let succeeded = 0
    let failed = 0
    let needsAudit = false
    const dupes = []

    /** 命中重复：标记成「疑似重复」并收集起来，稍后弹窗让用户决定是否继续 */
    const markDuplicate = (item, similar) => {
      dupes.push({ key: item.key, name: item.file.name, similar })
      setFiles((prev) =>
        prev.map((f) =>
          f.key === item.key ? { ...f, status: 'duplicate', progress: 0, error: '', similar } : f
        )
      )
    }

    const mirrorJson = validMirrors.length ? JSON.stringify(validMirrors) : ''
    const posterName = (item) => `${item.file.name.replace(/\.[^.]+$/, '')}-poster.jpg`

    /* ------------------------- 图包：一次请求提交多张 ------------------------- */
    if (asPack && pending.length > 1) {
      const keys = pending.map((item) => item.key)
      setFiles((prev) =>
        prev.map((f) => (keys.includes(f.key) ? { ...f, status: 'uploading', progress: 0, error: '' } : f))
      )

      const formData = new FormData()
      formData.append('pack', '1')
      formData.append('categoryId', categoryId)
      if (force) formData.append('force', '1')
      tagIds.forEach((id) => formData.append('tagIds', String(id)))
      if (mirrorJson) formData.append('mirrors', mirrorJson)

      let coverIndex = 0
      pending.forEach((item, i) => {
        formData.append(`file_${i}`, item.file)
        if (item.poster) formData.append(`poster_${i}`, item.poster, posterName(item))
        // 字段按张数依次追加，后端按下标与文件一一对应
        formData.append('title', item.title.trim())
        formData.append('description', item.description.trim())
        if (item.key === coverKey) coverIndex = i
      })
      formData.append('coverIndex', String(coverIndex))

      try {
        const res = await xhrUpload('/api/upload', formData, {
          auth: true,
          onProgress: (percent) =>
            setFiles((prev) => prev.map((f) => (keys.includes(f.key) ? { ...f, progress: percent } : f))),
        })
        if (res?.pending) needsAudit = true

        const items = res?.items || []
        const byName = new Map(items.map((it) => [it.filename, it]))
        const failByName = new Map((res?.failed || []).map((f) => [f.name, f.error]))
        const dupByName = new Map((res?.duplicates || []).map((d) => [d.name, d.similar]))
        pending.forEach((item, i) => {
          const created = byName.get(item.file.name) || (items.length === pending.length ? items[i] : null)
          if (created) {
            succeeded += 1
            setFiles((prev) =>
              prev.map((f) =>
                f.key === item.key ? { ...f, status: 'success', progress: 100, result: created } : f
              )
            )
            return
          }
          if (dupByName.has(item.file.name)) {
            markDuplicate(item, dupByName.get(item.file.name))
            return
          }
          failed += 1
          const reason = failByName.get(item.file.name) || res?.failed?.[0]?.error || '上传失败'
          setFiles((prev) =>
            prev.map((f) => (f.key === item.key ? { ...f, status: 'error', error: reason } : f))
          )
        })
      } catch (err) {
        failed = pending.length
        setFiles((prev) =>
          prev.map((f) => (keys.includes(f.key) ? { ...f, status: 'error', error: err.message } : f))
        )
      }

      setRun({ total: pending.length, done: pending.length })
      setUploading(false)
      if (dupes.length > 0) openDupePrompt(dupes)
      if (succeeded > 0) {
        toast.success(needsAudit ? `已提交 ${succeeded} 张壁纸，等待管理员审核` : `成功发布图包（${succeeded} 张）`)
      }
      if (failed > 0) toast.error(`${failed} 张上传失败，可再发一次重试`)
      return
    }

    /* --------------------- 普通模式：每张一个请求，逐张显示进度 --------------------- */
    let done = 0
    for (const item of pending) {
      setFiles((prev) =>
        prev.map((f) => (f.key === item.key ? { ...f, status: 'uploading', progress: 0, error: '' } : f))
      )

      const formData = new FormData()
      formData.append('files', item.file)
      formData.append('categoryId', categoryId)
      if (force) formData.append('force', '1')
      tagIds.forEach((id) => formData.append('tagIds', String(id)))
      if (item.poster) formData.append('poster_0', item.poster, posterName(item))
      if (mirrorJson) formData.append('mirrors', mirrorJson)
      if (item.title.trim()) formData.append('title', item.title.trim())
      if (item.description.trim()) formData.append('description', item.description.trim())

      try {
        const res = await xhrUpload('/api/upload', formData, {
          auth: true,
          onProgress: (percent) =>
            setFiles((prev) => prev.map((f) => (f.key === item.key ? { ...f, progress: percent } : f))),
        })
        const created = res?.items?.[0]
        const failReason = res?.failed?.[0]?.error
        const dupSimilar = res?.duplicates?.[0]?.similar
        if (res?.pending) needsAudit = true
        if (created) {
          succeeded += 1
          setFiles((prev) =>
            prev.map((f) => (f.key === item.key ? { ...f, status: 'success', progress: 100, result: created } : f))
          )
        } else if (dupSimilar) {
          markDuplicate(item, dupSimilar)
        } else {
          failed += 1
          setFiles((prev) =>
            prev.map((f) => (f.key === item.key ? { ...f, status: 'error', error: failReason || '上传失败' } : f))
          )
        }
      } catch (err) {
        failed += 1
        setFiles((prev) =>
          prev.map((f) => (f.key === item.key ? { ...f, status: 'error', error: err.message } : f))
        )
      }

      done += 1
      setRun({ total: pending.length, done })
    }

    setUploading(false)
    if (dupes.length > 0) openDupePrompt(dupes)
    if (succeeded > 0) {
      toast.success(needsAudit ? `已提交 ${succeeded} 张壁纸，等待管理员审核` : `成功发布 ${succeeded} 张壁纸`)
    }
    if (failed > 0) toast.error(`${failed} 张上传失败，可再发一次重试`)
  }

  const runPercent = useMemo(() => {
    if (!uploading) return 0
    const active = files.find((item) => item.status === 'uploading')
    if (!run.total) return 0
    return Math.min(100, Math.round(((run.done + (active?.progress || 0) / 100) / run.total) * 100))
  }, [uploading, files, run])

  return (
    <div className="relative space-y-5">
      {/* 顶部：标题 + 统计 */}
      <header className="relative flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            发布壁纸
            <Sparkles size={18} className="text-primary-500" />
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            拖进来、粘进来（Ctrl + V）都行，边传边改标题，满意了再一键发布
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatPill label="已选" value={files.length} tone="primary" />
          {successCount > 0 ? <StatPill label="已完成" value={successCount} tone="emerald" /> : null}
          {errorCount > 0 ? <StatPill label="失败" value={errorCount} tone="rose" /> : null}
        </div>
      </header>

      {/* 整批共用的分类 / 标签 */}
      <section className={`relative flex flex-wrap items-start gap-x-5 gap-y-4 rounded-3xl p-4 ${GLASS}`}>
        <label className="w-44 space-y-1.5">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            分类 <span className="text-rose-500">*</span>
          </span>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className={`h-8 w-full rounded-xl border-0 bg-slate-900/[0.04] pl-2.5 pr-7 text-xs text-slate-700 outline-none transition focus:ring-2 focus:ring-primary-400/60 dark:bg-white/[0.06] dark:text-slate-200 ${
              !categoryId && files.length > 0 ? 'ring-1 ring-rose-300 dark:ring-rose-500/50' : ''
            }`}
          >
            <option value="" disabled>
              请选择分类
            </option>
            <CategoryOptions categories={categories} valueKey="id" />
          </select>
        </label>

        <div className="min-w-[14rem] flex-1 space-y-1.5">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            标签（已选 {tagIds.length} 个）
          </span>
          <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
            {tags.length === 0 ? (
              <span className="inline-flex h-8 items-center px-1 text-xs text-slate-400">
                {isAdmin ? '暂无标签，可在右侧新建' : '暂无标签'}
              </span>
            ) : (
              tags.map((tag) => {
                const active = tagIds.includes(tag.id)
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    className={`inline-flex h-8 items-center rounded-full px-3 text-xs transition ${
                      active
                        ? 'bg-primary-500 text-white shadow-sm shadow-primary-500/30'
                        : 'bg-slate-900/[0.04] text-slate-500 hover:bg-slate-900/[0.08] dark:bg-white/[0.06] dark:text-slate-300 dark:hover:bg-white/10'
                    }`}
                  >
                    #{tag.name}
                  </button>
                )
              })
            )}
          </div>
        </div>

        {isAdmin ? (
          <div className="flex items-end gap-2">
            <label className="space-y-1.5">
              <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">新建标签</span>
              <input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    createTag()
                  }
                }}
                placeholder="输入标签名"
                className="h-8 w-32 rounded-xl border-0 bg-slate-900/[0.04] px-2.5 text-xs outline-none transition focus:ring-2 focus:ring-primary-400/60 dark:bg-white/[0.06] dark:text-slate-200"
              />
            </label>
            <button
              type="button"
              onClick={createTag}
              disabled={creatingTag || !newTagName.trim()}
              className="inline-flex h-8 items-center gap-1 rounded-xl bg-slate-900/[0.06] px-3 text-xs text-slate-600 transition hover:bg-slate-900/10 disabled:opacity-50 dark:bg-white/[0.08] dark:text-slate-200 dark:hover:bg-white/15"
            >
              {creatingTag ? <Spinner size={14} /> : <Plus size={14} />}
              新建
            </button>
          </div>
        ) : null}

        <p className="w-full text-[11px] text-slate-400">
          <strong className="font-medium text-rose-500">分类为必填</strong>
          ，分类与标签会应用到本次发布的全部图片；标题与描述可以每张单独改
        </p>
      </section>

      {/* 图包 / 网盘下载（可选） */}
      <section className={`relative space-y-3 rounded-3xl p-4 ${GLASS}`}>
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={asPack}
            onChange={(e) => setAsPack(e.target.checked)}
            disabled={uploading}
            className="mt-0.5 h-4 w-4 accent-primary-500"
          />
          <span>
            <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
              <Layers size={15} className="text-primary-500" />
              作为图包发布
            </span>
            <span className="mt-0.5 block text-[11px] text-slate-400">
              多张图归为同一组：详情页可左右切换，点击下载得到打包好的 zip；勾选后在卡片上点皇冠可指定主图
            </span>
          </span>
        </label>

        <div className="space-y-2 border-t border-slate-900/[0.06] pt-3 dark:border-white/10">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
              <Link2 size={13} />
              网盘下载（可选{validMirrors.length > 0 ? ` · 已填 ${validMirrors.length} 条` : ''}）
            </span>
            <button
              type="button"
              onClick={addMirror}
              disabled={uploading}
              className="inline-flex h-7 items-center gap-1 rounded-lg bg-slate-900/[0.06] px-2.5 text-xs text-slate-600 transition hover:bg-slate-900/10 disabled:opacity-50 dark:bg-white/[0.08] dark:text-slate-200 dark:hover:bg-white/15"
            >
              <Plus size={13} />
              添加网盘
            </button>
          </div>

          {mirrors.length === 0 ? (
            <p className="text-[11px] text-slate-400">
              除站内直接下载外，可补充百度网盘 / 夸克网盘等链接，前台详情页会以二级菜单展示
            </p>
          ) : (
            mirrors.map((m, index) => (
              <div key={index} className="flex flex-wrap items-center gap-2">
                <input
                  value={m.name}
                  onChange={(e) => updateMirror(index, { name: e.target.value })}
                  disabled={uploading}
                  placeholder="名称（如 百度网盘）"
                  className="h-8 w-32 rounded-xl border-0 bg-slate-900/[0.04] px-2.5 text-xs outline-none transition focus:ring-2 focus:ring-primary-400/60 dark:bg-white/[0.06] dark:text-slate-200"
                />
                <input
                  value={m.url}
                  onChange={(e) => updateMirror(index, { url: e.target.value })}
                  disabled={uploading}
                  placeholder="https:// 网盘分享链接"
                  className="h-8 min-w-[12rem] flex-1 rounded-xl border-0 bg-slate-900/[0.04] px-2.5 text-xs outline-none transition focus:ring-2 focus:ring-primary-400/60 dark:bg-white/[0.06] dark:text-slate-200"
                />
                <input
                  value={m.code}
                  onChange={(e) => updateMirror(index, { code: e.target.value })}
                  disabled={uploading}
                  placeholder="提取码"
                  className="h-8 w-24 rounded-xl border-0 bg-slate-900/[0.04] px-2.5 text-xs outline-none transition focus:ring-2 focus:ring-primary-400/60 dark:bg-white/[0.06] dark:text-slate-200"
                />
                <button
                  type="button"
                  onClick={() => removeMirror(index)}
                  disabled={uploading}
                  title="删除该条"
                  className="grid h-8 w-8 place-items-center rounded-xl text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 disabled:opacity-40 dark:hover:bg-rose-950/40"
                >
                  <X size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      {/* 空状态：大号放置区 */}
      {files.length === 0 ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          className={`relative cursor-pointer overflow-hidden rounded-[2rem] border-2 border-dashed p-10 text-center transition ${
            dragDepth > 0
              ? 'border-primary-400 bg-primary-50/70 dark:bg-primary-500/10'
              : 'border-slate-200 bg-white/60 hover:border-primary-300 dark:border-white/10 dark:bg-white/[0.03]'
          }`}
        >
          <div className="pointer-events-none absolute -left-10 -top-16 h-48 w-48 rounded-full bg-primary-400/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -right-6 h-48 w-48 rounded-full bg-violet-400/25 blur-3xl" />
          <div className="relative flex flex-col items-center gap-3">
            <span className="grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-primary-500 to-violet-500 text-white shadow-lg shadow-primary-500/30">
              <UploadCloud size={26} />
            </span>
            <div>
              <p className="text-base font-semibold">把图片 / 视频拖进来，或按 Ctrl + V 粘贴</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                支持 JPG / PNG / WebP / GIF 与 MP4 / WebM / MOV 等视频，一次可以选很多张
              </p>
            </div>
            <span className={`rounded-full px-5 py-2 text-sm font-medium ${GRADIENT_BTN}`}>选择文件</span>
          </div>
        </div>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files)
          e.target.value = ''
        }}
      />

      {/* 卡片流 */}
      {files.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          {files.map((item, index) => (
            <FileCard
              key={item.key}
              item={item}
              index={index}
              uploading={uploading}
              isDragging={dragIndex === index}
              isDragOver={overIndex === index && dragIndex !== -1 && dragIndex !== index}
              asPack={asPack}
              isCover={asPack ? item.key === coverKey : index === 0}
              onEdit={editFile}
              onRemove={() => removeFile(item.key)}
              onMakeFirst={() => makeFirst(item.key)}
              onSetCover={() => setCoverKey(item.key)}
              onDragStart={() => {
                setDragIndex(index)
                setOverIndex(index)
              }}
              onDragOver={(e) => {
                if (dragIndex === -1) return
                e.preventDefault()
                e.stopPropagation()
                setOverIndex(index)
              }}
              onDrop={(e) => {
                if (dragIndex === -1) return
                e.preventDefault()
                e.stopPropagation()
                moveFile(dragIndex, index)
                setDragIndex(-1)
                setOverIndex(-1)
              }}
              onDragEnd={() => {
                setDragIndex(-1)
                setOverIndex(-1)
              }}
            />
          ))}

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex min-h-[15rem] flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-slate-200 text-slate-400 transition hover:border-primary-300 hover:text-primary-500 dark:border-white/10"
          >
            <ImagePlus size={22} />
            <span className="text-sm font-medium">继续添加</span>
            <span className="text-[11px]">也可以直接 Ctrl + V 粘贴</span>
          </button>
        </div>
      ) : null}

      {/* 悬浮发布条 */}
      {files.length > 0 ? (
        <div className="sticky bottom-4 z-30 flex justify-end">
          <div className={`flex items-center gap-3 rounded-full px-3 py-2 shadow-lg shadow-slate-900/5 ${GLASS}`}>
            <span className="pl-1 text-xs text-slate-500 dark:text-slate-400">
              {uploading ? `正在发布 ${run.done}/${run.total} · ${runPercent}%` : `共 ${files.length} 张 · 待发布 ${pendingCount}`}
            </span>
            {asPack && pendingCount > 1 && !uploading ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-1 text-xs text-primary-600 dark:bg-primary-500/10 dark:text-primary-300">
                <Layers size={12} />
                图包
              </span>
            ) : null}
            {!uploading && !categoryId ? (
              <span className="rounded-full bg-rose-50 px-2 py-1 text-xs text-rose-500 dark:bg-rose-950/40 dark:text-rose-400">
                请先选择分类
              </span>
            ) : null}
            {successCount > 0 && !uploading ? (
              <button
                type="button"
                onClick={clearSuccess}
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-slate-500 transition hover:bg-slate-900/[0.05] hover:text-slate-700 dark:text-slate-400 dark:hover:bg-white/10"
              >
                <RotateCcw size={13} />
                清空已完成
              </button>
            ) : null}
            {files.length > 1 && !uploading ? (
              <button
                type="button"
                onClick={clearAll}
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/40"
              >
                <Trash2 size={13} />
                全部清空
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => startUpload()}
              disabled={uploading || pendingCount === 0}
              className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium ${GRADIENT_BTN}`}
            >
              {uploading ? <Spinner size={15} /> : <Sparkles size={15} />}
              {uploading
                ? '发布中…'
                : errorCount > 0
                  ? `重新发布（${pendingCount}）`
                  : `一键发布（${pendingCount}）`}
            </button>
          </div>
        </div>
      ) : null}

      {/* 疑似重复：列出命中项与已有相似图，用户可跳过后重传或强制上传 */}
      <Modal
        open={Boolean(dupePrompt?.length)}
        onClose={() => setDupePrompt(null)}
        title="检测到疑似重复的壁纸"
        maxWidth="max-w-2xl"
        footer={
          <>
            <button type="button" onClick={() => setDupePrompt(null)} className="admin-btn">
              跳过这些
            </button>
            <button
              type="button"
              onClick={() => {
                const keys = dupePrompt.map((item) => item.key)
                setDupePrompt(null)
                startUpload({ force: true, keys })
              }}
              className="admin-btn-primary"
            >
              <AlertTriangle size={15} />
              仍然上传
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            以下 {dupePrompt?.length || 0} 张与前台上已有的壁纸高度相似，已暂不上传。
          </p>
          {(dupePrompt || []).map((dupe) => (
            <div
              key={dupe.key}
              className="rounded-2xl border border-slate-200 p-3 dark:border-white/10"
            >
              <p className="truncate text-sm font-medium">{dupe.name}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(dupe.similar || []).map((item) => (
                  <Link
                    key={item.id}
                    to={`/image/${item.id}`}
                    target="_blank"
                    className="flex items-center gap-2 rounded-xl border border-slate-200 p-1.5 pr-3 text-xs text-slate-500 transition hover:border-primary-300 hover:text-primary-500 dark:border-white/10 dark:text-slate-400"
                  >
                    <img
                      src={item.url}
                      alt={item.title}
                      className="h-10 w-10 rounded-lg object-cover"
                    />
                    <span className="max-w-[12rem] truncate">{item.title || `#${item.id}`}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Modal>

      {/* 拖到页面任意位置时的提示层 */}
      {dragDepth > 0 ? (
        <div className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-[2rem] border-2 border-dashed border-white/50 px-12 py-10 text-white">
            <UploadCloud size={34} />
            <p className="text-base font-medium">松手即可加入队列</p>
            <p className="text-xs text-white/70">
              当前 {files.length} 张，可一次拖入多张
            </p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
