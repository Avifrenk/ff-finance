// Чистые функции агрегации для дашборда: суммы по месяцу, разбивка по категориям.
// Не имеют I/O — принимают уже загруженные operations/accounts/categories/курсы.
//
// Конвертация валют идёт через convertMoney(from → base) на дату операции.
// Если курса нет — операция считается «пропущенной» и подсвечивается флагом
// missingRate. Переводы (transfer_id != null) исключены из всех агрегатов.
//
// Эти функции переиспользуются в Dashboard для виджетов:
// — карточки «Этот месяц / прошлый» (monthTotals + сравнение),
// — pie/bar по категориям расходов (aggregateByCategory).

import { convertMoney, type RatesByDate } from './fx'

export interface AggOperation {
  account_id: string
  category_id: string | null
  kind: 'expense' | 'income'
  amount: number
  occurred_at: string
  transfer_id: string | null
}

export interface AggAccount {
  id: string
  currency: string
}

export interface AggCategory {
  id: string
  name: string
  kind: 'expense' | 'income'
  icon: string | null
  color: string | null
}

export interface MonthTotals {
  income: number
  expense: number
  net: number
  /** Хотя бы по одной операции не нашёлся курс — итог занижен. */
  missingRate: boolean
}

export interface CategoryAgg {
  categoryId: string | null
  name: string
  icon: string | null
  color: string | null
  total: number
  share: number
  count: number
}

/** Сводный диапазон периода. Полуоткрытый: [from, to] включительно по `occurred_at`. */
export interface DateRange {
  from: string
  to: string
}

const iso = (d: Date): string => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function monthRange(ref: Date = new Date()): DateRange {
  const from = new Date(ref.getFullYear(), ref.getMonth(), 1)
  const to = new Date(ref.getFullYear(), ref.getMonth() + 1, 0)
  return { from: iso(from), to: iso(to) }
}

export function previousMonthRange(ref: Date = new Date()): DateRange {
  const prev = new Date(ref.getFullYear(), ref.getMonth() - 1, 1)
  return monthRange(prev)
}

export function last30DaysRange(ref: Date = new Date()): DateRange {
  const to = new Date(ref)
  const from = new Date(ref)
  from.setDate(from.getDate() - 29)
  return { from: iso(from), to: iso(to) }
}

export function quarterToDateRange(ref: Date = new Date()): DateRange {
  const qStartMonth = Math.floor(ref.getMonth() / 3) * 3
  const from = new Date(ref.getFullYear(), qStartMonth, 1)
  return { from: iso(from), to: iso(ref) }
}

function inRange(date: string, range: DateRange): boolean {
  return date >= range.from && date <= range.to
}

function convertOne(
  amount: number,
  currency: string,
  base: string,
  ratesByDate: RatesByDate,
  onDate: string,
): number | null {
  if (currency === base) return amount
  return convertMoney(amount, currency, base, ratesByDate, onDate)
}

/**
 * Сумма дохода/расхода за период, в base_currency.
 * Пример: monthTotals(ops, accs, 'ILS', rates, {from: '2026-05-01', to: '2026-05-31'})
 * → { income: 18000, expense: 6240, net: 11760, missingRate: false }.
 *
 * Опциональный categoryFilter — учитывать только операции с category_id
 * из этого Set'а (используется для расчёта подушки по essential-категориям).
 * null-category в фильтр не попадает.
 */
export function monthTotals(
  operations: AggOperation[],
  accountById: Map<string, AggAccount>,
  baseCurrency: string,
  ratesByDate: RatesByDate,
  range: DateRange,
  categoryFilter?: Set<string>,
): MonthTotals {
  let income = 0
  let expense = 0
  let missingRate = false
  for (const op of operations) {
    if (op.transfer_id !== null) continue
    if (!inRange(op.occurred_at, range)) continue
    if (categoryFilter) {
      if (op.category_id === null) continue
      if (!categoryFilter.has(op.category_id)) continue
    }
    const acc = accountById.get(op.account_id)
    const currency = acc?.currency ?? baseCurrency
    const conv = convertOne(Number(op.amount), currency, baseCurrency, ratesByDate, op.occurred_at)
    if (conv === null) {
      missingRate = true
      continue
    }
    if (op.kind === 'income') income += conv
    else expense += conv
  }
  return { income, expense, net: income - expense, missingRate }
}

/**
 * Группировка операций заданного kind по категориям, отсортирована по total desc.
 * Категория null → «Без категории». share = total / sumAllTotals.
 *
 * Пример: aggregateByCategory(ops, accs, cats, 'ILS', rates, 'expense', range)
 * → [{categoryId, name: 'Продукты', total: 1240, share: 0.42, count: 8, ...}, …]
 */
export function aggregateByCategory(
  operations: AggOperation[],
  accountById: Map<string, AggAccount>,
  categoryById: Map<string, AggCategory>,
  baseCurrency: string,
  ratesByDate: RatesByDate,
  kind: 'expense' | 'income',
  range: DateRange,
): { items: CategoryAgg[]; total: number; missingRate: boolean } {
  const byCat = new Map<string | null, { total: number; count: number }>()
  let grandTotal = 0
  let missingRate = false
  for (const op of operations) {
    if (op.transfer_id !== null) continue
    if (op.kind !== kind) continue
    if (!inRange(op.occurred_at, range)) continue
    const acc = accountById.get(op.account_id)
    const currency = acc?.currency ?? baseCurrency
    const conv = convertOne(Number(op.amount), currency, baseCurrency, ratesByDate, op.occurred_at)
    if (conv === null) {
      missingRate = true
      continue
    }
    const key = op.category_id
    const cur = byCat.get(key) ?? { total: 0, count: 0 }
    cur.total += conv
    cur.count += 1
    byCat.set(key, cur)
    grandTotal += conv
  }
  const items: CategoryAgg[] = []
  for (const [categoryId, { total, count }] of byCat) {
    const cat = categoryId ? categoryById.get(categoryId) : null
    items.push({
      categoryId,
      name: cat?.name ?? 'Без категории',
      icon: cat?.icon ?? null,
      color: cat?.color ?? null,
      total,
      share: grandTotal > 0 ? total / grandTotal : 0,
      count,
    })
  }
  items.sort((a, b) => b.total - a.total)
  return { items, total: grandTotal, missingRate }
}

/**
 * Сворачиваем категории за пределами top-N в «Прочее».
 * Если в хвосте только одна категория — не сворачиваем, оставляем её именем.
 */
export function collapseTail(items: CategoryAgg[], topN: number): CategoryAgg[] {
  if (items.length <= topN) return items
  const head = items.slice(0, topN)
  const tail = items.slice(topN)
  if (tail.length === 1) return items
  const totalTail = tail.reduce((s, x) => s + x.total, 0)
  const countTail = tail.reduce((s, x) => s + x.count, 0)
  const shareTail = tail.reduce((s, x) => s + x.share, 0)
  head.push({
    categoryId: null,
    name: `Прочее (${tail.length})`,
    icon: '…',
    color: null,
    total: totalTail,
    share: shareTail,
    count: countTail,
  })
  return head
}

/** Палитра пастельных оттенков на случай, если у категории нет своего цвета. */
export const FALLBACK_PALETTE = [
  '#6366f1', // indigo
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // rose
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f97316', // orange
  '#ec4899', // pink
  '#84cc16', // lime
  '#64748b', // slate
]

export function categoryColor(item: CategoryAgg, index: number): string {
  if (item.color) return item.color
  return FALLBACK_PALETTE[index % FALLBACK_PALETTE.length]
}
