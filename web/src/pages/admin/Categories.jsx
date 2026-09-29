import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { api } from '../../lib/api'
import { useToast } from '../../components/Toast'
import Modal from '../../components/Modal'
import Spinner from '../../components/Spinner'
import { RowSkeleton } from '../../components/Skeleton'

const inputClass = 'admin-input'

const EMPTY_FORM = {
  name: '',
  slug: '',
  description: '',
  sortOrder: 0,
  // level: 'top' 一级菜单 / 'child' 二级菜单
  level: 'top',
  parentId: '',
  showInNav: true,
  showOnHome: false,
  showInAll: true,
  displayStyle: 'pc',
}

/** 是否置顶到顶部栏 / 主页显示的开关按钮 */
function FlagToggle({ active, disabled, title, onClick }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`admin-badge py-1 transition disabled:cursor-not-allowed disabled:opacity-50 ${
        active
          ? 'bg-primary-50 text-primary-600 hover:bg-primary-100 dark:bg-primary-500/15 dark:text-primary-300'
          : 'bg-slate-100/80 text-slate-400 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-500'
      }`}
    >
      {active ? '显示' : '隐藏'}
    </button>
  )
}

/** 展示样式切换：PC 宽高自适应 / 手机竖图适配 / 小图模式（一级分类可点，二级分类跟随上级） */
const STYLE_OPTIONS = [
  { key: 'pc', label: 'PC', title: '宽高自适应（默认布局）' },
  { key: 'mobile', label: '手机', title: '竖图适配（手机壁纸布局）' },
  { key: 'small', label: '小图', title: '小图模式（缩略图更小，一排最多 8 个）' },
]

/** 切换样式后的提示文案 */
const STYLE_TOAST = {
  pc: '已切换为 PC 样式',
  mobile: '已切换为手机样式（竖图适配）',
  small: '已切换为小图模式（一排最多 8 个）',
}

