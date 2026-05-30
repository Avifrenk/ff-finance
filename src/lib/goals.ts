// =============================================================================
// Чистые агрегаты для целей и подушки безопасности (Фаза 4.3)
// =============================================================================
// Без I/O. Конверсия валют не нужна — суммы целей и contributions хранятся
// в base_currency семьи. monthlyExpenses для safetyCushion считаются на
// клиенте через monthTotals() из aggregate.ts.
//
// Все функции — pure, без side-effects, можно мемоизировать на стороне React.
// =============================================================================

import type { Goal } from '../hooks/useGoals'
import type { GoalContribution } from '../hooks/useGoalContributions'

// -----------------------------------------------------------------------------
// goalProgress — сумма contributions + метаданные
// -----------------------------------------------------------------------------

export interface GoalProgress {
  saved: number
  remaining: number
  /** Клипованный 0..1, для прогресс-бара. */
  percent: number
  /** Фактический процент (может быть > 1 если переполнено), для текста. */
  actualPercent: number
  contributionsCount: number
  firstContributionAt: string | null
  lastContributionAt: string | null
}

/**
 * Пример: для goal с target_amount=15000 и трёх contributions по 5000 →
 *   { saved: 15000, remaining: 0, percent: 1, actualPercent: 1, count: 3, ... }
 * Если contributions пусто →
 *   { saved: 0, remaining: target, percent: 0, actualPercent: 0, count: 0, first/last: null }
 */
export function goalProgress(goal: Goal, contributions: GoalContribution[]): GoalProgress {
  let saved = 0
  let first: string | null = null
  let last: string | null = null
  let count = 0
  for (const c of contributions) {
    if (c.goal_id !== goal.id) continue
    saved += Number(c.amount)
    count++
    if (first === null || c.occurred_at < first) first = c.occurred_at
    if (last === null || c.occurred_at > last) last = c.occurred_at
  }
  const target = Number(goal.target_amount)
  const actualPercent = target > 0 ? saved / target : 0
  return {
    saved,
    remaining: Math.max(0, target - saved),
    percent: Math.min(1, Math.max(0, actualPercent)),
    actualPercent,
    contributionsCount: count,
    firstContributionAt: first,
    lastContributionAt: last,
  }
}

// -----------------------------------------------------------------------------
// goalEta — оценка даты достижения по среднему темпу пополнения
// -----------------------------------------------------------------------------

export type GoalEtaReason = 'done' | 'no-contributions' | 'too-slow' | 'on-track'

export interface GoalEta {
  etaDate: Date | null
  /** Средняя сумма contributions в день за период «с первого пополнения по сегодня». */
  perDay: number
  reason: GoalEtaReason
  /** True если etaDate > goal.target_date. */
  behindTarget: boolean
}

/**
 * Пример: 3 contributions по 5000 за 30 дней до сегодня, target=20000 →
 *   perDay ≈ 500, remaining=5000, etaDate ≈ +10 дней.
 */
export function goalEta(
  goal: Goal,
  contributions: GoalContribution[],
  today: Date = new Date(),
): GoalEta {
  const p = goalProgress(goal, contributions)
  if (p.saved >= Number(goal.target_amount)) {
    return { etaDate: null, perDay: 0, reason: 'done', behindTarget: false }
  }
  if (p.contributionsCount === 0 || p.firstContributionAt === null) {
    return { etaDate: null, perDay: 0, reason: 'no-contributions', behindTarget: false }
  }
  const first = isoDateToLocal(p.firstContributionAt)
  const daysSinceFirst = Math.max(1, daysBetween(first, today))
  const perDay = p.saved / daysSinceFirst
  if (perDay <= 0) {
    return { etaDate: null, perDay: 0, reason: 'too-slow', behindTarget: false }
  }
  const daysNeeded = Math.ceil(p.remaining / perDay)
  const eta = new Date(today.getTime())
  eta.setDate(eta.getDate() + daysNeeded)
  let behind = false
  if (goal.target_date) {
    const target = isoDateToLocal(goal.target_date)
    if (eta.getTime() > target.getTime()) behind = true
  }
  return { etaDate: eta, perDay, reason: 'on-track', behindTarget: behind }
}

// -----------------------------------------------------------------------------
// safetyCushion — «сколько месяцев жизни без дохода»
// -----------------------------------------------------------------------------

export interface MonthlyExpense {
  yyyymm: string
  expense: number
}

export interface SafetyCushion {
  /** null если данных нет; иначе totalBalance / avgExpense (может быть отрицательным при овердрафте). */
  months: number | null
  /** Средний расход за monthsUsed месяцев (в base_currency). */
  avgExpense: number
  /** Сколько последних полных месяцев попало в среднее (1..3). */
  monthsUsed: number
}

/**
 * Берёт последние 3 ПОЛНЫХ месяца (текущий не считается — он неполный).
 * Если все 3 месяца с нулевым расходом → months = null (UI напишет «нет данных»).
 *
 * Пример: monthlyExpenses=[
 *   { yyyymm:'2026-02', expense: 12000 },
 *   { yyyymm:'2026-03', expense: 14000 },
 *   { yyyymm:'2026-04', expense: 10000 },
 * ], totalBalance=60000 →
 *   avgExpense = 12000, months = 5, monthsUsed = 3
 */
export function safetyCushion(
  monthlyExpenses: MonthlyExpense[],
  totalBalance: number,
): SafetyCushion {
  const nonZero = monthlyExpenses.filter((m) => m.expense > 0)
  if (nonZero.length === 0) {
    return { months: null, avgExpense: 0, monthsUsed: 0 }
  }
  const sum = nonZero.reduce((acc, m) => acc + m.expense, 0)
  const avg = sum / nonZero.length
  if (avg <= 0) {
    return { months: null, avgExpense: 0, monthsUsed: nonZero.length }
  }
  return { months: totalBalance / avg, avgExpense: avg, monthsUsed: nonZero.length }
}

/**
 * Возвращает yyyymm-ключи последних N полных календарных месяцев (текущий
 * не включён). Например, для today=2026-05-30, n=3 →
 *   ['2026-02', '2026-03', '2026-04']
 */
export function lastFullMonthKeys(n: number, today: Date = new Date()): string[] {
  const out: string[] = []
  for (let i = n; i >= 1; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    out.push(`${y}-${m}`)
  }
  return out
}

// -----------------------------------------------------------------------------
// helpers
// -----------------------------------------------------------------------------

function isoDateToLocal(iso: string): Date {
  // YYYY-MM-DD → локальная дата на 00:00, чтобы daysBetween считал ровно.
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime()
  return Math.round(ms / 86_400_000)
}
