import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/useApp'
import { useAccounts, type Account, type AccountRole } from '../hooks/useAccounts'
import { useCategories, type Category } from '../hooks/useCategories'
import { useSchedules, describeCadence, type Schedule } from '../hooks/useSchedules'
import { useCurrencies, type Currency } from '../hooks/useCurrencies'
import { monthKey, useBudgets } from '../hooks/useBudgets'
import { AuthInput, ErrorBox, PrimaryButton, SecondaryButton } from '../components/AuthControls'
import { InstallSection } from '../components/InstallBanner'
import { NotificationsSection } from '../components/NotificationsSection'
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

      <CategoriesSection />

      <EssentialCategoriesSection />

      <SchedulesSection />

      <InstallSection />

      <NotificationsSection />

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

function CategoriesSection() {
  const { household } = useApp()
  const {
    categories,
    loading: catLoading,
    error: catError,
    createCategory,
    renameCategory,
    deleteCategory,
  } = useCategories()
  const [kind, setKind] = useState<'expense' | 'income'>('expense')
  const [month, setMonth] = useState(() => monthKey(new Date()))
  const {
    budgets,
    loading: budLoading,
    error: budError,
    upsert,
    remove,
    copyFromPreviousMonth,
  } = useBudgets(month)

  const [addingParentId, setAddingParentId] = useState<string | null | undefined>(undefined)
  // undefined — ничего не добавляем; null — добавляем root-категорию; uuid — подкатегория к этому id.
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState('')
  const [addBusy, setAddBusy] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [copyInfo, setCopyInfo] = useState<string | null>(null)
  const [copyErr, setCopyErr] = useState<string | null>(null)

  const baseCurrency = household?.base_currency ?? 'ILS'

  const tree = useMemo(() => {
    const ofKind = categories.filter((c) => c.kind === kind)
    const parents = ofKind
      .filter((c) => !c.parent_id)
      .sort((a, b) => a.name.localeCompare(b.name))
    const childrenByParent = new Map<string, Category[]>()
    for (const c of ofKind) {
      if (!c.parent_id) continue
      const arr = childrenByParent.get(c.parent_id) ?? []
      arr.push(c)
      childrenByParent.set(c.parent_id, arr)
    }
    for (const arr of childrenByParent.values()) {
      arr.sort((a, b) => a.name.localeCompare(b.name))
    }
    return { parents, childrenByParent }
  }, [categories, kind])

  const budgetByCategory = useMemo(() => {
    const map = new Map<string, number>()
    for (const b of budgets) map.set(b.category_id, Number(b.amount))
    return map
  }, [budgets])

  const totalBudget = useMemo(() => {
    if (kind !== 'expense') return 0
    let sum = 0
    for (const c of categories) {
      if (c.kind === 'expense') sum += budgetByCategory.get(c.id) ?? 0
    }
    return sum
  }, [categories, budgetByCategory, kind])

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

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setAddError(null)
    if (!newName.trim()) {
      setAddError('Введите название')
      return
    }
    setAddBusy(true)
    try {
      await createCategory({
        name: newName,
        kind,
        icon: newIcon.trim() || null,
        parent_id: addingParentId ?? null,
      })
      setNewName('')
      setNewIcon('')
      setAddingParentId(undefined)
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Не удалось создать')
    } finally {
      setAddBusy(false)
    }
  }

  async function handleDelete(c: Category) {
    const children = tree.childrenByParent.get(c.id) ?? []
    const msg =
      children.length > 0
        ? `Удалить «${c.name}» и ${children.length} подкатегорий? Привязанные операции останутся, но без категории.`
        : `Удалить «${c.name}»? Привязанные операции останутся, но без категории.`
    if (!window.confirm(msg)) return
    setActionError(null)
    try {
      await deleteCategory(c.id)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Не удалось удалить')
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-5">
      <h2 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Категории</h2>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
        Свой список расходов и доходов. Для расходных категорий справа задайте
        месячный бюджет (необязательно) — дашборд подсветит превышение.
      </p>

      <div className="grid grid-cols-2 gap-2 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 mb-3">
        <button
          type="button"
          onClick={() => setKind('expense')}
          className={`py-1.5 text-sm font-medium rounded-md ${
            kind === 'expense'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
              : 'text-slate-500'
          }`}
        >
          💸 Расходы
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
          💰 Доходы
        </button>
      </div>

      {kind === 'expense' && (
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1">
            <button
              onClick={() => shiftMonth(-1)}
              className="px-2 py-1 text-sm rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Предыдущий месяц"
            >
              ‹
            </button>
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100 tabular-nums min-w-[8rem] text-center">
              Бюджет · {humanMonth(month)}
            </div>
            <button
              onClick={() => shiftMonth(1)}
              className="px-2 py-1 text-sm rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Следующий месяц"
            >
              ›
            </button>
          </div>
          <button
            onClick={handleCopy}
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
            title="Скопировать значения из прошлого месяца (не трогая уже заданные)"
          >
            Копировать с прошлого
          </button>
        </div>
      )}

      {copyInfo && <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-2">{copyInfo}</p>}
      {copyErr && <ErrorBox>{copyErr}</ErrorBox>}
      {(catLoading || (kind === 'expense' && budLoading)) && (
        <p className="text-sm text-slate-500">Загрузка…</p>
      )}
      {catError && <ErrorBox>{catError}</ErrorBox>}
      {kind === 'expense' && budError && <ErrorBox>{budError}</ErrorBox>}
      {actionError && <ErrorBox>{actionError}</ErrorBox>}

      {!catLoading && tree.parents.length === 0 && addingParentId === undefined && (
        <p className="text-sm text-slate-500 dark:text-slate-400 my-3">
          Пока нет категорий. Нажмите «+ Добавить категорию» ниже.
        </p>
      )}

      {tree.parents.length > 0 && (
        <ul className="divide-y divide-slate-200 dark:divide-slate-700 -my-2">
          {tree.parents.map((p) => {
            const kids = tree.childrenByParent.get(p.id) ?? []
            const kidsSum = kids.reduce(
              (acc, k) => acc + (budgetByCategory.get(k.id) ?? 0),
              0,
            )
            return (
              <div key={p.id}>
                <CategoryRow
                  category={p}
                  depth={0}
                  showBudget={kind === 'expense'}
                  currentAmount={budgetByCategory.get(p.id) ?? null}
                  childrenSum={kind === 'expense' && kids.length > 0 ? kidsSum : null}
                  baseCurrency={baseCurrency}
                  onSaveBudget={(amount) => upsert(p.id, amount)}
                  onClearBudget={() => remove(p.id)}
                  onRename={(name, icon) => renameCategory(p.id, { name, icon })}
                  onDelete={() => handleDelete(p)}
                  onAddSubcategory={() => {
                    setAddingParentId(p.id)
                    setNewName('')
                    setNewIcon('')
                    setAddError(null)
                  }}
                />
                {kids.map((k) => (
                  <CategoryRow
                    key={k.id}
                    category={k}
                    depth={1}
                    showBudget={kind === 'expense'}
                    currentAmount={budgetByCategory.get(k.id) ?? null}
                    childrenSum={null}
                    baseCurrency={baseCurrency}
                    onSaveBudget={(amount) => upsert(k.id, amount)}
                    onClearBudget={() => remove(k.id)}
                    onRename={(name, icon) => renameCategory(k.id, { name, icon })}
                    onDelete={() => handleDelete(k)}
                    onAddSubcategory={null}
                  />
                ))}
              </div>
            )
          })}
        </ul>
      )}

      {kind === 'expense' && tree.parents.length > 0 && (
        <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-sm">
          <span className="font-medium text-slate-900 dark:text-slate-100">Итого бюджет</span>
          <span className="tabular-nums font-semibold text-slate-900 dark:text-slate-100">
            {formatMoney(totalBudget, baseCurrency, 0)}
          </span>
        </div>
      )}

      {addingParentId !== undefined ? (
        <form
          onSubmit={handleCreate}
          className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 space-y-2"
        >
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {addingParentId === null
              ? `Новая ${kind === 'expense' ? 'категория расходов' : 'категория доходов'}`
              : `Подкатегория к «${categories.find((c) => c.id === addingParentId)?.name ?? ''}»`}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="🏷"
              value={newIcon}
              onChange={(e) => setNewIcon(e.target.value)}
              maxLength={2}
              className="w-12 text-center px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
            />
            <input
              type="text"
              placeholder="Название"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
              className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
            />
          </div>
          {addError && <ErrorBox>{addError}</ErrorBox>}
          <div className="flex gap-2">
            <SecondaryButton type="button" onClick={() => setAddingParentId(undefined)}>
              Отмена
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={addBusy || !newName.trim()}>
              {addBusy ? 'Создаём…' : 'Создать'}
            </PrimaryButton>
          </div>
        </form>
      ) : (
        <button
          onClick={() => {
            setAddingParentId(null)
            setNewName('')
            setNewIcon('')
            setAddError(null)
          }}
          className="mt-4 w-full py-2.5 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
        >
          + Добавить категорию
        </button>
      )}
    </section>
  )
}

function CategoryRow({
  category,
  depth,
  showBudget,
  currentAmount,
  childrenSum,
  baseCurrency,
  onSaveBudget,
  onClearBudget,
  onRename,
  onDelete,
  onAddSubcategory,
}: {
  category: Category
  depth: 0 | 1
  showBudget: boolean
  currentAmount: number | null
  childrenSum: number | null
  baseCurrency: string
  onSaveBudget: (amount: number) => Promise<unknown>
  onClearBudget: () => Promise<unknown>
  onRename: (name: string, icon: string | null) => Promise<unknown>
  onDelete: () => void
  onAddSubcategory: (() => void) | null
}) {
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(category.name)
  const [editIcon, setEditIcon] = useState(category.icon ?? '')
  const [editBusy, setEditBusy] = useState(false)

  const [budgetValue, setBudgetValue] = useState(
    currentAmount !== null ? String(currentAmount) : '',
  )
  const [budgetSaving, setBudgetSaving] = useState(false)
  const [rowError, setRowError] = useState<string | null>(null)

  /* eslint-disable react-hooks/set-state-in-effect --
     Внешний источник истины (currentAmount из props) — перенакатываем
     локальное значение при смене месяца / удалённом upsert. */
  useEffect(() => {
    setBudgetValue(currentAmount !== null ? String(currentAmount) : '')
  }, [currentAmount])
  /* eslint-enable react-hooks/set-state-in-effect */

  async function commitEdit() {
    if (!editName.trim()) {
      setEditing(false)
      setEditName(category.name)
      setEditIcon(category.icon ?? '')
      return
    }
    if (editName === category.name && (editIcon || null) === (category.icon ?? null)) {
      setEditing(false)
      return
    }
    setEditBusy(true)
    try {
      await onRename(editName, editIcon.trim() || null)
      setEditing(false)
    } finally {
      setEditBusy(false)
    }
  }

  async function commitBudget() {
    setRowError(null)
    const trimmed = budgetValue.trim().replace(',', '.')
    if (trimmed === '') {
      if (currentAmount === null) return
      setBudgetSaving(true)
      try {
        await onClearBudget()
      } catch (e) {
        setRowError(e instanceof Error ? e.message : 'Ошибка')
      } finally {
        setBudgetSaving(false)
      }
      return
    }
    const num = Number(trimmed)
    if (!isFinite(num) || num <= 0) {
      setRowError('Положительное число')
      return
    }
    if (num === currentAmount) return
    setBudgetSaving(true)
    try {
      await onSaveBudget(num)
    } catch (e) {
      setRowError(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setBudgetSaving(false)
    }
  }

  return (
    <li className={`py-2 flex items-center gap-2 ${depth === 1 ? 'pl-8' : ''}`}>
      {editing ? (
        <>
          <input
            type="text"
            value={editIcon}
            onChange={(e) => setEditIcon(e.target.value)}
            maxLength={2}
            className="w-10 text-center px-1 py-1 text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          />
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitEdit()
              if (e.key === 'Escape') {
                setEditing(false)
                setEditName(category.name)
                setEditIcon(category.icon ?? '')
              }
            }}
            autoFocus
            className="flex-1 px-2 py-1 text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          />
          <button
            onClick={commitEdit}
            disabled={editBusy}
            className="px-2 py-1 text-xs rounded-md text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
            title="Сохранить"
            aria-label="Сохранить"
          >
            ✓
          </button>
          <button
            onClick={() => {
              setEditing(false)
              setEditName(category.name)
              setEditIcon(category.icon ?? '')
            }}
            className="px-2 py-1 text-xs rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Отмена"
            aria-label="Отмена"
          >
            ✕
          </button>
        </>
      ) : (
        <>
          <span className="text-base shrink-0 w-6 text-center">{category.icon ?? '•'}</span>
          <span
            className={`flex-1 min-w-0 truncate text-sm text-slate-900 dark:text-slate-100 ${
              depth === 0 ? 'font-medium' : ''
            }`}
          >
            {category.name}
            {childrenSum !== null && childrenSum > 0 && (
              <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400 tabular-nums">
                ∑ листов {formatMoney(childrenSum, baseCurrency, 0)}
              </span>
            )}
          </span>
          {showBudget && (
            <div className="flex items-center gap-1 shrink-0">
              <input
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={budgetValue}
                onChange={(e) => setBudgetValue(e.target.value)}
                onBlur={commitBudget}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                }}
                disabled={budgetSaving}
                className="w-20 text-right tabular-nums px-2 py-1 text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500"
              />
              <span className="text-xs text-slate-500 dark:text-slate-400 w-4">
                {currencySymbol(baseCurrency)}
              </span>
            </div>
          )}
          <div className="flex items-center gap-0.5 shrink-0 ml-1">
            {onAddSubcategory && (
              <button
                onClick={onAddSubcategory}
                className="p-1.5 text-base text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                title="Добавить подкатегорию"
                aria-label="Добавить подкатегорию"
              >
                ➕
              </button>
            )}
            <button
              onClick={() => setEditing(true)}
              className="p-1.5 text-base text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Переименовать"
              aria-label="Переименовать"
            >
              ✏️
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 text-base text-rose-500 hover:text-rose-700 dark:hover:text-rose-300 rounded-md hover:bg-rose-50 dark:hover:bg-rose-900/20"
              title="Удалить"
              aria-label="Удалить"
            >
              🗑
            </button>
          </div>
          {rowError && <span className="text-xs text-rose-500 ml-2">{rowError}</span>}
        </>
      )}
    </li>
  )
}

