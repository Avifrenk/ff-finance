import { useMemo, useState } from 'react'
import { useApp } from '../contexts/useApp'
import { useAccounts } from '../hooks/useAccounts'
import { useCategories } from '../hooks/useCategories'
import { useOperations, type Operation, type PeriodFilter } from '../hooks/useOperations'
import { ErrorBox } from '../components/AuthControls'
import { formatDate, formatMoney } from '../lib/format'

const PERIOD_LABELS: Record<PeriodFilter, string> = {
  month: 'Этот месяц',
  'prev-month': 'Прошлый месяц',
  week: '7 дней',
  all: 'Всё',
}

export function Operations() {
  const { viewMode, household, profile, members } = useApp()
  const [period, setPeriod] = useState<PeriodFilter>('month')
  const { operations: allOperations, loading, error, remove } = useOperations(period)
  const { accounts: allAccounts } = useAccounts()
  const { categories } = useCategories()

  // Та же viewMode-логика что в Dashboard.
  const accounts = useMemo(() => {
    if (viewMode === 'personal') {
      return allAccounts.filter(
        (a) => a.visibility === 'personal' && a.owner_profile_id === profile?.id,
      )
    }
    return allAccounts.filter((a) => a.visibility === 'shared')
  }, [allAccounts, viewMode, profile?.id])

  const operations = useMemo(() => {
    const accountIds = new Set(accounts.map((a) => a.id))
    const base = allOperations.filter((o) => accountIds.has(o.account_id))
    if (viewMode === 'personal') {
      return base.filter((o) => o.author_profile_id === profile?.id)
    }
    return base
  }, [allOperations, accounts, viewMode, profile?.id])

  const accountById = useMemo(() => new Map(allAccounts.map((a) => [a.id, a])), [allAccounts])
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const memberById = useMemo(() => new Map(members.map((m) => [m.profile_id, m])), [members])

  const totals = useMemo(() => {
    const income = operations
      .filter((o) => o.kind === 'income')
      .reduce((sum, o) => sum + Number(o.amount), 0)
    const expense = operations
      .filter((o) => o.kind === 'expense')
      .reduce((sum, o) => sum + Number(o.amount), 0)
    return { income, expense, net: income - expense }
  }, [operations])

  async function handleDelete(op: Operation) {
    if (!window.confirm('Удалить эту операцию?')) return
    await remove(op.id)
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {viewMode === 'personal' ? '🧍 Личные операции' : '🏠 Семейные операции'}
        </div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          {viewMode === 'personal' ? (profile?.display_name ?? 'Я') : household?.name}
        </h1>
      </div>

      <PeriodTabs value={period} onChange={setPeriod} />

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Доход" value={formatMoney(totals.income)} positive />
        <Stat label="Расход" value={formatMoney(totals.expense)} negative />
        <Stat label="Итог" value={formatMoney(totals.net)} positive={totals.net >= 0} negative={totals.net < 0} />
      </div>

      {loading && <p className="text-sm text-slate-500">Загрузка…</p>}
      {error && <ErrorBox>{error}</ErrorBox>}
      {!loading && operations.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
          За {PERIOD_LABELS[period].toLowerCase()} операций нет. Жми «+» внизу справа, чтобы добавить первую.
        </div>
      )}

      <ul className="space-y-1">
        {operations.map((op) => {
          const account = accountById.get(op.account_id)
          const category = op.category_id ? categoryById.get(op.category_id) : null
          const author = memberById.get(op.author_profile_id)
          const isMine = op.author_profile_id === profile?.id
          return (
            <li
              key={op.id}
              className="flex items-center gap-3 py-3 px-3 rounded-lg hover:bg-slate-100/60 dark:hover:bg-slate-800/40 transition-colors group"
            >
              <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-lg">
                {category?.icon ?? (op.kind === 'expense' ? '💸' : '💰')}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                    {category?.name ?? (op.kind === 'expense' ? 'Расход' : 'Доход')}
                  </div>
                  {op.is_private && <span title="Приватная" className="text-xs">🔒</span>}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {formatDate(op.occurred_at)} ·{' '}
                  {account ? (account.visibility === 'shared' ? '🏠 ' : '🧍 ') + account.name : '—'}
                  {op.note ? ` · ${op.note}` : ''}
                  {!isMine && author?.display_name ? ` · ${author.display_name}` : ''}
                </div>
              </div>
              <div
                className={`text-sm font-semibold whitespace-nowrap ${
                  op.kind === 'expense'
                    ? 'text-slate-900 dark:text-slate-100'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {op.kind === 'expense' ? '−' : '+'}
                {formatMoney(Number(op.amount), account?.currency ?? 'ILS').replace('−', '')}
              </div>
              {isMine && (
                <button
                  onClick={() => handleDelete(op)}
                  className="text-xs text-rose-500 hover:text-rose-700 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Удалить"
                >
                  ✕
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function PeriodTabs({ value, onChange }: { value: PeriodFilter; onChange: (p: PeriodFilter) => void }) {
  const tabs: PeriodFilter[] = ['month', 'prev-month', 'week', 'all']
  return (
    <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-100/60 dark:bg-slate-800/60">
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`px-3 py-1 text-xs rounded-md transition-colors ${
            value === t
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          {PERIOD_LABELS[t]}
        </button>
      ))}
    </div>
  )
}

function Stat({
  label,
  value,
  positive,
  negative,
}: {
  label: string
  value: string
  positive?: boolean
  negative?: boolean
}) {
  const color = positive
    ? 'text-emerald-600 dark:text-emerald-400'
    : negative
      ? 'text-rose-600 dark:text-rose-400'
      : 'text-slate-900 dark:text-slate-100'
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-3">
      <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`text-base font-semibold mt-1 ${color}`}>{value}</div>
    </div>
  )
}
