import { useMemo, useState } from 'react'
import { useApp } from '../contexts/useApp'
import { useDebts } from '../hooks/useDebts'
import { useTransfers } from '../hooks/useTransfers'
import { useAccounts } from '../hooks/useAccounts'
import { useOperations } from '../hooks/useOperations'
import { useFxRates } from '../hooks/useFxRates'
import { SettleDebtDialog } from '../components/SettleDebtDialog'
import { expensesByAuthorInRange } from '../lib/debts'
import { monthRange } from '../lib/aggregate'
import { formatMoney } from '../lib/format'

export function Debts() {
  const { household, members } = useApp()
  const baseCurrency = household?.base_currency ?? 'ILS'
  const { summary, balances, loading } = useDebts()
  const { transfers, remove: removeTransfer } = useTransfers()
  const { accounts } = useAccounts()
  const { operations } = useOperations('all')
  const { ratesByDate } = useFxRates()
  const [settleOpen, setSettleOpen] = useState(false)

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const memberById = useMemo(
    () => new Map(members.map((m) => [m.profile_id, m.display_name ?? 'Партнёр'])),
    [members],
  )

  const settlements = useMemo(
    () => transfers.filter((t) => t.is_debt_settlement),
    [transfers],
  )

  // Общие траты этого месяца по автору — для секции «откуда долг».
  const currentMonth = useMemo(() => monthRange(), [])
  const byAuthorThisMonth = useMemo(
    () => expensesByAuthorInRange(operations, accountById, baseCurrency, ratesByDate, currentMonth),
    [operations, accountById, baseCurrency, ratesByDate, currentMonth],
  )

  if (!household) return null

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Долги между супругами</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Общие траты делим поровну. Settlement-перевод между личными счетами обнуляет долг.
        </p>
      </header>

      {members.length < 2 && (
        <section className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center">
          <div className="text-4xl mb-2">👥</div>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Чтобы считать долги, нужны оба супруга. Пригласите партнёра на главном экране.
          </p>
        </section>
      )}

      {members.length === 2 && (
        <>
          <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-5">
            {loading ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Считаем…</p>
            ) : !summary ? (
              <div className="text-base text-slate-700 dark:text-slate-300">
                🤝 У вас всё ровно — никто никому не должен.
              </div>
            ) : (
              <div>
                <div className="text-base text-slate-700 dark:text-slate-300 mb-3">
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {summary.fromName}
                  </span>{' '}
                  должен(должна){' '}
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {summary.toName}
                  </span>
                </div>
                <div className="text-3xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums mb-4">
                  {formatMoney(summary.amount, baseCurrency, 0)}
                </div>
                <button
                  onClick={() => setSettleOpen(true)}
                  className="text-sm px-4 py-2 rounded-md bg-indigo-500 hover:bg-indigo-600 text-white transition-colors"
                >
                  Погасить долг
                </button>
              </div>
            )}
            {balances.missingRate && (
              <div className="text-xs text-amber-600 dark:text-amber-400 mt-3">
                {balances.missingCount} операций не учтено — нет курса на дату.
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-5">
            <h2 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">
              Общие траты этого месяца
            </h2>
            {byAuthorThisMonth.byProfileId.size === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                В этом месяце пока никаких общих трат.
              </p>
            ) : (
              <ul className="space-y-2">
                {members.map((m) => {
                  const spent = byAuthorThisMonth.byProfileId.get(m.profile_id) ?? 0
                  return (
                    <li
                      key={m.profile_id}
                      className="flex items-center justify-between py-1"
                    >
                      <span className="text-sm text-slate-700 dark:text-slate-300">
                        {memberById.get(m.profile_id) ?? 'Партнёр'}
                      </span>
                      <span className="text-sm font-medium tabular-nums text-slate-900 dark:text-slate-100">
                        {formatMoney(spent, baseCurrency, 0)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
            {byAuthorThisMonth.missingCount > 0 && (
              <div className="text-xs text-amber-600 dark:text-amber-400 mt-3">
                {byAuthorThisMonth.missingCount} операций не учтено — нет курса.
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-5">
            <h2 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">
              История погашений
            </h2>
            {settlements.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Пока ни одного погашения долга.
              </p>
            ) : (
              <ul className="divide-y divide-slate-200 dark:divide-slate-700 -my-2">
                {settlements.map((s) => {
                  const fromAcc = accountById.get(s.from_account_id)
                  const toAcc = accountById.get(s.to_account_id)
                  const fromName = fromAcc ? memberById.get(fromAcc.owner_profile_id) ?? '?' : '?'
                  const toName = toAcc ? memberById.get(toAcc.owner_profile_id) ?? '?' : '?'
                  return (
                    <li key={s.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm text-slate-900 dark:text-slate-100">
                          {fromName} → {toName}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {formatDateRu(s.occurred_at)}
                          {s.note && ` · ${s.note}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          {fromAcc
                            ? formatMoney(s.amount, fromAcc.currency, 0)
                            : formatMoney(s.amount, baseCurrency, 0)}
                        </div>
                        <button
                          onClick={async () => {
                            if (confirm(`Удалить погашение ${fromName} → ${toName}? Это откатит две связанные операции и долг пересчитается.`)) {
                              await removeTransfer(s.id)
                            }
                          }}
                          className="text-xs text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
                          title="Удалить погашение"
                        >
                          ✕
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </>
      )}

      {summary && (
        <SettleDebtDialog
          open={settleOpen}
          onClose={() => setSettleOpen(false)}
          summary={summary}
          baseCurrency={baseCurrency}
        />
      )}
    </div>
  )
}

function formatDateRu(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
