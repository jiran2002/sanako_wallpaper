import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { CornerDownRight, LogIn, MessageSquare, Send, Smile, X } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth, useSite } from '../App'
import { useToast } from './Toast'
import Avatar from './Avatar'
import Spinner from './Spinner'
import { formatDate } from '../lib/format'

const MAX_LEN = 500

/** 评论总数（含回复） */
function countComments(list) {
  return list.reduce((sum, item) => sum + 1 + (item.replies?.length || 0), 0)
}

/** 单条评论：replyTo 存在时展示「回复 @某人」 */
function CommentItem({ comment, nested = false, onReply }) {
  return (
    <div className="flex gap-3">
      <Avatar user={comment.author || { nickname: '已注销' }} size={nested ? 30 : 36} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium text-slate-700 dark:text-slate-200">
            {comment.author?.nickname || '已注销'}
          </span>
          <span className="text-slate-400">{formatDate(comment.createdAt)}</span>
        </div>

        {/* 表情包与文字可同时存在，表情包原样展示 */}
        {comment.sticker ? (
          <img
            src={comment.sticker.url}
            alt="表情包"
            loading="lazy"
            className="mt-1.5 h-auto w-auto max-h-32 max-w-[10rem] rounded-lg border border-slate-200 object-contain dark:border-white/10"
          />
        ) : null}

        {comment.content ? (
          <p className="mt-1 whitespace-pre-line break-words text-sm leading-6 text-slate-600 dark:text-slate-300">
            {nested && comment.replyTo ? (
              <span className="mr-1 text-primary-500">回复 @{comment.replyTo.nickname}</span>
            ) : null}
            {comment.content}
          </p>
        ) : null}

        <div className="mt-1">
          <button
            type="button"
            onClick={() => onReply(comment)}
            className="inline-flex items-center gap-1 text-xs text-slate-400 transition hover:text-primary-500"
          >
            <CornerDownRight size={12} />
            回复
          </button>
        </div>

        {comment.replies?.length ? (
          <div className="mt-3 space-y-3 border-l-2 border-slate-100 pl-3 dark:border-white/5">
            {comment.replies.map((reply) => (
              <CommentItem key={reply.id} comment={reply} nested onReply={onReply} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/**
 * 壁纸详情页评论区。
 * 发表评论需登录；「全局评论区」关闭时仅管理员可用（其余角色整个区块不展示）。
 */
export default function CommentSection({ imageId }) {
  const { site } = useSite()
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()

  const isAdmin = user?.role === 'admin'
  const enabled = site?.comment?.enabled ?? true
  const stickerEnabled = Boolean(site?.comment?.stickerEnabled)
  const usable = enabled || isAdmin

  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState('')
  const [sticker, setSticker] = useState(null)
  const [replyTo, setReplyTo] = useState(null)
  const [sending, setSending] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [stickerPacks, setStickerPacks] = useState([])
  const [packIndex, setPackIndex] = useState(0)
  const [stickersLoading, setStickersLoading] = useState(false)
  const boxRef = useRef(null)
  const pickerRef = useRef(null)

  const load = useCallback(async () => {
    if (!usable) return
    setLoading(true)
    try {
      const data = await api.get(`/api/images/${imageId}/comments`)
      const list = data?.items || []
      setItems(list)
      setTotal(countComments(list))
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [imageId, usable, toast])

  useEffect(() => {
    load()
  }, [load])

  // 表情包按需拉取，避免每次进详情页都请求
  useEffect(() => {
    if (!pickerOpen || !stickerEnabled || stickerPacks.length > 0) return undefined
    let cancelled = false
    setStickersLoading(true)
    api
      .get('/api/comments/stickers')
      .then((data) => {
        if (!cancelled) setStickerPacks(Array.isArray(data) ? data : [])
      })
      .catch((err) => {
        if (!cancelled) toast.error(err.message)
      })
      .finally(() => {
        if (!cancelled) setStickersLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [pickerOpen, stickerEnabled, stickerPacks.length, toast])

  useEffect(() => {
    if (!pickerOpen) return undefined
    const onDocClick = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setPickerOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [pickerOpen])

  const goLogin = () => {
    toast.info('登录后才能发表评论')
    navigate('/login', { state: { from: location.pathname } })
  }

  const startReply = (comment) => {
    if (!user) {
      goLogin()
      return
    }
    setReplyTo({ id: comment.id, nickname: comment.author?.nickname || '用户' })
    boxRef.current?.focus()
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!user) {
      goLogin()
      return
    }
    if (sending) return
    const text = content.trim()
    if (!text && !sticker) {
      toast.info('请输入评论内容或选择表情包')
      return
    }
    setSending(true)
    try {
      await api.post(
        `/api/images/${imageId}/comments`,
        { content: text, stickerId: sticker?.id ?? null, parentId: replyTo?.id ?? null },
        { auth: true },
      )
      setContent('')
      setSticker(null)
      setReplyTo(null)
      setPickerOpen(false)
      toast.success('评论已发布')
      await load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSending(false)
    }
  }

  if (!usable) return null

  return (
    <section className="border-t border-slate-200 pt-6 dark:border-white/5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="inline-flex items-center gap-2 text-sm font-medium">
          <MessageSquare size={15} className="text-slate-400" />
          评论
          <span className="text-slate-400">（{total}）</span>
        </h2>
        {isAdmin && !enabled ? (
          <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
            全局评论区已关闭，仅管理员可见
          </span>
        ) : null}
      </div>

      {/* 发表框：未登录时引导登录 */}
      {user ? (
        <form onSubmit={submit} className="admin-card mb-6 space-y-3 p-4">
          {replyTo ? (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-primary-50 px-3 py-1.5 text-xs text-primary-600 dark:bg-primary-500/10 dark:text-primary-300">
              <span className="truncate">正在回复 @{replyTo.nickname}</span>
              <button type="button" onClick={() => setReplyTo(null)} className="shrink-0" aria-label="取消回复">
                <X size={13} />
              </button>
            </div>
          ) : null}

          <textarea
            ref={boxRef}
            rows={3}
            maxLength={MAX_LEN}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="友善发言，一起交流～"
            className="admin-input resize-y"
          />

          {sticker ? (
            <div className="flex items-center gap-2">
              <div className="relative">
                <img
                  src={sticker.url}
                  alt="已选表情"
                  className="h-16 w-16 rounded-lg border border-slate-200 object-contain dark:border-white/10"
                />
                <button
                  type="button"
                  onClick={() => setSticker(null)}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-slate-900/70 p-0.5 text-white"
                  aria-label="移除表情"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {stickerEnabled ? (
                <div className="relative" ref={pickerRef}>
                  <button
                    type="button"
                    onClick={() => setPickerOpen((v) => !v)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition ${
                      pickerOpen
                        ? 'border-primary-300 text-primary-500 dark:border-primary-500/50'
                        : 'border-slate-200 text-slate-500 hover:border-primary-500/50 hover:text-primary-500 dark:border-white/10 dark:text-slate-300'
                    }`}
                  >
                    <Smile size={16} />
                    表情
                  </button>
                  {pickerOpen ? (
                    <div className="absolute bottom-full left-0 z-30 mb-2 w-80 max-w-[85vw] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-white/10 dark:bg-slate-900">
                      {stickersLoading ? (
                        <div className="flex items-center justify-center gap-2 py-10 text-xs text-slate-400">
                          <Spinner size={14} />
                          加载中…
                        </div>
                      ) : stickerPacks.length === 0 ? (
                        <p className="px-3 py-10 text-center text-xs text-slate-400">
                          暂无表情包，请在后台「表情包」中上传
                        </p>
                      ) : (
                        <>
                          {/* 套装切换：icon + 名字 */}
                          <div className="flex gap-1 overflow-x-auto border-b border-slate-100 px-2 pt-2 dark:border-white/5">
                            {stickerPacks.map((pack, index) => (
                              <button
                                key={pack.id}
                                type="button"
                                onClick={() => setPackIndex(index)}
                                className={`flex shrink-0 items-center gap-1.5 rounded-t-lg px-2.5 py-1.5 text-xs transition ${
                                  index === packIndex
                                    ? 'bg-primary-50 font-medium text-primary-600 dark:bg-primary-500/10 dark:text-primary-300'
                                    : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5'
                                }`}
                              >
                                {pack.iconUrl ? (
                                  <img src={pack.iconUrl} alt="" className="h-4 w-4 object-contain" />
                                ) : null}
                                {pack.name}
                              </button>
                            ))}
                          </div>
                          <div className="max-h-56 overflow-y-auto p-2">
                            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
                              {(stickerPacks[packIndex]?.stickers || []).map((item) => (
                                <button
                                  key={item.id}
                                  type="button"
                                  title={item.name}
                                  onClick={() => {
                                    setSticker(item)
                                    setPickerOpen(false)
                                  }}
                                  className="aspect-square overflow-hidden rounded-lg border border-transparent p-0.5 transition hover:border-primary-300 hover:bg-slate-50 dark:hover:bg-white/5"
                                >
                                  <img
                                    src={item.url}
                                    alt={item.name || '表情包'}
                                    loading="lazy"
                                    className="h-full w-full object-contain"
                                  />
                                </button>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <span className="text-xs text-slate-400">
                {content.length}/{MAX_LEN}
              </span>
            </div>

            <button type="submit" disabled={sending} className="admin-btn-primary disabled:opacity-60">
              {sending ? <Spinner size={15} /> : <Send size={15} />}
              发表评论
            </button>
          </div>
        </form>
      ) : (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-slate-200 px-4 py-3 dark:border-white/10">
          <p className="text-sm text-slate-500 dark:text-slate-400">登录后即可发表评论</p>
          <button type="button" onClick={goLogin} className="admin-btn-primary">
            <LogIn size={15} />
            去登录
          </button>
        </div>
      )}

      {/* 评论列表 */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
          <Spinner size={16} />
          评论加载中…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400 dark:border-white/10">
          还没有评论，快来抢沙发～
        </div>
      ) : (
        <div className="space-y-5">
          {items.map((comment) => (
            <CommentItem key={comment.id} comment={comment} onReply={startReply} />
          ))}
        </div>
      )}
    </section>
  )
}
