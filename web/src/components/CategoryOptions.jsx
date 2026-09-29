/**
 * 分类下拉选项：按一级分类分组
 * - 默认只列出可挂壁纸的叶子分类：没有下级的一级分类平铺，二级分类收进对应一级的 optgroup
 * - includeParents 时额外把「有下级的一级分类」本身也作为可选项（用于筛选，一级会聚合其下全部壁纸）
 * @param {object} props
 * @param {Array} props.categories 分类列表（需含 id / slug / name / parentId）
 * @param {string} props.valueKey option 的取值字段：'slug'（筛选）或 'id'（挂载壁纸）
 * @param {boolean} props.includeParents 是否把有下级的一级分类也列为可选项
 * @param {boolean} props.showCount 名称后是否带上壁纸数量
 */
export default function CategoryOptions({
  categories = [],
  valueKey = 'slug',
  includeParents = false,
  showCount = false,
}) {
  const tops = categories.filter((c) => !c.parentId)
  const label = (category) =>
    showCount ? `${category.name}（${category.count ?? 0}）` : category.name

  return (
    <>
      {tops.map((top) => {
        const children = categories.filter((c) => c.parentId === top.id)
        // 没有下级的一级分类本身就是叶子分类，直接平铺
        if (children.length === 0) {
          return (
            <option key={top.id} value={top[valueKey]}>
              {label(top)}
            </option>
          )
        }
        return (
          <optgroup key={top.id} label={top.name}>
            {includeParents ? (
              <option value={top[valueKey]}>
                {top.name} 全部{showCount ? `（${top.count ?? 0}）` : ''}
              </option>
            ) : null}
            {children.map((child) => (
              <option key={child.id} value={child[valueKey]}>
                {label(child)}
              </option>
            ))}
          </optgroup>
        )
      })}
    </>
  )
}
