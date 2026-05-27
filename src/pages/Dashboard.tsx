import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/useApp'
import { useAccounts } from '../hooks/useAccounts'
import { useOperations } from '../hooks/useOperations'
import { ErrorBox, PrimaryButton, SecondaryButton } from '../components/AuthControls'
import { formatMoney } from '../lib/format'

export function Dashboard() {
  const { household, viewMode, profile, members } = useApp()
  const { accounts } = useAccounts()
  const { operations, loading } = useOperations('all')

  // Балансы по счёту: initial_balance + sum(income) - sum(expense).
  const balanceByAccount = useMemo(() => {
    const map = new Map<string, number>()
    for (const a of accounts) {
      map.set(a.id, Number(a.initial_balance))
    }
    for (const op of operations) {
      const delta = op.kind === 'expense' ? -Number(op.amount) : Number(op.amount)
      map.set(op.account_id, (map.get(op.account_id) ?? 0) + delta)
    }
    return map
  }, [accounts, operations])

  // Сумма по всем видимым счетам (для пары в одной валюте ILS — просто сумма;
  // мультивалюта будет в Фазе 2.10 с конвертацией в base_currency).
  const totalBalance = useMemo(() => {
    let sum = 0
    for (const a of accounts) {
      sum += balanceByAccount.get(a.id) ?? 0
    }
    return sum
  }, [accounts, balanceByAccount])

  // Этот месяц: доход − расход среди уже загруженных операций.
  const monthTotals = useMemo(() => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
    let income = 0
    let expense = 0
    for (const op of operations) {
      if (op.occurred_at < monthStart) continue
      if (op.kind === 'income') income += Number(op.amount)
      else expense += Number(op.amount)
    }
    return { income, expense, net: income - expense }
  }, [operations])

  if (!household) return null

  const isOwner = household.owner_id === profile?.id
  const partnerJoined = members.some((m) => m.role === 'partner')

  return (
    <div className="space-y-6">
      <header>
        <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {viewMode === 'personal' ? '🧍 Личный кабинет' : '🏠 Семейный кабинет'}
        </div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mt-1">
          {viewMode === 'personal' ? (profile?.display_name ?? 'Я') : household.name}
        </h1>
      </header>

      <section className="grid sm:grid-cols-2 gap-4">
        <BigStat label="Общий баланс" value={formatMoney(totalBalance)} />
        <BigStat
          label="Этот месяц"
          value={formatMoney(monthTotals.net)}
          sub={`+${formatMoney(monthTotals.income).replace(/[^\d.,]/g, '')} − ${formatMoney(monthTotals.expense).replace(/[^\d.,]/g, '')} ₪`}
          positive={monthTotals.net >= 0}
          negative={monthTotals.net < 0}
        />
      </section>

      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-5">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Счета</h2>
        {loading && <p className="text-sm text-slate-500">Загрузка…</p>}
        {!loading && accounts.length === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Пока ни одного счёта.{' '}
            <a href="/settings" className="text-indigo-600 dark:text-indigo-400 hover:underline">
              Добавить
            </a>
            .
          </p>
        )}
        <ul className="divide-y divide-slate-200 dark:divide-slate-700 -my-2">
          {accounts.map((a) => (
            <li key={a.id} className="py-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <span>{a.visibility === 'shared' ? '🏠' : '🧍'}</span>
                  <span>{a.name}</span>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {a.visibility === 'shared' ? 'Семейный' : 'Личный'}
                </div>
              </div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                {formatMoney(balanceByAccount.get(a.id) ?? 0, a.currency)}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {isOwner && !partnerJoined && <InviteSection />}
    </div>
  )
}

function BigStat({
  label,
  value,
  sub,
  positive,
  negative,
}: {
  label: string
  value: string
  sub?: string
  positive?: boolean
  negative?: boolean
}) {
  const valueColor = positive
    ? 'text-emerald-600 dark:text-emerald-400'
    : negative
      ? 'text-rose-600 dark:text-rose-400'
      : 'text-slate-900 dark:text-slate-100'
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-5">
      <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${valueColor}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{sub}</div>}
    </div>
  )
}

function InviteSection() {
  const { household, refresh } = useApp()
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  async function createInvite() {
    setInviteError(null)
    setBusy(true)
    const { data, error } = await supabase
      .from('household_invites')
      .insert({ household_id: household!.id })
      .select('token')
      .single()
    setBusy(false)
    if (error || !data) {
      setInviteError(error?.message ?? 'Не удалось создать приглашение')
      return
    }
    setInviteUrl(`${window.location.origin}/invite/${data.token}`)
    await refresh()
  }

  async function copy() {
    if (!inviteUrl) return
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <section className="rounded-2xl border border-dashed border-indigo-300 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/20 p-5">
      <h2 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Пригласить партнёра</h2>
      <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
        Сгенерируйте ссылку и пришлите ей/ему любым удобным способом.
      </p>
      {!inviteUrl ? (
        <PrimaryButton onClick={createInvite} disabled={busy}>
          {busy ? 'Создаём…' : 'Сгенерировать приглашение'}
        </PrimaryButton>
      ) : (
        <div className="space-y-2">
          <div className="font-mono text-xs px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 break-all">
            {inviteUrl}
          </div>
          <div className="flex gap-2">
            <PrimaryButton onClick={copy}>{copied ? 'Скопировано ✓' : 'Скопировать'}</PrimaryButton>
            <SecondaryButton onClick={() => setInviteUrl(null)}>Новую</SecondaryButton>
          </div>
        </div>
      )}
      {inviteError && (
        <div className="mt-3">
          <ErrorBox>{inviteError}</ErrorBox>
        </div>
      )}
    </section>
  )
}
