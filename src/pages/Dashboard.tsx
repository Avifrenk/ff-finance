import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/useApp'
import { useAccounts } from '../hooks/useAccounts'
import { useCategories } from '../hooks/useCategories'
import { useOperations } from '../hooks/useOperations'
import { useSchedules } from '../hooks/useSchedules'
import { useFxRates } from '../hooks/useFxRates'
import { monthKey, useBudgets } from '../hooks/useBudgets'
import { ErrorBox, PrimaryButton, SecondaryButton } from '../components/AuthControls'
import { PeriodPicker } from '../components/PeriodPicker'
import { rangeFor, type DashboardPeriod } from '../lib/period'
import { MonthCompareCards } from '../components/MonthCompareCards'
import { CategoryBreakdown } from '../components/CategoryBreakdown'
import { BudgetsProgress } from '../components/BudgetsProgress'
import { PaymentsCalendar } from '../components/PaymentsCalendar'
import { ShoppingBadge } from '../components/ShoppingBadge'
import { SafetyCushion } from '../components/SafetyCushion'
import { CryptoPortfolioWidget } from '../components/CryptoPortfolioWidget'
import { DebtsSummary } from '../components/DebtsSummary'
import { GoalsSummary } from '../components/GoalsSummary'
import { InstallBanner } from '../components/InstallBanner'
import { useGoals } from '../hooks/useGoals'
import { useGoalContributions } from '../hooks/useGoalContributions'
import { formatMoney } from '../lib/format'
import { convertMoney } from '../lib/fx'
import {
  aggregateByCategory,
  collapseTail,
  monthRange,
  monthTotals,
  previousMonthRange,
  last30DaysRange,
  quarterToDateRange,
} from '../lib/aggregate'
import { lastFullMonthKeys, type MonthlyExpense } from '../lib/goals'
import type { Category } from '../hooks/useCategories'