function EssentialCategoriesSection() {
  const { categories, loading, setEssential } = useCategories()
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const expenseCats = useMemo(
    () => categories.filter((c) => c.kind === 'expense').sort((a, b) => a.name.localeCompare(b.name)),
    [categories],
  )

  async function toggle(id: string, value: boolean) {
    setError(null)
    setSavingId(id)
    try {
      await setEssential(id, value)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-5">
      <h2 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
        Обязательные категории
      </h2>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
        Подушка безопасности по умолчанию считает по всем тратам — это
        завышенная цифра. Отметьте «обязательные» категории (аренда, ваад,
        еда), и подушка станет точнее: «жизнь без дохода» = только эти траты.
        Если ни одна не отмечена — считаем по всем (как сейчас).
      </p>

      {loading && <p className="text-sm text-slate-500">Загрузка…</p>}
      {error && <ErrorBox>{error}</ErrorBox>}

      {!loading && expenseCats.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Сначала создайте категории расходов.
        </p>
      )}

      {expenseCats.length > 0 && (
        <ul className="divide-y divide-slate-200 dark:divide-slate-700 -my-2">
          {expenseCats.map((c) => (
            <li key={c.id} className="py-2 flex items-center gap-3">
              <span className="text-base shrink-0 w-6 text-center">{c.icon ?? '•'}</span>
              <span className="flex-1 min-w-0 truncate text-sm text-slate-900 dark:text-slate-100">
                {c.name}
              </span>
              <label className="inline-flex items-center gap-2 cursor-pointer text-xs text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={c.is_essential}
                  onChange={(e) => toggle(c.id, e.target.checked)}
                  disabled={savingId === c.id}
                  className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-indigo-500 focus:ring-indigo-500/40"
                />
                Обязательная
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
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
  const { accounts, loading, error, create, remove, setRole } = useAccounts()
  const [adding, setAdding] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [roleError, setRoleError] = useState<string | null>(null)

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

  async function handleMakeEnvelope(account: Account) {
    setRoleError(null)
    const suggested = String(Number(account.initial_balance) || 3600)
    const raw = window.prompt(
      `Месячный лимит конверта «${account.name}» (${account.currency}):`,
      suggested,
    )
    if (raw === null) return
    const n = Number(raw.replace(',', '.'))
    if (!isFinite(n) || n <= 0) {
      setRoleError('Лимит должен быть положительным числом')
      return
    }
    try {
      await setRole(account.id, 'monthly_budget', n)
    } catch (e) {
      setRoleError(e instanceof Error ? e.message : 'Не удалось обновить')
    }
  }

  async function handleMakeWallet(account: Account) {
    setRoleError(null)
    if (!window.confirm(`Сделать «${account.name}» обычным счётом-накоплениями?`)) return
    try {
      await setRole(account.id, 'wallet', null)
    } catch (e) {
      setRoleError(e instanceof Error ? e.message : 'Не удалось обновить')
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
                  <span>{a.role === 'monthly_budget' ? '💰' : a.visibility === 'shared' ? '🏠' : '🧍'}</span>
                  <span>{a.name}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-normal">
                    {currencySymbol(a.currency)} {a.currency}
                  </span>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {a.role === 'monthly_budget'
                    ? `Бюджет месяца · лимит ${formatMoney(a.monthly_amount ?? 0, a.currency)}`
                    : `${a.visibility === 'shared' ? 'Семейный' : 'Личный'} · Начальный баланс ${formatMoney(a.initial_balance, a.currency)}`}
                </div>
              </div>
              {a.owner_profile_id === profile?.id && (
                <div className="flex flex-col items-end gap-1">
                  {a.role === 'monthly_budget' ? (
                    <button
                      onClick={() => handleMakeWallet(a)}
                      className="text-xs text-slate-600 dark:text-slate-400 hover:underline"
                    >
                      🏦 В накопления
                    </button>
                  ) : (
                    <button
                      onClick={() => handleMakeEnvelope(a)}
                      className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      💰 Сделать бюджетом
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(a)}
                    className="text-xs text-rose-600 dark:text-rose-400 hover:underline"
                  >
                    Удалить
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {roleError && (
        <div className="mt-3">
          <ErrorBox>{roleError}</ErrorBox>
        </div>
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
    role?: AccountRole
    monthly_amount?: number | null
  }) => Promise<unknown>
}) {
  const { household } = useApp()
  const { currencies } = useCurrencies()
  const [name, setName] = useState('')
  const [visibility, setVisibility] = useState<'personal' | 'shared'>('personal')
  const [role, setRole] = useState<AccountRole>('wallet')
  const [currency, setCurrency] = useState(household?.base_currency ?? 'ILS')
  const [initialBalance, setInitialBalance] = useState('0')
  const [monthlyAmount, setMonthlyAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (role === 'monthly_budget') {
      const n = Number(monthlyAmount.replace(',', '.'))
      if (!isFinite(n) || n <= 0) {
        setError('Месячный лимит должен быть положительным числом')
        return
      }
    }
    setBusy(true)
    try {
      const monthlyNum =
        role === 'monthly_budget' ? Number(monthlyAmount.replace(',', '.')) : null
      await create({
        name: name.trim(),
        visibility,
        currency,
        initial_balance: role === 'monthly_budget'
          ? (monthlyNum ?? 0)
          : (Number(initialBalance) || 0),
        role,
        monthly_amount: monthlyNum,
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
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Роль</label>
        <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-100/60 dark:bg-slate-800/60">
          <VisibilityButton active={role === 'wallet'} onClick={() => setRole('wallet')}>
            🏦 Накопления
          </VisibilityButton>
          <VisibilityButton active={role === 'monthly_budget'} onClick={() => setRole('monthly_budget')}>
            💰 Бюджет месяца
          </VisibilityButton>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          {role === 'wallet'
            ? 'Обычный счёт: лежит то, что не потрачено. Учитывается как накопления.'
            : 'Конверт месяца: задаёте лимит (например 3600 ₪ на личные траты), и на дашборде видно сколько ещё осталось до конца месяца.'}
        </p>
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

      {role === 'monthly_budget' ? (
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Месячный лимит
          </label>
          <AuthInput
            type="text"
            inputMode="decimal"
            placeholder="3600"
            value={monthlyAmount}
            onChange={(e) => setMonthlyAmount(e.target.value)}
            required
          />
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Сколько вы кладёте в конверт каждый месяц. Стартовый баланс
            конверта = лимиту.
          </p>
        </div>
      ) : (
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
      )}

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
