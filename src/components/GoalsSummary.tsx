import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { Goal } from '../hooks/useGoals'
import type { GoalContribution } from '../hooks/useGoalContributions'
import { goalProgress } from '../lib/goals'
import { formatMoney } from '../lib/format'

interface Props {
  goals: Goal[]
  contributions: GoalContribution[]
  baseCurrency: string
}

const DEFAULT_COLOR = '#6366f1'

/**
 * Мини-виджет на Dashboard. Показывает до 3 активных целей, отсортированных
 * по проценту готовности (ближайшие к завершению — наверху). Нажатие ведёт
 * на /goals.
 *
 * Если ни одной активной цели в семье — виджет не рисуется (null).
 */
export function GoalsSummary({ goals, contributions, baseCurrency }: Props) {
  const rows = useMemo(() => {
    const active = goals.filter((g) => !g.is_archived)
    const withProgress = active.map((g) => ({
      goal: g,
      progress: goalProgress(g, contributions),
    }))
    withProgress.sort((a, b) => b.progress.percent - a.progress.percent)
    return withProgress.slice(0, 3)
  }, [goals, contributions])

  if (rows.length === 0) return null

  function remainingPct(remaining: number, target: number): number {
    if (target <= 0) return 0
    return Math.round((remaining / target) * 100)
  }

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">Цели</h2>
        <Link
          to="/goals"
          className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          Все →
        </Link>
      </div>
      <ul className="space-y-3">
        {rows.map(({ goal, progress }) => {
          const color = goal.color || DEFAULT_COLOR
          const isDone = progress.saved >= Number(goal.target_amount)
          const barPct = progress.percent * 100
          return (
            <li key={goal.id}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base shrink-0">{goal.icon ?? '🎯'}</span>
                <span className="flex-1 min-w-0 truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                  {goal.name}
                </span>
                <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  {formatMoney(progress.saved, baseCurrency, 0)} /{' '}
                  {formatMoney(Number(goal.target_amount), baseCurrency, 0)}
                  {!isDone && (
                    <span className="ml-1.5 text-slate-400 dark:text-slate-500">
                      · осталось {remainingPct(progress.remaining, Number(goal.target_amount))}%
                    </span>
                  )}
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${barPct}%`,
                    backgroundColor: isDone ? '#10b981' : color,
                  }}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