export function Dashboard() {
  const { household, viewMode, profile, members } = useApp()
  const { accounts: allAccounts } = useAccounts()
  const { categories } = useCategories()
  const { operations: allOperations, loading } = useOperations('all')
  const { schedules } = useSchedules()
  const { ratesByDate } = useFxRates()
  const { goals } = useGoals()
  const { contributions } = useGoalContributions()
  const baseCurrency = household?.base_currency ?? 'ILS'

  const [period, setPeriod] = useState<DashboardPeriod>('month')
  const currentRange = useMemo(() => rangeFor(period), [period])
  // Для сравнения: к каждому периоду подбираем «предыдущий» аналогичной длины.
  const compareRange = useMemo(() => previousRangeFor(period), [period])

  // viewMode-фильтрация: личный кабинет = свои personal-счета и свои операции;
  // семейный = shared-счета и все видимые операции.
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

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const fullAccountById = useMemo(
    () => new Map(allAccounts.map((a) => [a.id, a])),
    [allAccounts],
  )
  const categoryById = useMemo<Map<string, Category>>(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  )

  // Балансы по счёту (всё время, не зависит от period).
  const balanceByAccount = useMemo(() => {
    const allOpsByAccount = allOperations.filter((o) => accountById.has(o.account_id))
    const map = new Map<string, number>()
    for (const a of accounts) map.set(a.id, Number(a.initial_balance))
    for (const op of allOpsByAccount) {
      const delta = op.kind === 'expense' ? -Number(op.amount) : Number(op.amount)
      map.set(op.account_id, (map.get(op.account_id) ?? 0) + delta)
    }
    return map
  }, [accounts, allOperations, accountById])

  // Общий баланс в base_currency (всё время).
  const { totalBalance, missingRate: missingBalanceRate } = useMemo(() => {
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

  // Итоги текущего и прошлого периода.
  const currentTotals = useMemo(
    () => monthTotals(operations, accountById, baseCurrency, ratesByDate, currentRange),
    [operations, accountById, baseCurrency, ratesByDate, currentRange],
  )
  const previousTotals = useMemo(
    () => monthTotals(operations, accountById, baseCurrency, ratesByDate, compareRange),
    [operations, accountById, baseCurrency, ratesByDate, compareRange],
  )
  const previousHasData =
    previousTotals.income > 0 || previousTotals.expense > 0 || hasAnyOpInRange(operations, compareRange)

  // Разбивка расходов и доходов по категориям за текущий период.
  const expenseAgg = useMemo(
    () =>
      aggregateByCategory(
        operations,
        accountById,
        categoryById,
        baseCurrency,
        ratesByDate,
        'expense',
        currentRange,
      ),
    [operations, accountById, categoryById, baseCurrency, ratesByDate, currentRange],
  )
  const expenseItems = useMemo(() => collapseTail(expenseAgg.items, 8), [expenseAgg.items])

  const incomeAgg = useMemo(
    () =>
      aggregateByCategory(
        operations,
        accountById,
        categoryById,
        baseCurrency,
        ratesByDate,
        'income',
        currentRange,
      ),
    [operations, accountById, categoryById, baseCurrency, ratesByDate, currentRange],
  )

  // Бюджеты текущего месяца (всегда календарный — переключатель period
  // меняет только totals/pie, не бюджеты, иначе сравнивать с потолком
  // нечестно). Если выбран prev-month — бюджеты тоже за тот месяц.
  const budgetsMonthKey = useMemo(() => {
    if (period === 'prev-month') {
      const d = new Date()
      d.setMonth(d.getMonth() - 1)
      return monthKey(d)
    }
    return monthKey(new Date())
  }, [period])
  const { budgets } = useBudgets(budgetsMonthKey)
  const budgetByCategory = useMemo(() => {
    const map = new Map<string, number>()
    for (const b of budgets) map.set(b.category_id, Number(b.amount))
    return map
  }, [budgets])

  // Бюджет считается против расходов за тот же месяц (а не за period-выборку),
  // чтобы «прогресс месяца» был честным даже при выборе «30 дней» / «квартал».
  const budgetMonthRange = useMemo(() => {
    if (period === 'prev-month') {
      return previousMonthRange()
    }
    return monthRange()
  }, [period])
  const spentForBudgets = useMemo(
    () =>
      aggregateByCategory(
        operations,
        accountById,
        categoryById,
        baseCurrency,
        ratesByDate,
        'expense',
        budgetMonthRange,
      ),
    [operations, accountById, categoryById, baseCurrency, ratesByDate, budgetMonthRange],
  )

  // Подушка: если в семье есть хотя бы одна essential-категория, считаем
  // расход только по ним (точнее: «жизнь без дохода» = обязательные траты).
  // Иначе fallback на все расходы (старое поведение).
  const essentialIds = useMemo(() => {
    const set = new Set<string>()
    for (const c of categories) {
      if (c.kind === 'expense' && c.is_essential) set.add(c.id)
    }
    return set
  }, [categories])
  const essentialMode = essentialIds.size > 0

  // Последние 3 полных месяца → расходы за каждый, в base_currency.
  // Подушка считается по этим трём, текущий неполный месяц не учитывается.
  const monthlyExpenses = useMemo<MonthlyExpense[]>(() => {
    const keys = lastFullMonthKeys(3)
    const filter = essentialMode ? essentialIds : undefined
    return keys.map((yyyymm) => {
      const [y, m] = yyyymm.split('-').map(Number)
      const range = monthRange(new Date(y, m - 1, 15))
      const totals = monthTotals(operations, accountById, baseCurrency, ratesByDate, range, filter)
      return { yyyymm, expense: totals.expense }
    })
  }, [operations, accountById, baseCurrency, ratesByDate, essentialMode, essentialIds])

  // Расписания: тот же viewMode-фильтр (личное — только мои на моих personal).
  const visibleSchedules = useMemo(() => {
    return schedules.filter((s) => {
      const a = fullAccountById.get(s.account_id)
      if (!a) return false
      if (viewMode === 'personal') {
        return a.visibility === 'personal' && a.owner_profile_id === profile?.id
      }
      return a.visibility === 'shared'
    })
  }, [schedules, fullAccountById, viewMode, profile?.id])

  if (!household) return null

  const isOwner = household.owner_id === profile?.id
  const partnerJoined = members.some((m) => m.role === 'partner')

  return (
    <div className="space-y-6">
      <InstallBanner />

      <header>
        <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {viewMode === 'personal' ? '🧍 Личный кабинет' : '🏠 Семейный кабинет'}
        </div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mt-1">
          {viewMode === 'personal' ? (profile?.display_name ?? 'Я') : household.name}
        </h1>
      </header>

      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-5">
        <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Общий баланс
        </div>
        <div className="text-3xl font-semibold mt-1 text-slate-900 dark:text-slate-100">
          {formatMoney(totalBalance, baseCurrency)}
        </div>
        {missingBalanceRate && (
          <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">
            Некоторые счета не учтены — нет курса
          </div>
        )}
      </section>

      <SafetyCushion
        monthlyExpenses={monthlyExpenses}
        totalBalance={totalBalance}
        baseCurrency={baseCurrency}
        essentialMode={essentialMode}
      />

      <CryptoPortfolioWidget baseCurrency={baseCurrency} />

      <DebtsSummary baseCurrency={baseCurrency} />

      <div className="flex items-center gap-3">
        <PeriodPicker value={period} onChange={setPeriod} />
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {humanRange(currentRange.from, currentRange.to)}
        </div>
      </div>

      <MonthCompareCards
        current={currentTotals}
        previous={previousTotals}
        previousHasData={previousHasData}
        baseCurrency={baseCurrency}
      />

      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-5">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">
          Расходы по категориям
        </h2>
        <CategoryBreakdown
          items={expenseItems}
          total={expenseAgg.total}
          baseCurrency={baseCurrency}
          emptyHint="За этот период расходов нет."
        />
        {expenseAgg.missingRate && (
          <div className="text-xs text-amber-600 dark:text-amber-400 mt-3">
            Некоторые операции не учтены — нет курса
          </div>
        )}
      </section>

      {incomeAgg.items.length > 0 && (
        <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-5">
          <h2 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Доходы</h2>
          <CategoryBreakdown
            items={incomeAgg.items}
            total={incomeAgg.total}
            baseCurrency={baseCurrency}
            emptyHint="За этот период доходов нет."
          />
        </section>
      )}

      <BudgetsProgress
        budgetByCategory={budgetByCategory}
        spentItems={spentForBudgets.items}
        categoryById={categoryById}
        baseCurrency={baseCurrency}
      />

      <GoalsSummary
        goals={goals}
        contributions={contributions}
        baseCurrency={baseCurrency}
      />

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

      <PaymentsCalendar
        schedules={visibleSchedules}
        accountById={fullAccountById}
        categoryById={categoryById}
      />

      <ShoppingBadge />

      {isOwner && !partnerJoined && <InviteSection />}
    </div>
  )
}

/** Предыдущий период такой же длины, как currentRange. */
function previousRangeFor(period: DashboardPeriod) {
  if (period === 'month') return previousMonthRange()
  if (period === 'prev-month') {
    // «Прошлый» относительно prev-month → позапрошлый.
    const ref = new Date()
    ref.setMonth(ref.getMonth() - 1)
    return previousMonthRange(ref)
  }
  if (period === '30days') {
    // 30 дней до 30-дневного окна.
    const past = new Date()
    past.setDate(past.getDate() - 30)
    return last30DaysRange(past)
  }
  // quarter → предыдущий полный квартал относительно того, в котором начался текущий.
  const now = new Date()
  const qStartMonth = Math.floor(now.getMonth() / 3) * 3
  const lastDayOfPrevQuarter = new Date(now.getFullYear(), qStartMonth, 0)
  return quarterToDateRange(lastDayOfPrevQuarter)
}

function humanRange(fromIso: string, toIso: string): string {
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
  }
  return `${fmt(fromIso)} – ${fmt(toIso)}`
}

function hasAnyOpInRange(
  ops: { occurred_at: string; transfer_id: string | null }[],
  range: { from: string; to: string },
): boolean {
  for (const o of ops) {
    if (o.transfer_id !== null) continue
    if (o.occurred_at >= range.from && o.occurred_at <= range.to) return true
  }
  return false
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
    setInviteUrl(`${window.location.origin}${import.meta.env.BASE_URL}invite/${data.token}`)
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
