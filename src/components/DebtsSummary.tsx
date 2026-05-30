import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useDebts } from '../hooks/useDebts'
import { SettleDebtDialog } from './SettleDebtDialog'
import { formatMoney } from '../lib/format'

interface Props {
  baseCurrency: string
}

// Виджет долгов на Dashboard. Не рендерится, если в household один человек
// (партнёр не принял invite). Если долгов нет — мягкая плашка «всё ровно».
export function DebtsSummary({ baseCurrency }: Props) {
  const { summary, balances, members, loading } = useDebts()
  const [settleOpen, setSettleOpen] = useState(false)

  if (loading) return null
  if (members.length < 2) return null

  if (!summary) {
    return (
      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-5">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-slate-100">🤝 Долги</h2>
            <div className="text-sm text-slate-600 dark:text-slate-300 mt-1">
              У вас всё ровно — никто никому не должен.
            </div>
          </div>
          <Link
            to="/debts"
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline shrink-0"
          >
            История ›
          </Link>
        </div>
        {balances.missingRate && (
          <div className="text-xs text-amber-600 dark:text-amber-400 mt-2">
            {balances.missingCount} операций не учтено — нет курса
          </div>
        )}
      </section>
    )
  }

  return (
    <>
      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-5">
        <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-slate-100">🤝 Долги</h2>
            <div className="text-base text-slate-900 dark:text-slate-100 mt-1">
              <span className="font-medium">{summary.fromName}</span>{' '}
              {endsWithA(summary.fromName) ? 'должна' : 'должен'}{' '}
              <span className="font-medium">{summary.toName}</span>:{' '}
              <span className="font-semibold tabular-nums">
                {formatMoney(summary.amount, baseCurrency, 0)}
              </span>
            </div>
          </div>
          <Link
            to="/debts"
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline shrink-0"
          >
            История ›
          </Link>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setSettleOpen(true)}
            className="text-sm px-3 py-1.5 rounded-md bg-indigo-500 hover:bg-indigo-600 text-white transition-colors"
          >
            Погасить →
          </button>
        </div>
        {balances.missingRate && (
          <div className="text-xs text-amber-600 dark:text-amber-400 mt-2">
            {balances.missingCount} операций не учтено — нет курса
          </div>
        )}
      </section>

      <SettleDebtDialog
        open={settleOpen}
        onClose={() => setSettleOpen(false)}
        summary={summary}
        baseCurrency={baseCurrency}
      />
    </>
  )
}

// Простая эвристика для русского глагола: если имя оканчивается на «а»/«я»,
// — женский род. Без i18n-библиотеки, без LLM. Дальше можно усложнить,
// но MVP-достаточно.
function endsWithA(name: string): boolean {
  const last = name.trim().slice(-1).toLowerCase()
  return last === 'а' || last === 'я'
}
