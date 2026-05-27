import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/useApp'
import { useAccounts } from '../hooks/useAccounts'
import { useCategories } from '../hooks/useCategories'
import { useOperations } from '../hooks/useOperations'
import { useSchedules, describeCadence } from '../hooks/useSchedules'
import { useFxRates } from '../hooks/useFxRates'
import { ErrorBox, PrimaryButton, SecondaryButton } from '../components/AuthControls'
import { formatDate, formatMoney } from '../lib/format'
import { convertMoney } from '../lib/fx'

export function Dashboard() {
  const { household, viewMode, profile, members } = useApp()
  const { accounts: allAccounts } = useAccounts()
  const { operations: allOperations, loading } = useOperations('all')
  const { ratesByDate } = useFxRates()
  const baseCurrency = household?.base_currency ?? 'ILS'

  // viewMode-фильтрация:
  //   personal — только мои personal-счета и мои операции на них;
  //   household — только shared-счета и все видимые операции на них.
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

  // Общий баланс в base_currency: каждый счёт конвертим по последнему курсу.
  // Если курса нет — пропускаем счёт и подсвечиваем это флагом.
  const { totalBalance, missingRate } = useMemo(() => {
    let sum = 0
    let missing = false
    for (const a of accounts) {
      const raw = balanceByAccount.get(a.id) ?? 0
      if (a.currency === baseCurrency) {
        sum += raw
        continue
      }
      const conv = convertMoney(raw, a.currency, baseCurrency, ratesByDate)
      if (conv === null) {
        missing = true
        continue
      }
      sum += conv
    }
    return { totalBalance: sum, missingRate: missing }
  }, [accounts, balanceByAccount, baseCurrency, ratesByDate])

  // Месячные итоги — конвертим каждую операцию в base_currency на её дату.
  const monthTotals = useMemo(() => {
    const accountById = new Map(accounts.map((a) => [a.id, a]))
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
    let income = 0
    let expense = 0
    for (const op of operations) {
      if (op.occurred_at < monthStart) continue
      if (op.transfer_id !== null) continue // переводы не дают ни дохода, ни расхода
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
  }, [operations, accounts, baseCurrency, ratesByDate])

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
        <BigStat
          label="Общий баланс"
          value={formatMoney(totalBalance, baseCurrency)}
          sub={missingRate ? 'Некоторые счета не учтены — нет курса' : undefined}
        />
        <BigStat
          label="Этот месяц"
          value={formatMoney(monthTotals.net, baseCurrency)}
          sub={`+${formatMoney(monthTotals.income, baseCurrency)} − ${formatMoney(monthTotals.expense, baseCurrency)}`}
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

      <UpcomingSchedules />

      {isOwner && !partnerJoined && <InviteSection />}
    </div>
  )
}

function UpcomingSchedules() {
  const { viewMode, profile } = useApp()
  const { schedules } = useSchedules()
  const { accounts } = useAccounts()
  const { categories } = useCategories()

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])

  const upcoming = useMemo(() => {
    const today = new Date()
    const horizon = new Date()
    horizon.setDate(horizon.getDate() + 7)
    const horizonIso = horizon.toISOString().slice(0, 10)
    const todayIso = today.toISOString().slice(0, 10)
    return schedules
      .filter((s) => s.is_active && s.next_run_at <= horizonIso && s.next_run_at >= todayIso)
      .filter((s) => {
        // Уважаем viewMode так же, как делает Operations/Dashboard.
        const a = accountById.get(s.account_id)
        if (!a) return false
        if (viewMode === 'personal') {
          return a.visibility === 'personal' && a.owner_profile_id === profile?.id
        }
        return a.visibility === 'shared'
      })
      .sort((a, b) => a.next_run_at.localeCompare(b.next_run_at))
  }, [schedules, accountById, viewMode, profile?.id])

  if (upcoming.length === 0) return null

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-5">
      <h2 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Ближайшие 7 дней</h2>
      <ul className="divide-y divide-slate-200 dark:divide-slate-700 -my-2">
        {upcoming.map((s) => {
          const account = accountById.get(s.account_id)
          const category = s.category_id ? categoryById.get(s.category_id) : null
          return (
            <li key={s.id} className="py-3 flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-sm">
                {category?.icon ?? (s.kind === 'expense' ? '💸' : '💰')}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                  {category?.name ?? (s.kind === 'expense' ? 'Расход' : 'Доход')}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {formatDate(s.next_run_at)} · {describeCadence(s.cadence_rule)}
                  {account ? ` · ${account.name}` : ''}
                </div>
              </div>
              <div
                className={`text-sm font-semibold whitespace-nowrap ${
                  s.kind === 'expense'
                    ? 'text-slate-900 dark:text-slate-100'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {s.kind === 'expense' ? '−' : '+'}
                {formatMoney(Number(s.amount), account?.currency ?? 'ILS').replace('−', '')}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
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
