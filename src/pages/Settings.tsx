import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/useApp'
import { useAccounts, type Account } from '../hooks/useAccounts'
import { useCategories } from '../hooks/useCategories'
import { useSchedules, describeCadence, type Schedule } from '../hooks/useSchedules'
import { useCurrencies, type Currency } from '../hooks/useCurrencies'
import { monthKey, useBudgets } from '../hooks/useBudgets'
import { AuthInput, ErrorBox, PrimaryButton, SecondaryButton } from '../components/AuthControls'
import { currencySymbol, formatDate, formatMoney } from '../lib/format'

export function Settings() {
  const { profile, household, members, viewMode, signOut } = useApp()
  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">⚙️ Настройки</div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mt-1">
          {viewMode === 'personal' ? (profile?.display_name ?? 'Я') : (household?.name ?? '')}
        </h1>
      </div>

      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-5 space-y-2 text-sm">
        <Row label="Имя">{profile?.display_name ?? '—'}</Row>
        <Row label="Локаль">{profile?.locale ?? '—'}</Row>
        <Row label="Семья">{household?.name ?? '—'}</Row>
        <Row label="Участников">{members.length}</Row>
      </section>

      <BaseCurrencySection />

      <AccountsSection />

      <BudgetsSection />

      <SchedulesSection />

      <button
        onClick={() => signOut()}
        className="text-sm text-rose-600 dark:text-rose-400 hover:underline"
      >
        Выйти из аккаунта
      </button>
    </div>
  )
}

function BaseCurrencySection() {
  const { profile, household, refresh } = useApp()
  const { currencies, loading: curLoading } = useCurrencies()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  if (!household) return null
  const isOwner = household.owner_id === profile?.id

  async function change(code: string) {
    if (!household || code === household.base_currency) return
    setError(null)
    setInfo(null)
    setSaving(true)
    const { error: err } = await supabase
      .from('households')
      .update({ base_currency: code })
      .eq('id', household.id)
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setInfo('Сохранено')
    await refresh()
    setTimeout(() => setInfo(null), 1500)
  }

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-5">
      <h2 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Базовая валюта семьи</h2>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
        В этой валюте Dashboard показывает общий баланс и месячные итоги.
        Счета могут быть в любых валютах — пересчёт делается по курсу ECB.
      </p>
      {curLoading ? (
        <p className="text-sm text-slate-500">Загрузка…</p>
      ) : isOwner ? (
        <SelectBox value={household.base_currency} onChange={change}>
          {currencies.map((c) => (
            <option key={c.code} value={c.code}>
              {c.symbol} {c.code} — {c.name}
            </option>
          ))}
        </SelectBox>
      ) : (
        <div className="text-sm text-slate-900 dark:text-slate-100">
          {currencySymbol(household.base_currency)} {household.base_currency}
          <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
            (менять может только владелец семьи)
          </span>
        </div>
      )}
      {saving && <p className="text-xs text-slate-500 mt-2">Сохраняем…</p>}
      {info && <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2">{info}</p>}
      {error && <div className="mt-2"><ErrorBox>{error}</ErrorBox></div>}
    </section>
  )
}

