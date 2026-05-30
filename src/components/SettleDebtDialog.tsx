import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useAccounts } from '../hooks/useAccounts'
import { useTransfers } from '../hooks/useTransfers'
import { useFxRates } from '../hooks/useFxRates'
import type { DebtSummary } from '../lib/debts'
import { AuthInput, ErrorBox, PrimaryButton, SecondaryButton } from './AuthControls'
import { convertMoney } from '../lib/fx'
import { formatMoney } from '../lib/format'

interface Props {
  open: boolean
  onClose: () => void
  summary: DebtSummary
  baseCurrency: string
}

function todayLocalDate(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Диалог «Погасить долг».
// from = личный счёт debtor'а; to = личный счёт creditor'а. Дефолт — первый
// найденный personal-счёт каждого. Если у кого-то нет personal-счёта —
// баннер «создайте personal-счёт в Настройках».
export function SettleDebtDialog({ open, onClose, summary, baseCurrency }: Props) {
  const { accounts } = useAccounts()
  const { create } = useTransfers()
  const { ratesByDate } = useFxRates()

  const debtorAccounts = useMemo(
    () => accounts.filter((a) => a.visibility === 'personal' && a.owner_profile_id === summary.fromProfileId),
    [accounts, summary.fromProfileId],
  )
  const creditorAccounts = useMemo(
    () => accounts.filter((a) => a.visibility === 'personal' && a.owner_profile_id === summary.toProfileId),
    [accounts, summary.toProfileId],
  )

  const [fromAccountId, setFromAccountId] = useState<string>('')
  const [toAccountId, setToAccountId] = useState<string>('')
  const [amount, setAmount] = useState('')
  const [toAmount, setToAmount] = useState('')
  const [occurredAt, setOccurredAt] = useState('')
  const [note, setNote] = useState('Погашение долга')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /* eslint-disable react-hooks/set-state-in-effect --
     form-reset при открытии. */
  useEffect(() => {
    if (!open) return
    const defaultFrom = debtorAccounts[0]
    const defaultTo = creditorAccounts[0]
    setFromAccountId(defaultFrom?.id ?? '')
    setToAccountId(defaultTo?.id ?? '')
    // Дефолтная сумма — в валюте from-счёта. summary.amount в base_currency,
    // конвертируем при необходимости (через сегодняшний курс ECB).
    let defaultAmount = summary.amount
    if (defaultFrom && defaultFrom.currency !== baseCurrency) {
      const conv = convertMoney(summary.amount, baseCurrency, defaultFrom.currency, ratesByDate)
      if (conv !== null) defaultAmount = conv
    }
    setAmount(defaultAmount.toFixed(2))
    // Дефолтная сумма зачисления (для cross-currency) — та же сумма из summary
    // в валюте to-счёта.
    if (defaultTo && defaultFrom && defaultFrom.currency !== defaultTo.currency) {
      const convTo = convertMoney(summary.amount, baseCurrency, defaultTo.currency, ratesByDate)
      setToAmount(convTo !== null ? convTo.toFixed(2) : '')
    } else {
      setToAmount('')
    }
    setOccurredAt(todayLocalDate())
    setNote('Погашение долга')
    setError(null)
  }, [open, debtorAccounts, creditorAccounts, summary.amount, baseCurrency, ratesByDate])
  /* eslint-enable react-hooks/set-state-in-effect */

  const fromAccount = useMemo(
    () => debtorAccounts.find((a) => a.id === fromAccountId),
    [debtorAccounts, fromAccountId],
  )
  const toAccount = useMemo(
    () => creditorAccounts.find((a) => a.id === toAccountId),
    [creditorAccounts, toAccountId],
  )

  const crossCurrency = !!fromAccount && !!toAccount && fromAccount.currency !== toAccount.currency

  if (!open) return null

  const noDebtorAccount = debtorAccounts.length === 0
  const noCreditorAccount = creditorAccounts.length === 0

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!fromAccountId || !toAccountId) {
      setError('Выберите счета отправителя и получателя')
      return
    }
    const amountNum = Number(amount.replace(',', '.'))
    if (!isFinite(amountNum) || amountNum <= 0) {
      setError('Сумма должна быть положительной')
      return
    }
    let toAmountNum: number | null = null
    if (crossCurrency) {
      toAmountNum = Number(toAmount.replace(',', '.'))
      if (!isFinite(toAmountNum) || toAmountNum <= 0) {
        setError('При разных валютах укажите, сколько фактически пришло на счёт получателя')
        return
      }
    }
    if (!occurredAt) {
      setError('Укажите дату')
      return
    }
    setBusy(true)
    try {
      await create({
        from_account_id: fromAccountId,
        to_account_id: toAccountId,
        amount: amountNum,
        occurred_at: occurredAt,
        note: note.trim() || null,
        to_amount: toAmountNum,
        is_debt_settlement: true,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать перевод')
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
            Погасить долг
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 text-xl leading-none"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <div className="text-sm text-slate-600 dark:text-slate-300 mb-4">
          {summary.fromName} переводит {summary.toName} в счёт долга{' '}
          <span className="font-semibold">{formatMoney(summary.amount, baseCurrency, 0)}</span>.
        </div>

        {(noDebtorAccount || noCreditorAccount) && (
          <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-800 dark:text-amber-200 mb-4">
            ⚠ {noDebtorAccount ? `У ${summary.fromName} нет personal-счёта.` : ''}{' '}
            {noCreditorAccount ? `У ${summary.toName} нет personal-счёта.` : ''}{' '}
            Создайте недостающие счета в{' '}
            <a href="/settings" className="underline">
              Настройках
            </a>
            .
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              С какого счёта ({summary.fromName})
            </label>
            <select
              value={fromAccountId}
              onChange={(e) => setFromAccountId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-colors"
              disabled={noDebtorAccount}
              required
            >
              {debtorAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              На какой счёт ({summary.toName})
            </label>
            <select
              value={toAccountId}
              onChange={(e) => setToAccountId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-colors"
              disabled={noCreditorAccount}
              required
            >
              {creditorAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Сумма {fromAccount ? `(${fromAccount.currency})` : ''}
            </label>
            <AuthInput
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              className="text-xl font-semibold text-center"
            />
          </div>

          {crossCurrency && (
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Сколько пришло на счёт получателя ({toAccount?.currency})
              </label>
              <AuthInput
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={toAmount}
                onChange={(e) => setToAmount(e.target.value)}
                required={crossCurrency}
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Разные валюты счетов — банк/биржа уже сконвертировали сумму. Введите фактическое зачисление.
              </p>
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
              Комментарий
            </label>
            <AuthInput
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {error && <ErrorBox>{error}</ErrorBox>}

          <div className="flex gap-2 pt-2">
            <SecondaryButton type="button" onClick={onClose}>
              Отмена
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={busy || noDebtorAccount || noCreditorAccount}>
              {busy ? 'Создаём…' : 'Погасить'}
            </PrimaryButton>
          </div>
        </form>
      </div>
    </div>
  )
}
