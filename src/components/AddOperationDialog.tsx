import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useAccounts } from '../hooks/useAccounts'
import { useCategories } from '../hooks/useCategories'
import { useOperations, type CreateOperationInput, type Operation } from '../hooks/useOperations'
import { useTransfers } from '../hooks/useTransfers'
import { useFxRates } from '../hooks/useFxRates'
import { convertMoney } from '../lib/fx'
import { currencySymbol } from '../lib/format'
import { AuthInput, ErrorBox, PrimaryButton, SecondaryButton } from './AuthControls'

type Tab = 'expense' | 'income' | 'transfer'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function AddOperationDialog({
  open,
  onClose,
  onCreated,
  editOperation,
}: {
  open: boolean
  onClose: () => void
  onCreated?: () => void
  editOperation?: Operation | null
}) {
  const { accounts } = useAccounts()
  const { categories } = useCategories()
  const { create: createOperation, update: updateOperation } = useOperations('month')
  const { create: createTransfer } = useTransfers()
  const { ratesByDate } = useFxRates()
  const isEdit = !!editOperation

  const [tab, setTab] = useState<Tab>('expense')
  const [amount, setAmount] = useState('')
  const [toAmount, setToAmount] = useState('') // только для cross-currency transfer
  const [accountId, setAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [occurredAt, setOccurredAt] = useState(todayIso())
  const [note, setNote] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const visibleAccounts = accounts // RLS уже отфильтровал
  const kind: 'expense' | 'income' | null =
    tab === 'expense' ? 'expense' : tab === 'income' ? 'income' : null
  const kindCategories = useMemo(
    () => (kind ? categories.filter((c) => c.kind === kind) : []),
    [categories, kind],
  )
  /** Сначала parent, под ним — отсортированные подкатегории. */
  const orderedCategories = useMemo(() => {
    const parents = kindCategories
      .filter((c) => !c.parent_id)
      .sort((a, b) => a.name.localeCompare(b.name))
    const byParent = new Map<string, typeof kindCategories>()
    for (const c of kindCategories) {
      if (!c.parent_id) continue
      const arr = byParent.get(c.parent_id) ?? []
      arr.push(c)
      byParent.set(c.parent_id, arr)
    }
    const out: { id: string; label: string }[] = []
    for (const p of parents) {
      out.push({ id: p.id, label: `${p.icon ? p.icon + ' ' : ''}${p.name}` })
      const kids = (byParent.get(p.id) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name))
      for (const k of kids) {
        out.push({
          id: k.id,
          label: `    └ ${k.icon ? k.icon + ' ' : ''}${k.name}`,
        })
      }
    }
    return out
  }, [kindCategories])
  const selectedAccount = visibleAccounts.find((a) => a.id === accountId)
  const toAccount = visibleAccounts.find((a) => a.id === toAccountId)
  const otherAccounts = visibleAccounts.filter((a) => a.id !== accountId)
  const isCrossCurrency =
    tab === 'transfer' &&
    !!selectedAccount &&
    !!toAccount &&
    selectedAccount.currency !== toAccount.currency

  // Подсказка по курсу: amount в from-валюте конвертим в to-валюту.
  const suggestedToAmount = useMemo(() => {
    if (!isCrossCurrency || !selectedAccount || !toAccount) return null
    const n = Number(amount.replace(',', '.'))
    if (!isFinite(n) || n <= 0) return null
    return convertMoney(n, selectedAccount.currency, toAccount.currency, ratesByDate, occurredAt)
  }, [isCrossCurrency, selectedAccount, toAccount, amount, ratesByDate, occurredAt])

  /* eslint-disable react-hooks/set-state-in-effect --
     все четыре эффекта ниже — legit form-reset / cascading-нормализация
     полей при изменении табов/счёта. setState внутри useEffect здесь
     осмысленный, новое поведение нового react-hooks плагина к нему
     не применимо. */

  // Form-reset при открытии. В edit-режиме — префилл из editOperation.
  useEffect(() => {
    if (!open) return
    if (editOperation) {
      setTab(editOperation.kind)
      setAmount(String(editOperation.amount))
      setToAmount('')
      setAccountId(editOperation.account_id)
      setToAccountId('')
      setCategoryId(editOperation.category_id ?? '')
      setOccurredAt(editOperation.occurred_at)
      setNote(editOperation.note ?? '')
      setIsPrivate(editOperation.is_private)
      setError(null)
      return
    }
    setTab('expense')
    setAmount('')
    setToAmount('')
    setAccountId(visibleAccounts[0]?.id ?? '')
    setToAccountId('')
    setCategoryId('')
    setOccurredAt(todayIso())
    setNote('')
    setIsPrivate(false)
    setError(null)
  }, [open, visibleAccounts, editOperation])

  // Сбрасываем toAmount если выбор счетов сделал перевод не-кросс-валютным.
  useEffect(() => {
    if (!isCrossCurrency) setToAmount('')
  }, [isCrossCurrency])

  useEffect(() => {
    setCategoryId('')
  }, [tab])

  useEffect(() => {
    if (selectedAccount?.visibility !== 'shared') {
      setIsPrivate(false)
    }
  }, [selectedAccount?.visibility])

  // Если выбранный to-счёт совпал с from — сбросить.
  useEffect(() => {
    if (toAccountId && toAccountId === accountId) {
      setToAccountId('')
    }
  }, [accountId, toAccountId])

  /* eslint-enable react-hooks/set-state-in-effect */

  if (!open) return null

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const amountNum = Number(amount.replace(',', '.'))
    if (!isFinite(amountNum) || amountNum <= 0) {
      setError('Сумма должна быть положительным числом')
      return
    }
    if (!accountId) {
      setError(tab === 'transfer' ? 'Выберите счёт-источник' : 'Выберите счёт')
      return
    }
    if (tab === 'transfer' && !toAccountId) {
      setError('Выберите счёт-назначение')
      return
    }

    let toAmountNum: number | null = null
    if (tab === 'transfer' && isCrossCurrency) {
      if (toAmount.trim()) {
        const n = Number(toAmount.replace(',', '.'))
        if (!isFinite(n) || n <= 0) {
          setError('Сумма получена должна быть положительным числом')
          return
        }
        toAmountNum = n
      } else if (suggestedToAmount !== null) {
        toAmountNum = suggestedToAmount
      } else {
        setError(
          `Нет курса для конверсии ${selectedAccount?.currency} → ${toAccount?.currency} на ${occurredAt}. Введите фактически полученную сумму вручную.`,
        )
        return
      }
    }

    setBusy(true)
    try {
      if (isEdit && editOperation) {
        await updateOperation(editOperation.id, {
          account_id: accountId,
          category_id: categoryId || null,
          kind: tab === 'transfer' ? editOperation.kind : tab,
          amount: amountNum,
          occurred_at: occurredAt,
          note: note.trim() || null,
          is_private: isPrivate,
        })
      } else if (tab === 'transfer') {
        await createTransfer({
          from_account_id: accountId,
          to_account_id: toAccountId,
          amount: amountNum,
          occurred_at: occurredAt,
          note: note.trim() || null,
          to_amount: toAmountNum,
        })
      } else {
        const input: CreateOperationInput = {
          account_id: accountId,
          category_id: categoryId || null,
          kind: tab,
          amount: amountNum,
          occurred_at: occurredAt,
          note: note.trim() || null,
          is_private: isPrivate,
        }
        await createOperation(input)
      }
      onCreated?.()
      onClose()
    } catch (e) {
      setError(humaniseTransferError(e instanceof Error ? e.message : 'Не удалось сохранить'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-t-2xl sm:rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {isEdit ? 'Изменить операцию' : 'Новая операция'}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 text-xl leading-none"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        {visibleAccounts.length === 0 ? (
          <NoAccountsHint onClose={onClose} />
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {!isEdit && <TabToggle value={tab} onChange={setTab} />}

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Сумма{selectedAccount ? ` (${currencySymbol(selectedAccount.currency)} ${selectedAccount.currency})` : ''}
              </label>
              <AuthInput
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
                required
                className="text-2xl font-semibold text-center"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {tab === 'transfer' ? 'Откуда' : 'Откуда снять'}
              </label>
              <Select value={accountId} onChange={setAccountId}>
                <AccountOptions accounts={visibleAccounts} />
              </Select>
            </div>

            {tab === 'transfer' && (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Куда
                </label>
                <Select value={toAccountId} onChange={setToAccountId}>
                  <option value="">— выберите счёт —</option>
                  <AccountOptions accounts={otherAccounts} withCurrency />
                </Select>
              </div>
            )}

            {tab === 'transfer' && isCrossCurrency && toAccount && (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Получено ({currencySymbol(toAccount.currency)} {toAccount.currency})
                </label>
                <AuthInput
                  type="text"
                  inputMode="decimal"
                  placeholder={
                    suggestedToAmount !== null
                      ? `по курсу ECB: ${suggestedToAmount.toFixed(2)}`
                      : 'нет курса — введите вручную'
                  }
                  value={toAmount}
                  onChange={(e) => setToAmount(e.target.value)}
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Если оставить пустым — пересчитаем по последнему курсу ECB на дату операции.
                </p>
              </div>
            )}

            {tab !== 'transfer' && (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Категория
                </label>
                <Select value={categoryId} onChange={setCategoryId}>
                  <option value="">— без категории —</option>
                  {orderedCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Дата
              </label>
              <AuthInput
                type="date"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Заметка (необязательно)
              </label>
              <AuthInput
                type="text"
                placeholder={
                  tab === 'transfer' ? 'Например: с зарплаты на копилку' : 'Например: тиббулим, Лули, подарок маме'
                }
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            {tab !== 'transfer' && selectedAccount?.visibility === 'shared' && (
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-600"
                />
                <span className="text-sm text-slate-700 dark:text-slate-300">
                  🔒 Приватная операция
                  <span className="block text-xs text-slate-500 dark:text-slate-400">
                    Партнёр не увидит её даже на семейном счёте
                  </span>
                </span>
              </label>
            )}

            {error && <ErrorBox>{error}</ErrorBox>}

            <div className="flex gap-2 pt-2">
              <SecondaryButton type="button" onClick={onClose}>
                Отмена
              </SecondaryButton>
              <PrimaryButton type="submit" disabled={busy}>
                {busy ? 'Сохраняем…' : isEdit ? 'Сохранить изменения' : 'Сохранить'}
              </PrimaryButton>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function TabToggle({ value, onChange }: { value: Tab; onChange: (t: Tab) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800">
      <TabButton active={value === 'expense'} onClick={() => onChange('expense')}>
        💸 Расход
      </TabButton>
      <TabButton active={value === 'income'} onClick={() => onChange('income')}>
        💰 Доход
      </TabButton>
      <TabButton active={value === 'transfer'} onClick={() => onChange('transfer')}>
        ↔ Перевод
      </TabButton>
    </div>
  )
}

function TabButton({
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
      className={`py-2 text-sm font-medium rounded-md transition-colors ${
        active
          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
          : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
      }`}
    >
      {children}
    </button>
  )
}

function AccountOptions({
  accounts,
  withCurrency,
}: {
  accounts: { id: string; name: string; currency: string; visibility: 'personal' | 'shared'; role: 'wallet' | 'monthly_budget' }[]
  withCurrency?: boolean
}) {
  const envelopes = accounts.filter((a) => a.role === 'monthly_budget')
  const wallets = accounts.filter((a) => a.role !== 'monthly_budget')
  const label = (a: (typeof accounts)[number]) => {
    const icon = a.role === 'monthly_budget' ? '💰 ' : a.visibility === 'shared' ? '🏠 ' : '🧍 '
    const cur = withCurrency ? ` ${currencySymbol(a.currency)}` : ''
    return `${icon}${a.name}${cur}`
  }
  return (
    <>
      {envelopes.length > 0 && (
        <optgroup label="💰 Бюджет месяца">
          {envelopes.map((a) => (
            <option key={a.id} value={a.id}>
              {label(a)}
            </option>
          ))}
        </optgroup>
      )}
      {wallets.length > 0 && (
        <optgroup label={envelopes.length > 0 ? '🏦 Накопления' : 'Счета'}>
          {wallets.map((a) => (
            <option key={a.id} value={a.id}>
              {label(a)}
            </option>
          ))}
        </optgroup>
      )}
    </>
  )
}

function Select({
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

function NoAccountsHint({ onClose }: { onClose: () => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Чтобы добавить операцию, сначала нужен счёт. Зайдите в{' '}
        <a href="/settings" className="text-indigo-600 dark:text-indigo-400 hover:underline">
          Настройки
        </a>{' '}
        → раздел «Счета» → «+ Добавить».
      </p>
      <SecondaryButton onClick={onClose}>Закрыть</SecondaryButton>
    </div>
  )
}

function humaniseTransferError(raw: string): string {
  if (raw.includes('SAME_ACCOUNT')) return 'Счёт-источник и счёт-назначение должны быть разными.'
  if (raw.includes('ACCOUNT_NOT_VISIBLE')) return 'Один из счетов вам недоступен.'
  if (raw.includes('INVALID_AMOUNT')) return 'Сумма должна быть положительной.'
  if (raw.includes('NO_HOUSEHOLD')) return 'Сначала создайте или вступите в семью.'
  return raw
}
