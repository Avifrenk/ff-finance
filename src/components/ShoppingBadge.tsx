import { Link } from 'react-router-dom'
import { useShoppingList } from '../hooks/useShoppingList'

export function ShoppingBadge() {
  const { pending, loading } = useShoppingList()
  if (loading || pending.length === 0) return null

  const n = pending.length
  const noun = n === 1 ? 'позиция' : n >= 2 && n <= 4 ? 'позиции' : 'позиций'

  return (
    <Link
      to="/shopping"
      className="flex items-center justify-between rounded-2xl border border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/30 px-4 py-3 hover:bg-amber-100/60 dark:hover:bg-amber-950/50 transition-colors"
    >
      <span className="text-sm text-slate-800 dark:text-slate-200">
        🛒 В списке покупок: <strong className="font-semibold">{n}</strong> {noun}
      </span>
      <span className="text-slate-400 dark:text-slate-500">›</span>
    </Link>
  )
}
