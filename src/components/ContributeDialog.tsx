import { useEffect, useState, type FormEvent } from 'react'
import { useGoalContributions } from '../hooks/useGoalContributions'
import type { Goal } from '../hooks/useGoals'
import { goalProgress } from '../lib/goals'
import { formatMoney, currencySymbol } from '../lib/format'
import { AuthInput, ErrorBox, PrimaryButton, SecondaryButton } from './AuthControls'

interface Props {
  open: boolean
  onClose: () => void
  goal?: Goal
  baseCurrency: string
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function ContributeDialog({ open, onClose, goal, baseCurrency }: Props) {
  const { contributions, contribute } = useGoalContributions(goal?.id)
  const [amount, setAmount] = useState('')
  const [occurredAt, setOccurredAt] = useState(todayIso())
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /* eslint-disable react-hooks/set-state-in-effect --
     form-reset при открытии — те же соображения, что в AddOperationDialog. */
  useEffect(() => {
    if (!open) return
    setAmount('')
    setOccurredAt(todayIso())
    setNote('')
    setError(null)
  }, [open])
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!open || !goal) return null

  const progress = goalProgress(goal, contributions)
  const suggested = Math.max(0, Number(goal.target_amount) - progress.saved)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!goal) return
    setError(null)
    const amountNum = Number(amount.replace(',', '.'))
    if (!isFinite(amountNum) || amountNum <= 0) {
      setError('Сумма должна быть положительным числом')
      return
    }
    setBusy(true)
    try {
      await contribute(goal.id, amountNum, occurredAt, note.trim() || null)
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
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Пополнить «{goal.name}»
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 text-xl leading-none"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Уже накоплено {formatMoney(progress.saved, baseCurrency, 0)}, осталось{' '}
          {formatMoney(progress.remaining, baseCurrency, 0)}.
        </p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Сумма ({currencySymbol(baseCurrency)} {baseCurrency})
            </label>
            <AuthInput
              type="text"
              inputMode="decimal"
              placeholder={suggested > 0 ? String(Math.round(suggested)) : '0'}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
              required
              className="text-2xl font-semibold text-center"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Сумма в валюте семьи. Если откладываете из другой валюты — переведите
              сами, а движение по счёту фиксируйте отдельной операцией.
            </p>
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
              placeholder="Например: с бонуса, премии, подарок"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {error && <ErrorBox>{error}</ErrorBox>}

          <div className="flex gap-2 pt-2">
            <SecondaryButton type="button" onClick={onClose}>
              Отмена
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={busy}>
              {busy ? 'Сохраняем…' : 'Пополнить'}
            </PrimaryButton>
          </div>
        </form>
      </div>
    </div>
  )
}
