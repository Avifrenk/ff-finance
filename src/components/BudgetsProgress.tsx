import { categoryColor, type AggCategory, type CategoryAgg, FALLBACK_PALETTE } from '../lib/aggregate'
import { formatMoney } from '../lib/format'

interface Props {
  /** Маппинг categoryId → бюджет в base_currency. Если категории нет в мапе — не показываем строку. */
  budgetByCategory: Map<string, number>
  /** Все агрегаты расходов по категориям за тот же период (в base_currency). */
  spentItems: CategoryAgg[]
  /** Справочник категорий для имени/иконки тех, на что ещё ничего не потрачено. */
  categoryById: Map<string, AggCategory>
  baseCurrency: string
}

/**
 * Прогресс-бары бюджета по категориям. Показываем только те категории, у
 * которых задан бюджет. Состояния:
 *   * < 80%  — нейтральный индиго.
 *   * 80-100% — янтарный (предупреждение).
 *   * ≥ 100% — красный + строка «Превышено на N».
 *
 * Если ни одного бюджета не задано — возвращаем null, виджет не рисуется.
 */
export function BudgetsProgress({
  budgetByCategory,
  spentItems,
  categoryById,
  baseCurrency,
}: Props) {
  const spentMap = new Map(spentItems.map((s) => [s.categoryId, s]))
  const rows = [...budgetByCategory.entries()].map(([categoryId, budget], i) => {
    const spentItem = spentMap.get(categoryId) ?? null
    const cat = categoryById.get(categoryId) ?? null
    const spent = spentItem?.total ?? 0
    const name = spentItem?.name ?? cat?.name ?? 'Категория удалена'
    const icon = spentItem?.icon ?? cat?.icon ?? null
    const color = spentItem
      ? categoryColor(spentItem, i)
      : (cat?.color ?? FALLBACK_PALETTE[i % FALLBACK_PALETTE.length])
    const ratio = budget > 0 ? spent / budget : 0
    return { categoryId, budget, spent, name, icon, color, ratio }
  })
  rows.sort((a, b) => b.ratio - a.ratio)

  if (rows.length === 0) return null

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-5">
      <h2 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Бюджеты этого месяца</h2>
      <ul className="space-y-3">
        {rows.map((r) => (
          <BudgetRow
            key={r.categoryId}
            name={r.name}
            icon={r.icon}
            color={r.color}
            spent={r.spent}
            budget={r.budget}
            baseCurrency={baseCurrency}
          />
        ))}
      </ul>
    </section>
  )
}

function BudgetRow({
  name,
  icon,
  color,
  spent,
  budget,
  baseCurrency,
}: {
  name: string
  icon: string | null
  color: string
  spent: number
  budget: number
  baseCurrency: string
}) {
  const ratio = budget > 0 ? spent / budget : 0
  const pct = Math.min(ratio, 1) * 100
  const overshoot = Math.max(0, spent - budget)
  const isOver = ratio >= 1
  const isWarn = ratio >= 0.8 && ratio < 1

  const fillColor = isOver ? '#ef4444' : isWarn ? '#f59e0b' : color
  const pctText = `${Math.round(ratio * 100)}%`

  return (
    <li>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base shrink-0">{icon ?? '•'}</span>
        <span className="flex-1 min-w-0 truncate text-sm font-medium text-slate-900 dark:text-slate-100">
          {name}
          {isWarn && <span className="ml-1 text-amber-500" title="≥ 80% бюджета">⚠</span>}
          {isOver && <span className="ml-1 text-rose-500" title="Превышено">⚠</span>}
        </span>
        <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
          {formatMoney(spent, baseCurrency, 0)} / {formatMoney(budget, baseCurrency, 0)}
        </span>
        <span
          className={`text-xs tabular-nums w-10 text-right whitespace-nowrap ${
            isOver
              ? 'text-rose-600 dark:text-rose-400 font-semibold'
              : isWarn
                ? 'text-amber-600 dark:text-amber-400 font-semibold'
                : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          {pctText}
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: fillColor }}
        />
      </div>
      {isOver && overshoot > 0 && (
        <div className="text-xs text-rose-600 dark:text-rose-400 mt-1">
          Превышено на {formatMoney(overshoot, baseCurrency, 0)}
        </div>
      )}
    </li>
  )
}
