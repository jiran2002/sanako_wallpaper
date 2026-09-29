import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, Search, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { useToast } from '../../components/Toast'
import Modal from '../../components/Modal'
import Spinner from '../../components/Spinner'
import { RowSkeleton } from '../../components/Skeleton'
import { formatDate, formatNumber } from '../../lib/format'

const PAGE_SIZE = 20

export default function Comments() {
  const toast = useToast()
  const [keywordInput, setKeywordInput] = useState('')
  const [q, setQ] = useState('')
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get('/api/admin/comments', {
        auth: true,
        query: { page, pageSize: PAGE_SIZE, q },
      })
      setItems(data?.items || [])
      setTotal(data?.total || 0)
      setPages(data?.pages || 1)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [page, q, toast])

  useEffect(() => {
    load()
  }, [load])

  const remove = async () => {
    if (!pendingDelete) return
    setBusy(true)
    try {
      await api.del(`/api/admin/comments/${pendingDelete.id}`, { auth: true })
      toast.success('评论已删除')
      setPendingDelete(null)
      load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="admin-title">评论管理</h1>
        <p className="admin-subtitle">共 {formatNumber(total)} 条评论，删除顶级评论会同时删除其下的回复</p>
      </div>

      <div className="admin-card">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setPage(1)
            setQ(keywordInput.trim())
          }}
        >
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              placeholder="搜索评论内容 / 昵称 / 用户名，回车确认"
              className="admin-input pl-9"
            />
          </div>
        </form>
      </div>

      {loading ? (
        <RowSkeleton rows={6} />
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 py-20 text-center text-sm text-slate-400 dark:border-white/10">
          暂无评论
        </div>
      ) : (
        <div className="admin-card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="admin-table min-w-[52rem]">
              <thead className="admin-thead">
                <tr>
                  <th className="px-3 py-3 font-medium">评论内容</th>
                  <th className="px-3 py-3 font-medium">评论者</th>
                  <th className="px-3 py-3 font-medium">所属壁纸</th>
                  <th className="px-3 py-3 font-medium">时间</th>
                  <th className="px-3 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                {items.map((comment) => (
                  <tr key={comment.id} className="admin-row">
                    <td className="px-3 py-3">
                      <div className="flex items-start gap-3">
                        {comment.sticker ? (
                          <img
                            src={comment.sticker.url}
                            alt=""
                            loading="lazy"
                            className="h-10 w-10 shrink-0 rounded-lg object-contain ring-1 ring-black/5"
                          />
                        ) : null}
                        <div className="min-w-0">
                          {comment.parentId ? (
                            <p className="text-xs text-primary-500">
                              回复 {comment.replyTo ? `@${comment.replyTo.nickname}` : '某条评论'}
                            </p>
                          ) : null}
                          <p className="line-clamp-2 max-w-[26rem] whitespace-pre-line break-words">
                            {comment.content || (comment.sticker ? '［表情包］' : '')}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {comment.author ? (
                        <div>
                          <p className="text-slate-600 dark:text-slate-300">{comment.author.nickname}</p>
                          <p className="text-xs text-slate-400">@{comment.author.username}</p>
                        </div>
                      ) : (
                        <span className="text-slate-400">已注销</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {comment.image ? (
                        <Link
                          to={`/image/${comment.image.id}`}
                          target="_blank"
                          className="inline-flex max-w-[14rem] items-center gap-1.5 text-slate-600 transition hover:text-primary-500 dark:text-slate-300"
                        >
                          <span className="truncate">{comment.image.title || `#${comment.image.id}`}</span>
                          <ExternalLink size={13} className="shrink-0" />
                        </Link>
                      ) : (
                        <span className="text-slate-400">壁纸已删除</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-400">{formatDate(comment.createdAt)}</td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setPendingDelete(comment)}
                          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 disabled:opacity-50 dark:hover:bg-rose-950/40"
                          title="删除"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pages > 1 ? (
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            className="admin-btn disabled:opacity-40"
          >
            <ChevronLeft size={15} />
            上一页
          </button>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {page} / {pages}
          </span>
          <button
            type="button"
            disabled={page >= pages || loading}
            onClick={() => setPage((prev) => Math.min(pages, prev + 1))}
            className="admin-btn disabled:opacity-40"
          >
            下一页
            <ChevronRight size={15} />
          </button>
        </div>
      ) : null}

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title="删除评论？"
        footer={
          <>
            <button type="button" onClick={() => setPendingDelete(null)} className="admin-btn">
              取消
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className="admin-btn-danger disabled:opacity-60"
            >
              {busy ? <Spinner size={15} /> : <Trash2 size={15} />}
              确认删除
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {pendingDelete?.parentId
            ? '删除后该回复将从评论区移除，且不可恢复。'
            : '删除顶级评论会同时删除其下的所有回复，且不可恢复。'}
        </p>
      </Modal>
    </div>
  )
}
