import { useMemo, useState } from 'react'
import { useApp } from '../contexts/useApp'
import { useAccounts } from '../hooks/useAccounts'
import { useCategories } from '../hooks/useCategories'
import { useOperations, type Operation, type PeriodFilter } from '../hooks/useOperations'
import { useTransfers } from '../hooks/useTransfers'
import { useFxRates } from '../hooks/useFxRates'
import { ErrorBox } from '../components/AuthControls'
import { formatDate, formatMoney } from '../lib/format'
import { convertMoney } from '../lib/fx'

const PERIOD_LABELS: Record<PeriodFilter, string> = {
  month: 'Этот месяц',
  'prev-month': 'Прошлый месяц',
  week: '7 дней',
  all: 'Всё',
}

type Row =
  | { kind: 'op'; op: Operation }
  | { kind: 'transfer'; transferId: string; from: Operation; to: Operation }

export function Operations() {
  const { viewMode, household, profile, members } = useApp()
  const [period, setPeriod] = useState<PeriodFilter>('month')
  const { operations: allOperations, loading, error, remove: removeOperation } = useOperations(period)
  const { remove: removeTransfer } = useTransfers()
  const { accounts: allAccounts } = useAccounts()
  const { categories } = useCategories()
  const { ratesByDate } = useFxRates()
  const baseCurrency = household?.base_currency ?? 'ILS'

  // viewMode-фильтрация (см. Dashboard).
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

  // Группируем операции с одинаковым transfer_id в одну строку.
  // Если видна только одна сторона (другой счёт скрыт от текущего viewMode) —
  // всё равно рендерим как «↔ Перевод», с подписью «(сторона скрыта)».
  const rows = useMemo<Row[]>(() => {
    const transferMap = new Map<string, { from?: Operation; to?: Operation }>()
    const result: Row[] = []
    for (const op of operations) {
      if (op.transfer_id) {
        const pair = transferMap.get(op.transfer_id) ?? {}
        if (op.kind === 'expense') pair.from = op
        else pair.to = op
        transferMap.set(op.transfer_id, pair)
      } else {
        result.push({ kind: 'op', op })
      }
    }
    for (const [transferId, pair] of transferMap) {
      // У transfer как минимум одна сторона есть — гарантия попадания сюда.
      // Если другая сторона видима через RLS, но отфильтрована viewMode —
      // достаём её из allOperations.
      const anchor = pair.from ?? pair.to!
      let from = pair.from
      let to = pair.to
      if (!from || !to) {
        const fullPair = allOperations.filter((o) => o.transfer_id === transferId)
        from = from ?? fullPair.find((o) => o.kind === 'expense')
        to = to ?? fullPair.find((o) => o.kind === 'income')
      }
      result.push({
        kind: 'transfer',
        transferId,
        from: from ?? anchor,
        to: to ?? anchor,
      })
    }
    // Сортировка по дате (новые сверху).
    result.sort((a, b) => {
      const dateA = a.kind === 'op' ? a.op.occurred_at : a.from.occurred_at
      const dateB = b.kind === 'op' ? b.op.occurred_at : b.from.occurred_at
      if (dateA !== dateB) return dateB.localeCompare(dateA)
      const createdA = a.kind === 'op' ? a.op.created_at : a.from.created_at
      const createdB = b.kind === 'op' ? b.op.created_at : b.from.created_at
      return createdB.localeCompare(createdA)
    })
    return result
  }, [operations, allOperations])

  // Итоги: переводы не учитываются ни как доход, ни как расход.
  // Конвертим каждую операцию в base_currency на её дату.
  const totals = useMemo(() => {
    let income = 0
    let expense = 0
    for (const op of operations) {
      if (op.transfer_id !== null) continue
      const acc = accountById.get(op.account_id)
      const currency = acc?.currency ?? baseCurrency
      const amount = Number(op.amount)
      const conv =
        currency === baseCurrency
          ? amount
          : convertMoney(amount, currency, baseCurrency, ratesByDate, op.occurred_at)
      if (conv === null) continue
      if (op.kind === 'income') income += conv
      else expense += conv
    }
    return { income, expense, net: income - expense }
  }, [operations, accountById, baseCurrency, ratesByDate])

  async function handleDeleteOp(op: Operation) {
    // Если это половинка перевода — удаляем через transfers (FK каскадит).
    if (op.transfer_id) {
      if (!window.confirm('Это часть перевода. Удалить весь перевод? Обе операции уйдут вместе.')) return
      await removeTransfer(op.transfer_id)
      return
    }
    if (!window.confirm('Удалить эту операцию?')) return
    await removeOperation(op.id)
  }

  async function handleDeleteTransfer(transferId: string) {
    if (!window.confirm('Удалить перевод? Обе связанные операции тоже удалятся.')) return
    await removeTransfer(transferId)
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
        <Stat label="Доход" value={formatMoney(totals.income, baseCurrency)} positive />
        <Stat label="Расход" value={formatMoney(totals.expense, baseCurrency)} negative />
        <Stat
          label="Итог"
          value={formatMoney(totals.net, baseCurrency)}
          positive={totals.net >= 0}
          negative={totals.net < 0}
        />
      </div>

      {loading && <p className="text-sm text-slate-500">Загрузка…</p>}
      {error && <ErrorBox>{error}</ErrorBox>}
      {!loading && rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
          За {PERIOD_LABELS[period].toLowerCase()} операций нет. Жми «+» внизу справа, чтобы добавить первую.
        </div>
      )}

      <ul className="space-y-1">
        {rows.map((row) => {
          if (row.kind === 'transfer') {
            const isMine = row.from.author_profile_id === profile?.id
            const fromAcc = accountById.get(row.from.account_id)
            const toAcc = accountById.get(row.to.account_id)
            return (
              <li
                key={row.transferId}
                className="flex items-center gap-3 py-3 px-3 rounded-lg hover:bg-slate-100/60 dark:hover:bg-slate-800/40 transition-colors group"
              >
                <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-lg">
                  ↔
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                    Перевод
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {formatDate(row.from.occurred_at)} ·{' '}
                    {fromAcc ? fromAcc.name : '—'} → {toAcc ? toAcc.name : '—'}
                    {row.from.note ? ` · ${row.from.note}` : ''}
                  </div>
                </div>
                <div className="text-sm font-semibold whitespace-nowrap text-slate-900 dark:text-slate-100 text-right">
                  {formatMoney(Number(row.from.amount), fromAcc?.currency ?? baseCurrency)}
                  {fromAcc && toAcc && fromAcc.currency !== toAcc.currency && (
                    <div className="text-xs font-normal text-slate-500 dark:text-slate-400">
                      → {formatMoney(Number(row.to.amount), toAcc.currency)}
                    </div>
                  )}
                </div>
                {isMine && (
                  <button
                    onClick={() => handleDeleteTransfer(row.transferId)}
                    className="text-xs text-rose-500 hover:text-rose-700 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Удалить перевод"
                  >
                    ✕
                  </button>
                )}
              </li>
            )
          }

          const op = row.op
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
                {formatMoney(Number(op.amount), account?.currency ?? baseCurrency).replace('−', '')}
              </div>
              {isMine && (
                <button
                  onClick={() => handleDeleteOp(op)}
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
