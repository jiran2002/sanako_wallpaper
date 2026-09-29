import { Loader2 } from 'lucide-react'

/** 旋转加载指示器，默认用于按钮内联 */
export default function Spinner({ size = 18, className = '' }) {
  return <Loader2 size={size} className={`animate-spin ${className}`} aria-hidden="true" />
}
