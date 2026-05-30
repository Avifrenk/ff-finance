import { useMemo, useState } from 'react'
import type { Goal } from '../hooks/useGoals'
import type { GoalContribution } from '../hooks/useGoalContributions'
import { goalEta, goalProgress } from '../lib/goals'
import { formatMoney } from '../lib/format'
import { PrimaryButton } from './AuthControls'

interface Props {
  goal: Goal
  contributions: GoalContribution[]
  baseCurrency: string
  isOwner: boolean
  onContribute: () => void
  onEdit: () => void
  onArchive: () => void
  onDelete: () => void
}

const DEFAULT_COLOR = '#6366f1' // indigo-500

export function GoalCard({
  goal,
  contributions,
  baseCurrency,
  isOwner,
  onContribute,
  onEdit,
  onArchive,
  onDelete,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)

  const progress = useMemo(() => goalProgress(goal, contributions), [goal, contributions])
  const eta = useMemo(() => goalEta(goal, contributions), [goal, contributions])

  const color = goal.color || DEFAULT_COLOR
  const isDone = progress.saved >= Number(goal.target_amount)
  const isOver = progress.actualPercent > 1
  const barPct = progress.percent * 100
  const overshoot = progress.saved - Number(goal.target_amount)

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-5">
      <div className="flex items-start gap-3 mb-3">
        <div
          className="h-10 w-10 rounded-xl flex items-center justify-center text-xl shrink-0"
          style={{ backgroundColor: `${color}22` }}
        >
          {goal.icon ?? '🎯'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
              {goal.name}
            </h3>
            <span
              className="text-xs px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 shrink-0"
              title={goal.visibility === 'shared' ? 'Семейная цель' : 'Личная цель'}
            >
              {goal.visibility === 'shared' ? '🏠' : '🧍'}
            </span>
            {isDone && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 shrink-0">
                🎉 Достигнуто
              </span>
            )}
            {goal.auto_percent_of_income > 0 && (
              <span
                className="text-xs px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 shrink-0"
                title={`С каждого дохода автоматически ${goal.auto_percent_of_income}%`}
              >
                ⚡ {goal.auto_percent_of_income}%
              </span>
            )}
          </div>
          {goal.target_date && (
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              к {formatDateRu(goal.target_date)}
            </div>
          )}
        </div>

        <div className="relative shrink-0">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="px-2 py-1 text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded"
            aria-label="Меню"
          >
            ⋯
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-8 z-10 min-w-[160px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg overflow-hidden"
              onMouseLeave={() => setMenuOpen(false)}
            >
              <MenuItem onClick={() => { setMenuOpen(false); onEdit() }}>
                Изменить
              </MenuItem>
              <MenuItem onClick={() => { setMenuOpen(false); onArchive() }}>
                {goal.is_archived ? 'Вернуть в активные' : 'Архивировать'}
              </MenuItem>
              {isOwner && (
                <MenuItem onClick={() => { setMenuOpen(false); onDelete() }} danger>
                  Удалить
                </MenuItem>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden mb-2">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${barPct}%`, backgroundColor: isDone ? '#10b981' : color }}
        />
      </div>

      <div className="flex items-baseline justify-between gap-3 mb-1">
        <div className="text-lg font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
          {formatMoney(progress.saved, baseCurrency, 0)}{' '}
          <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
            / {formatMoney(Number(goal.target_amount), baseCurrency, 0)}
          </span>
        </div>
        <div className="text-sm text-slate-600 dark:text-slate-300 tabular-nums">
          {isDone
            ? '✓ всё'
            : `осталось ${formatMoney(progress.remaining, baseCurrency, 0)}`}
        </div>
      </div>

      {isOver && overshoot > 0 && (
        <div className="text-xs text-emerald-600 dark:text-emerald-400 mb-1">
          +{formatMoney(overshoot, baseCurrency, 0)} сверх плана
        </div>
      )}

      <div className="text-xs text-slate-500 dark:text-slate-400 min-h-[1rem]">
        {etaText(eta, goal.target_date)}
      </div>

      {!goal.is_archived && !isDone && (
        <div className="mt-4">
          <PrimaryButton onClick={onContribute}>+ Пополнить</PrimaryButton>
        </div>
      )}
      {!goal.is_archived && isDone && (
        <div className="mt-4">
          <button
            onClick={onArchive}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/60 transition-colors"
          >
            Архивировать
          </button>
        </div>
      )}
    </section>
  )
}

function etaText(
  eta: ReturnType<typeof goalEta>,
  targetDate: string | null,
): string {
  if (eta.reason === 'done') return '🎉 Цель достигнута'
  if (eta.reason === 'no-contributions') {
    return 'Оценка появится после первого пополнения'
  }
  if (eta.reason === 'too-slow' || !eta.etaDate) {
    return 'Темп слишком медленный, чтобы оценить дату'
  }
  const base = `при текущем темпе — к ${formatDateRu(eta.etaDate.toISOString().slice(0, 10))}`
  if (eta.behindTarget && targetDate) {
    return `${base} ⚠ позже плана (${formatDateRu(targetDate)})`
  }
  return base
}

function formatDateRu(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function MenuItem({
  onClick,
  children,
  danger,
}: {
  onClick: () => void
  children: React.ReactNode
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 text-sm transition-colors ${
        danger
          ? 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
      }`}
    >
      {children}
    </button>
  )
}
