import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useAccounts } from '../hooks/useAccounts'
import { useCategories } from '../hooks/useCategories'
import { useOperations, type CreateOperationInput } from '../hooks/useOperations'
import { AuthInput, ErrorBox, PrimaryButton, SecondaryButton } from './AuthControls'

type OperationKind = 'expense' | 'income'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function AddOperationDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated?: () => void
}) {
  const { accounts } = useAccounts()
  const { categories } = useCategories()
  const { create } = useOperations('month')

  const [kind, setKind] = useState<OperationKind>('expense')
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [occurredAt, setOccurredAt] = useState(todayIso())
  const [note, setNote] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const visibleAccounts = accounts // RLS уже отфильтровал
  const kindCategories = useMemo(
    () => categories.filter((c) => c.kind === kind),
    [categories, kind],
  )
  const selectedAccount = visibleAccounts.find((a) => a.id === accountId)

  // Сброс при открытии диалога — это legit form-reset, ESLint-предупреждение
  // про cascading renders сюда не применимо.
  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setKind('expense')
     
    setAmount('')
     
    setAccountId(visibleAccounts[0]?.id ?? '')
     
    setCategoryId('')
     
    setOccurredAt(todayIso())
     
    setNote('')
     
    setIsPrivate(false)
     
    setError(null)
  }, [open, visibleAccounts])

  // При смене kind — сбросить категорию (она привязана к kind).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCategoryId('')
  }, [kind])

  // Если переключились на personal-счёт — снять приватность (она не имеет смысла).
  useEffect(() => {
    if (selectedAccount?.visibility !== 'shared') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsPrivate(false)
    }
  }, [selectedAccount?.visibility])

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
      setError('Выберите счёт')
      return
    }

    setBusy(true)
    try {
      const input: CreateOperationInput = {
        account_id: accountId,
        category_id: categoryId || null,
        kind,
        amount: amountNum,
        occurred_at: occurredAt,
        note: note.trim() || null,
        is_private: isPrivate,
      }
      await create(input)
      onCreated?.()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить')
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
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Новая операция</h2>
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
            <KindToggle value={kind} onChange={setKind} />

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Сумма
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
                Счёт
              </label>
              <Select value={accountId} onChange={setAccountId}>
                {visibleAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.visibility === 'shared' ? '🏠 ' : '🧍 '}
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Категория
              </label>
              <Select value={categoryId} onChange={setCategoryId}>
                <option value="">— без категории —</option>
                {kindCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon ? `${c.icon} ` : ''}
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>

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
                placeholder="Например: тиббулим, Лули, подарок маме"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            {selectedAccount?.visibility === 'shared' && (
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
                {busy ? 'Сохраняем…' : 'Сохранить'}
              </PrimaryButton>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function KindToggle({ value, onChange }: { value: OperationKind; onChange: (k: OperationKind) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800">
      <KindButton active={value === 'expense'} onClick={() => onChange('expense')}>
        💸 Расход
      </KindButton>
      <KindButton active={value === 'income'} onClick={() => onChange('income')}>
        💰 Доход
      </KindButton>
    </div>
  )
}

function KindButton({
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