function StyleToggle({ value, onChange }) {
  return (
    <div className="inline-flex overflow-hidden rounded-full border border-slate-200 bg-white text-xs shadow-sm dark:border-white/10 dark:bg-white/5">
      {STYLE_OPTIONS.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => onChange(option.key)}
          title={option.title}
          className={`px-2.5 py-1 transition ${
            value === option.key
              ? 'bg-primary-500 text-white'
              : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export default function Categories() {
  const toast = useToast()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // { id?, ...form }
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get('/api/admin/categories', { auth: true })
      setItems(Array.isArray(data) ? data : [])
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const topCategories = useMemo(() => items.filter((item) => !item.parentId), [items])
  const childrenOf = useCallback(
    (parentId) => items.filter((item) => item.parentId === parentId),
    [items]
  )
  // 一级分类在前，其下二级分类紧随其后
  const rows = useMemo(
    () => topCategories.flatMap((top) => [top, ...childrenOf(top.id)]),
    [topCategories, childrenOf]
  )

  const save = async () => {
    if (!editing.name.trim()) {
      toast.error('请填写分类名称')
      return
    }
    const isChild = editing.level === 'child'
    if (isChild && !editing.parentId) {
      toast.error('请选择上级分类')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: editing.name.trim(),
        slug: editing.slug.trim() || undefined,
        description: editing.description,
        sortOrder: Number(editing.sortOrder) || 0,
        parentId: isChild ? Number(editing.parentId) : null,
        // 二级分类跟随其一级分类出现在下拉里，不需要单独的顶部栏开关
        showInNav: isChild ? false : Boolean(editing.showInNav),
        showOnHome: Boolean(editing.showOnHome),
        showInAll: Boolean(editing.showInAll),
        // 二级分类的展示样式由后端跟随一级分类，这里只在「一级菜单」时提交
        displayStyle: isChild ? undefined : editing.displayStyle,
      }
      if (editing.id) await api.patch(`/api/admin/categories/${editing.id}`, payload, { auth: true })
      else await api.post('/api/admin/categories', payload, { auth: true })
      toast.success(editing.id ? '分类已更新' : '分类已创建')
      setEditing(null)
      load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const toggleFlag = async (category, field) => {
    try {
      await api.patch(`/api/admin/categories/${category.id}`, { [field]: !category[field] }, { auth: true })
      load()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const changeStyle = async (category, displayStyle) => {
    if (category.displayStyle === displayStyle) return
    try {
      await api.patch(`/api/admin/categories/${category.id}`, { displayStyle }, { auth: true })
      toast.success(STYLE_TOAST[displayStyle] || '已更新显示样式')
      load()
    } catch (err) {
      toast.error(err.message)
    }
  }

  // 切换一级 / 二级菜单：转二级时自动带上第一个可选的一级分类，省去手动查找
  const changeLevel = (level) => {
    setEditing((prev) => {
      if (level === 'top') return { ...prev, level, parentId: '' }
      const candidates = topCategories.filter((item) => item.id !== prev.id)
      return {
        ...prev,
        level,
        parentId: prev.parentId || (candidates[0] ? String(candidates[0].id) : ''),
      }
    })
  }

  const remove = async (category) => {
    if (!window.confirm(`确定删除分类「${category.name}」吗？`)) return
    try {
      await api.del(`/api/admin/categories/${category.id}`, { auth: true })
      toast.success('分类已删除')
      load()
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="admin-title">分类管理</h1>
          <p className="admin-subtitle">
            共 {items.length} 个分类（一级 {topCategories.length} 个，二级 {items.length - topCategories.length} 个）
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing({ ...EMPTY_FORM })}
          className="admin-btn-primary"
        >
          <Plus size={15} />
          新建分类
        </button>
      </div>

      <div className="rounded-2xl border border-primary-100 bg-primary-50/60 px-4 py-3 text-sm leading-relaxed text-slate-700 dark:border-primary-500/20 dark:bg-primary-500/10 dark:text-slate-200">
        <p>
          <strong className="font-semibold text-slate-900 dark:text-white">「置顶到顶部栏」</strong>
          的一级分类平铺在顶部导航栏，其下的二级分类收进悬停下拉；勾选
          <strong className="font-semibold text-slate-900 dark:text-white">「主页显示」</strong>
          的分类会在首页生成分区，分区标题即分类名称。
        </p>
        <p className="mt-1.5">
          <strong className="font-semibold text-slate-900 dark:text-white">「显示样式」</strong>
          里的 PC 为宽高自适应（默认），手机为竖图适配（卡片按手机竖屏比例、列数更多）；样式会同步到首页分区与分类页，
          其下的二级分类自动跟随。
        </p>
        <p className="mt-1.5">
          壁纸只能挂到
          <strong className="font-semibold text-slate-900 dark:text-white">「叶子分类」</strong>
          ：一级分类下有二级分类时，它只作为入口页聚合其下全部壁纸，不能再直接挂壁纸；没有下级的一级分类本身就可以挂壁纸。
        </p>
      </div>

      {loading ? (
        <RowSkeleton rows={5} />
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 py-20 text-center text-sm text-slate-400 dark:border-white/10 dark:bg-white/[0.03]">
          还没有分类，点击右上角新建
        </div>
      ) : (
        <div className="admin-card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="admin-table min-w-[58rem]">
              <thead className="admin-thead">
                <tr>
                  <th className="px-4 py-3 font-medium">名称</th>
                  <th className="px-4 py-3 font-medium">Slug</th>
                  <th className="px-4 py-3 font-medium">描述</th>
                  <th className="px-4 py-3 font-medium">排序</th>
                  <th className="px-4 py-3 font-medium">壁纸数</th>
                  <th className="px-4 py-3 font-medium">显示样式</th>
                  <th className="px-4 py-3 font-medium">顶部栏</th>
                  <th className="px-4 py-3 font-medium">主页</th>
                  <th className="px-4 py-3 font-medium">全部壁纸</th>
                  <th className="px-4 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/60 dark:divide-white/5">
                {rows.map((category) => {
                  const isChild = Boolean(category.parentId)
                  return (
                    <tr key={category.id} className="admin-row">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {isChild ? (
                            <span className="pl-4 text-slate-300 dark:text-slate-600">└</span>
                          ) : null}
                          <span className={isChild ? 'text-slate-600 dark:text-slate-300' : 'font-medium'}>
                            {category.name}
                          </span>
                          <span className="admin-badge bg-white text-[11px] text-slate-500 dark:bg-white/10 dark:text-slate-400">
                            {isChild ? '二级' : '一级'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{category.slug}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        <span className="line-clamp-1 max-w-[16rem]">{category.description || '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{category.sortOrder ?? 0}</td>
                      <td className="px-4 py-3">
                        <span className="admin-badge bg-primary-50 text-primary-600 dark:bg-primary-500/15 dark:text-primary-300">
                          {category.count ?? 0}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {isChild ? (
                          <span className="text-xs text-slate-400">跟随上级</span>
                        ) : (
                          <StyleToggle
                            value={category.displayStyle || 'pc'}
                            onChange={(style) => changeStyle(category, style)}
                          />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isChild ? (
                          <span className="text-xs text-slate-400">跟随上级</span>
                        ) : (
                          <FlagToggle
                            active={category.showInNav}
                            title="置顶到顶部栏"
                            onClick={() => toggleFlag(category, 'showInNav')}
                          />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <FlagToggle
                          active={category.showOnHome}
                          title="在首页生成分区"
                          onClick={() => toggleFlag(category, 'showOnHome')}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <FlagToggle
                          active={category.showInAll}
                          title="加入全部壁纸（/wallpapers）"
                          onClick={() => toggleFlag(category, 'showInAll')}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              setEditing({
                                id: category.id,
                                name: category.name || '',
                                slug: category.slug || '',
                                description: category.description || '',
                                sortOrder: category.sortOrder ?? 0,
                                level: category.parentId ? 'child' : 'top',
                                parentId: category.parentId ? String(category.parentId) : '',
                                showInNav: Boolean(category.showInNav),
                                showOnHome: Boolean(category.showOnHome),
                                showInAll: Boolean(category.showInAll),
                                displayStyle: category.displayStyle || 'pc',
                              })
                            }
                            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-primary-600 dark:hover:bg-white/10 dark:hover:text-primary-300"
                            title="编辑"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(category)}
                            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/15"
                            title="删除"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? '编辑分类' : '新建分类'}
        footer={
          <>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="admin-btn"
            >
              取消
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="admin-btn-primary"
            >
              {saving ? <Spinner size={15} /> : null}
              保存
            </button>
          </>
        }
      >
        {editing ? (
          <div className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">名称 *</span>
              <input
                value={editing.name}
                onChange={(e) => setEditing((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="例如：风景"
                className={inputClass}
              />
            </label>

            <div className="space-y-1.5">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">层级 *</span>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'top', label: '一级菜单', hint: '平铺顶部导航栏，可生成首页分区' },
                  { key: 'child', label: '二级菜单', hint: '挂在某个一级菜单下面' },
                ].map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => changeLevel(option.key)}
                    className={`rounded-xl border px-3 py-2 text-left transition ${
                      editing.level === option.key
                        ? 'border-primary-400 bg-primary-50 text-primary-700 dark:border-primary-500/60 dark:bg-primary-500/10 dark:text-primary-300'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-primary-300 dark:border-white/10 dark:bg-white/5 dark:text-slate-400'
                    }`}
                  >
                    <span className="block text-sm font-medium">{option.label}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug opacity-80">
                      {option.hint}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {editing.level === 'child' ? (
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  上级分类 *
                </span>
                <select
                  value={editing.parentId}
                  onChange={(e) => setEditing((prev) => ({ ...prev, parentId: e.target.value }))}
                  className={inputClass}
                >
                  <option value="">请选择上级分类</option>
                  {topCategories
                    .filter((item) => item.id !== editing.id)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </label>
            ) : (
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  显示样式
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: 'pc', label: 'PC', hint: '宽高自适应（保持现在的布局）' },
                    { key: 'mobile', label: '手机', hint: '竖图适配，卡片按手机竖屏比例' },
                    { key: 'small', label: '小图', hint: '小图模式，缩略图更小，一排最多 8 个' },
                  ].map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setEditing((prev) => ({ ...prev, displayStyle: option.key }))}
                      className={`rounded-xl border px-3 py-2 text-left transition ${
                        editing.displayStyle === option.key
                          ? 'border-primary-400 bg-primary-50 text-primary-700 dark:border-primary-500/60 dark:bg-primary-500/10 dark:text-primary-300'
                          : 'border-slate-200 bg-white text-slate-500 hover:border-primary-300 dark:border-white/10 dark:bg-white/5 dark:text-slate-400'
                      }`}
                    >
                      <span className="block text-sm font-medium">{option.label}</span>
                      <span className="mt-0.5 block text-[11px] leading-snug opacity-80">
                        {option.hint}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400">
                  样式会同步到首页分区与分类页，其下的二级分类自动跟随
                </p>
              </div>
            )}

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Slug（留空自动生成）
              </span>
              <input
                value={editing.slug}
                onChange={(e) => setEditing((prev) => ({ ...prev, slug: e.target.value }))}
                placeholder="例如：landscape"
                className={inputClass}
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">描述</span>
              <textarea
                rows={3}
                value={editing.description}
                onChange={(e) => setEditing((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="会作为首页分区与分类页的副标题"
                className={inputClass}
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                排序（数字越小越靠前）
              </span>
              <input
                type="number"
                value={editing.sortOrder}
                onChange={(e) => setEditing((prev) => ({ ...prev, sortOrder: e.target.value }))}
                className={inputClass}
              />
            </label>

            <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/5">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.level === 'top' && Boolean(editing.showInNav)}
                  disabled={editing.level === 'child'}
                  onChange={(e) => setEditing((prev) => ({ ...prev, showInNav: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 accent-primary-500 disabled:opacity-50"
                />
                <span className={editing.level === 'child' ? 'text-slate-400' : ''}>
                  置顶到顶部栏
                  <span className="block text-xs text-slate-400">
                    {editing.level === 'child'
                      ? '二级分类会跟随其一级分类出现在顶部栏的下拉里'
                      : '平铺显示在顶部导航栏'}
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(editing.showOnHome)}
                  onChange={(e) => setEditing((prev) => ({ ...prev, showOnHome: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 accent-primary-500"
                />
                <span>
                  主页显示
                  <span className="block text-xs text-slate-400">
                    在首页生成一个分区，标题为分类名称、副标题为描述
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(editing.showInAll)}
                  onChange={(e) => setEditing((prev) => ({ ...prev, showInAll: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 accent-primary-500"
                />
                <span>
                  加入「全部壁纸」
                  <span className="block text-xs text-slate-400">
                    不勾选时，该分类（含其下二级分类）的图片不会出现在 /wallpapers 全部壁纸列表；分类自己的页面仍可见
                  </span>
                </span>
              </label>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