function BudgetsSection() {
  const { household } = useApp()
  const { categories } = useCategories()
  const [month, setMonth] = useState(() => monthKey(new Date()))
  const { budgets, loading, error, upsert, remove, copyFromPreviousMonth } = useBudgets(month)
  const [copyInfo, setCopyInfo] = useState<string | null>(null)
  const [copyErr, setCopyErr] = useState<string | null>(null)

  const baseCurrency = household?.base_currency ?? 'ILS'
  const expenseCategories = useMemo(
    () => categories.filter((c) => c.kind === 'expense'),
    [categories],
  )
  const budgetByCategory = useMemo(() => {
    const map = new Map<string, number>()
    for (const b of budgets) map.set(b.category_id, Number(b.amount))
    return map
  }, [budgets])

  function shiftMonth(delta: number) {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setMonth(monthKey(d))
  }

  async function handleCopy() {
    setCopyErr(null)
    setCopyInfo(null)
    try {
      const n = await copyFromPreviousMonth()
      setCopyInfo(n === 0 ? 'Нечего копировать' : `Скопировано: ${n}`)
      setTimeout(() => setCopyInfo(null), 2000)
    } catch (e) {
      setCopyErr(e instanceof Error ? e.message : 'Ошибка')
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">Бюджеты на месяц</h2>
        <button
          onClick={handleCopy}
          className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
          title="Скопировать значения из прошлого месяца (не трогая уже заданные)"
        >
          Скопировать с прошлого
        </button>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
        Потолок расходов на категорию. Сумма в {currencySymbol(baseCurrency)} {baseCurrency} (валюта
        семьи). Дашборд покажет прогресс и подсветит превышение.
      </p>

      <div className="flex items-center gap-3 mb-3">
        <button
          onClick={() => shiftMonth(-1)}
          className="px-2 py-1 text-sm rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Предыдущий месяц"
        >
          ‹
        </button>
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100 tabular-nums">
          {humanMonth(month)}
        </div>
        <button
          onClick={() => shiftMonth(1)}
          className="px-2 py-1 text-sm rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Следующий месяц"
        >
          ›
        </button>
      </div>

      {copyInfo && <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-2">{copyInfo}</p>}
      {copyErr && <ErrorBox>{copyErr}</ErrorBox>}

      {loading && <p className="text-sm text-slate-500">Загрузка…</p>}
      {error && <ErrorBox>{error}</ErrorBox>}

      {!loading && expenseCategories.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Сначала создайте категории расходов — пока бюджет задавать некуда.
        </p>
      )}

      {expenseCategories.length > 0 && (
        <ul className="divide-y divide-slate-200 dark:divide-slate-700 -my-2">
          {expenseCategories.map((c) => (
            <BudgetRow
              key={c.id}
              icon={c.icon}
              name={c.name}
              currentAmount={budgetByCategory.get(c.id) ?? null}
              baseCurrency={baseCurrency}
              onSave={(amount) => upsert(c.id, amount)}
              onClear={() => remove(c.id)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function BudgetRow({
  icon,
  name,
  currentAmount,
  baseCurrency,
  onSave,
  onClear,
}: {
  icon: string | null
  name: string
  currentAmount: number | null
  baseCurrency: string
  onSave: (amount: number) => Promise<unknown>
  onClear: () => Promise<unknown>
}) {
  const [value, setValue] = useState(currentAmount !== null ? String(currentAmount) : '')
  const [saving, setSaving] = useState(false)
  const [rowError, setRowError] = useState<string | null>(null)

  /* eslint-disable react-hooks/set-state-in-effect --
     Внешний источник истины (currentAmount из props) — перенакатываем
     локальное значение при смене месяца / удалённом upsert. */
  useEffect(() => {
    setValue(currentAmount !== null ? String(currentAmount) : '')
  }, [currentAmount])
  /* eslint-enable react-hooks/set-state-in-effect */

  async function commit() {
    setRowError(null)
    const trimmed = value.trim().replace(',', '.')
    if (trimmed === '') {
      if (currentAmount === null) return // нечего удалять
      setSaving(true)
      try {
        await onClear()
      } catch (e) {
        setRowError(e instanceof Error ? e.message : 'Ошибка')
      } finally {
        setSaving(false)
      }
      return
    }
    const num = Number(trimmed)
    if (!isFinite(num) || num <= 0) {
      setRowError('Положительное число')
      return
    }
    if (num === currentAmount) return // ничего не изменилось
    setSaving(true)
    try {
      await onSave(num)
    } catch (e) {
      setRowError(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setSaving(false)
    }
  }

  return (
    <li className="py-2 flex items-center gap-3">
      <span className="text-base shrink-0 w-6 text-center">{icon ?? '•'}</span>
      <span className="flex-1 min-w-0 truncate text-sm text-slate-900 dark:text-slate-100">
        {name}
      </span>
      <div className="flex items-center gap-1 shrink-0">
        <input
          type="text"
          inputMode="decimal"
          placeholder="0"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          disabled={saving}
          className="w-24 text-right tabular-nums px-2 py-1 text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500"
        />
        <span className="text-xs text-slate-500 dark:text-slate-400 w-4">
          {currencySymbol(baseCurrency)}
        </span>
      </div>
      {rowError && <span className="text-xs text-rose-500 ml-2">{rowError}</span>}
    </li>
  )
}

function humanMonth(monthIso: string): string {
  const [y, m] = monthIso.split('-').map(Number)
  const d = new Date(y, m - 1, 1)
  return d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
}

function SchedulesSection() {
  const { profile } = useApp()
  const { accounts } = useAccounts()
  const { categories } = useCategories()
  const { schedules, loading, error, create, toggle, remove, tickNow } = useSchedules()
  const [adding, setAdding] = useState(false)
  const [tickInfo, setTickInfo] = useState<string | null>(null)
  const [tickErr, setTickErr] = useState<string | null>(null)

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])

  async function handleToggle(s: Schedule) {
    await toggle(s.id, !s.is_active)
  }
  async function handleDelete(s: Schedule) {
    if (!window.confirm('Удалить регулярную операцию? Уже созданные операции останутся.')) return
    await remove(s.id)
  }
  async function handleTickNow() {
    setTickErr(null)
    setTickInfo(null)
    try {
      const n = await tickNow()
      setTickInfo(`Создано операций: ${n}`)
    } catch (e) {
      setTickErr(e instanceof Error ? e.message : 'Ошибка')
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">Регулярные</h2>
        {!adding && (
          <div className="flex items-center gap-3 text-sm">
            <button
              onClick={handleTickNow}
              className="text-slate-500 dark:text-slate-400 hover:underline"
              title="Дёрнуть воркер вручную (обычно раз в день в 00:05 UTC)"
            >
              ⟳ Прокрутить
            </button>
            <button
              onClick={() => setAdding(true)}
              className="text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              + Добавить
            </button>
          </div>
        )}
      </div>

      {tickInfo && <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-2">{tickInfo}</p>}
      {tickErr && <ErrorBox>{tickErr}</ErrorBox>}

      {loading && <p className="text-sm text-slate-500">Загрузка…</p>}
      {error && <ErrorBox>{error}</ErrorBox>}

      {!loading && schedules.length === 0 && !adding && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Нет регулярных операций. Добавьте зарплату, аренду или подписки — каждый день в
          00:05 UTC воркер создаёт настоящие операции по расписанию.
        </p>
      )}

      {schedules.length > 0 && (
        <ul className="divide-y divide-slate-200 dark:divide-slate-700 -my-2">
          {schedules.map((s) => {
            const account = accountById.get(s.account_id)
            const category = s.category_id ? categoryById.get(s.category_id) : null
            const isMine = s.author_profile_id === profile?.id
            return (
              <li key={s.id} className="py-3 flex items-center gap-3">
                <div
                  className={`h-9 w-9 rounded-full flex items-center justify-center text-sm ${
                    s.is_active
                      ? 'bg-indigo-100 dark:bg-indigo-900/40'
                      : 'bg-slate-100 dark:bg-slate-800 opacity-60'
                  }`}
                >
                  {category?.icon ?? (s.kind === 'expense' ? '💸' : '💰')}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                    {category?.name ?? (s.kind === 'expense' ? 'Расход' : 'Доход')}
                    {!s.is_active && <span className="ml-2 text-xs text-slate-400">(выключено)</span>}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {describeCadence(s.cadence_rule)} ·{' '}
                    {account ? (account.visibility === 'shared' ? '🏠 ' : '🧍 ') + account.name : '—'} ·
                    след. {formatDate(s.next_run_at)}
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
                {isMine && (
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      onClick={() => handleToggle(s)}
                      className="text-slate-500 dark:text-slate-400 hover:underline"
                      title={s.is_active ? 'Выключить' : 'Включить'}
                    >
                      {s.is_active ? 'выкл' : 'вкл'}
                    </button>
                    <button
                      onClick={() => handleDelete(s)}
                      className="text-rose-500 hover:underline"
                    >
                      удалить
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {adding && (
        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
          <AddScheduleForm
            onDone={() => setAdding(false)}
            create={create}
            accounts={accounts}
            categories={categories}
          />
        </div>
      )}
    </section>
  )
}

function AddScheduleForm({
  onDone,
  create,
  accounts,
  categories,
}: {
  onDone: () => void
  create: (input: {
    account_id: string
    category_id: string | null
    kind: 'expense' | 'income'
    amount: number
    cadence_rule: string
    next_run_at: string
    note?: string | null
    is_private?: boolean
  }) => Promise<unknown>
  accounts: { id: string; name: string; visibility: 'personal' | 'shared' }[]
  categories: { id: string; name: string; kind: 'expense' | 'income'; icon: string | null }[]
}) {
  const [kind, setKind] = useState<'expense' | 'income'>('expense')
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [categoryId, setCategoryId] = useState('')
  const [cadenceKind, setCadenceKind] = useState<'daily' | 'weekly' | 'monthly'>('monthly')
  const [cadenceArg, setCadenceArg] = useState('1')
  const [nextRunAt, setNextRunAt] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().slice(0, 10)
  })
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const kindCategories = categories.filter((c) => c.kind === kind)
  const cadence_rule = cadenceKind === 'daily' ? 'daily' : `${cadenceKind}:${cadenceArg}`

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const amountNum = Number(amount.replace(',', '.'))
    if (!isFinite(amountNum) || amountNum <= 0) {
      setError('Сумма должна быть положительной')
      return
    }
    if (!accountId) {
      setError('Выберите счёт')
      return
    }
    setBusy(true)
    try {
      await create({
        account_id: accountId,
        category_id: categoryId || null,
        kind,
        amount: amountNum,
        cadence_rule,
        next_run_at: nextRunAt,
        note: note.trim() || null,
      })
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-2 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800">
        <button
          type="button"
          onClick={() => setKind('expense')}
          className={`py-1.5 text-sm font-medium rounded-md ${
            kind === 'expense'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
              : 'text-slate-500'
          }`}
        >
          💸 Расход
        </button>
        <button
          type="button"
          onClick={() => setKind('income')}
          className={`py-1.5 text-sm font-medium rounded-md ${
            kind === 'income'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
              : 'text-slate-500'
          }`}
        >
          💰 Доход
        </button>
      </div>

      <Field label="Сумма">
        <AuthInput
          type="text"
          inputMode="decimal"
          placeholder="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </Field>

      <Field label="Счёт">
        <SelectBox value={accountId} onChange={setAccountId}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.visibility === 'shared' ? '🏠 ' : '🧍 '}
              {a.name}
            </option>
          ))}
        </SelectBox>
      </Field>

      <Field label="Категория">
        <SelectBox value={categoryId} onChange={setCategoryId}>
          <option value="">— без категории —</option>
          {kindCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon ? `${c.icon} ` : ''}
              {c.name}
            </option>
          ))}
        </SelectBox>
      </Field>

      <Field label="Периодичность">
        <div className="flex gap-2">
          <SelectBox value={cadenceKind} onChange={(v) => setCadenceKind(v as 'daily' | 'weekly' | 'monthly')}>
            <option value="monthly">Ежемесячно</option>
            <option value="weekly">Еженедельно</option>
            <option value="daily">Ежедневно</option>
          </SelectBox>
          {cadenceKind === 'monthly' && (
            <SelectBox value={cadenceArg} onChange={setCadenceArg}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n.toString()}>
                  {n}-е число
                </option>
              ))}
            </SelectBox>
          )}
          {cadenceKind === 'weekly' && (
            <SelectBox value={cadenceArg} onChange={setCadenceArg}>
              {[
                ['1', 'понедельник'],
                ['2', 'вторник'],
                ['3', 'среда'],
                ['4', 'четверг'],
                ['5', 'пятница'],
                ['6', 'суббота'],
                ['0', 'воскресенье'],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </SelectBox>
          )}
        </div>
      </Field>

      <Field label="Первый запуск">
        <AuthInput
          type="date"
          value={nextRunAt}
          onChange={(e) => setNextRunAt(e.target.value)}
          required
        />
      </Field>

      <Field label="Заметка (необязательно)">
        <AuthInput
          type="text"
          placeholder="Например: зарплата, аренда, Netflix"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>

      {error && <ErrorBox>{error}</ErrorBox>}

      <div className="flex gap-2">
        <SecondaryButton type="button" onClick={onDone}>
          Отмена
        </SecondaryButton>
        <PrimaryButton type="submit" disabled={busy || !accountId}>
          {busy ? 'Сохраняем…' : 'Создать'}
        </PrimaryButton>
      </div>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">{label}</label>
      {children}
    </div>
  )
}

function SelectBox({
  value,
  onChange,
  children,
}: {
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500"
    >
      {children}
    </select>
  )
}

function AccountsSection() {
  const { profile } = useApp()
  const { accounts, loading, error, create, remove } = useAccounts()
  const [adding, setAdding] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)

  async function handleDelete(account: Account) {
    setRemoveError(null)
    if (!window.confirm(`Удалить счёт «${account.name}»? Если у него есть операции — Postgres откажет.`)) {
      return
    }
    try {
      await remove(account.id)
    } catch (e) {
      setRemoveError(e instanceof Error ? e.message : 'Не удалось удалить')
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">Счета</h2>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            + Добавить
          </button>
        )}
      </div>

      {loading && <p className="text-sm text-slate-500">Загрузка…</p>}
      {error && <ErrorBox>{error}</ErrorBox>}

      {!loading && accounts.length === 0 && !adding && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Пока нет ни одного счёта. Добавьте первый — наличные, карту или семейный — чтобы начать вести учёт.
        </p>
      )}

      {accounts.length > 0 && (
        <ul className="divide-y divide-slate-200 dark:divide-slate-700 -my-2">
          {accounts.map((a) => (
            <li key={a.id} className="py-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <span>{a.visibility === 'shared' ? '🏠' : '🧍'}</span>
                  <span>{a.name}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-normal">
                    {currencySymbol(a.currency)} {a.currency}
                  </span>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {a.visibility === 'shared' ? 'Семейный' : 'Личный'} ·{' '}
                  Начальный баланс {formatMoney(a.initial_balance, a.currency)}
                </div>
              </div>
              {a.owner_profile_id === profile?.id && (
                <button
                  onClick={() => handleDelete(a)}
                  className="text-xs text-rose-600 dark:text-rose-400 hover:underline"
                >
                  Удалить
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {removeError && (
        <div className="mt-3">
          <ErrorBox>{removeError}</ErrorBox>
        </div>
      )}

      {adding && (
        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
          <AddAccountForm onDone={() => setAdding(false)} create={create} />
        </div>
      )}
    </section>
  )
}

function AddAccountForm({
  onDone,
  create,
}: {
  onDone: () => void
  create: (input: {
    name: string
    visibility: 'personal' | 'shared'
    initial_balance: number
    currency: string
  }) => Promise<unknown>
}) {
  const { household } = useApp()
  const { currencies } = useCurrencies()
  const [name, setName] = useState('')
  const [visibility, setVisibility] = useState<'personal' | 'shared'>('personal')
  const [currency, setCurrency] = useState(household?.base_currency ?? 'ILS')
  const [initialBalance, setInitialBalance] = useState('0')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await create({
        name: name.trim(),
        visibility,
        currency,
        initial_balance: Number(initialBalance) || 0,
      })
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
          Название
        </label>
        <AuthInput
          type="text"
          placeholder="Hapoalim, Наличные, Револют…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Тип</label>
        <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-100/60 dark:bg-slate-800/60">
          <VisibilityButton
            active={visibility === 'personal'}
            onClick={() => setVisibility('personal')}
          >
            🧍 Личный
          </VisibilityButton>
          <VisibilityButton
            active={visibility === 'shared'}
            onClick={() => setVisibility('shared')}
          >
            🏠 Семейный
          </VisibilityButton>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          {visibility === 'personal'
            ? 'Видите только вы. Партнёр не узнает ни о счёте, ни об операциях на нём.'
            : 'Видят оба партнёра. Операции тоже видны обоим (если не отметить операцию как приватную).'}
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
          Валюта
        </label>
        <SelectBox value={currency} onChange={setCurrency}>
          {currencies.map((c: Currency) => (
            <option key={c.code} value={c.code}>
              {c.symbol} {c.code} — {c.name}
            </option>
          ))}
        </SelectBox>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
          Начальный баланс
        </label>
        <AuthInput
          type="number"
          step="0.01"
          value={initialBalance}
          onChange={(e) => setInitialBalance(e.target.value)}
          required
        />
      </div>

      {error && <ErrorBox>{error}</ErrorBox>}

      <div className="flex gap-2">
        <SecondaryButton type="button" onClick={onDone}>
          Отмена
        </SecondaryButton>
        <PrimaryButton type="submit" disabled={busy || !name.trim()}>
          {busy ? 'Сохраняем…' : 'Создать'}
        </PrimaryButton>
      </div>
    </form>
  )
}

function VisibilityButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 text-xs rounded-md transition-colors ${
        active
          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
          : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
      }`}
    >
      {children}
    </button>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-slate-900 dark:text-slate-100">{children}</span>
    </div>
  )
}
