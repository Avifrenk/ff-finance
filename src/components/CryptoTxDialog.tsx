import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useCryptoHoldings, type CryptoHolding } from '../hooks/useCryptoHoldings'
import { useCryptoCoins } from '../hooks/useCryptoCoins'
import { useCryptoTransactions, type CryptoTxKind } from '../hooks/useCryptoTransactions'
import { useCryptoPrices } from '../hooks/useCryptoPrices'
import { useApp } from '../contexts/useApp'
import { AuthInput, ErrorBox, PrimaryButton, SecondaryButton } from './AuthControls'
import { currencySymbol } from '../lib/format'

interface Props {
  open: boolean
  onClose: () => void
  /** Если задан — диалог запоминает этот холдинг и не показывает селектор. */
  holding?: CryptoHolding
}

const KIND_OPTIONS: { value: CryptoTxKind; label: string; hint: string }[] = [
  { value: 'buy', label: 'Покупка', hint: 'купил за фиат — нужна цена' },
  { value: 'sell', label: 'Продажа', hint: 'продал в фиат — нужна цена' },
  { value: 'transfer_in', label: 'Перевод сюда', hint: 'с другого моего кошелька' },
  { value: 'transfer_out', label: 'Перевод отсюда', hint: 'на другой мой кошелёк' },
  { value: 'fee', label: 'Комиссия', hint: 'списание сети/биржи в монете' },
  { value: 'airdrop', label: 'Airdrop', hint: 'получил бесплатно' },
]

function priceRequired(kind: CryptoTxKind): boolean {
  return kind === 'buy' || kind === 'sell'
}

function nowLocalIso(): string {
  // datetime-local ожидает 'YYYY-MM-DDTHH:mm' (без секунд).
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function CryptoTxDialog({ open, onClose, holding }: Props) {
  const { household } = useApp()
  const baseCurrency = household?.base_currency ?? 'ILS'
  const { coins } = useCryptoCoins()
  const { holdings } = useCryptoHoldings()
  const { create } = useCryptoTransactions()
  const { priceByCoinId } = useCryptoPrices(baseCurrency as 'ILS' | 'USD' | 'EUR')

  const [holdingId, setHoldingId] = useState<string>('')
  const [kind, setKind] = useState<CryptoTxKind>('buy')
  const [amount, setAmount] = useState('')
  const [price, setPrice] = useState('')
  const [fee, setFee] = useState('')
  const [occurredAt, setOccurredAt] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /* eslint-disable react-hooks/set-state-in-effect --
     form-reset при открытии. */
  useEffect(() => {
    if (!open) return
    setHoldingId(holding?.id ?? holdings[0]?.id ?? '')
    setKind('buy')
    setAmount('')
    setPrice('')
    setFee('')
    setOccurredAt(nowLocalIso())
    setNote('')
    setError(null)
  }, [open, holding, holdings])
  /* eslint-enable react-hooks/set-state-in-effect */

  const selectedHolding = useMemo(
    () => holdings.find((h) => h.id === holdingId),
    [holdings, holdingId],
  )

  const lastPriceHint = useMemo(() => {
    if (!selectedHolding) return null
    return priceByCoinId.get(selectedHolding.coin_id) ?? null
  }, [selectedHolding, priceByCoinId])

  const coinForHolding = useMemo(
    () => coins.find((c) => c.id === selectedHolding?.coin_id),
    [coins, selectedHolding],
  )

  if (!open) return null

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!holdingId) {
      setError('Выберите холдинг')
      return
    }
    const amountNum = Number(amount.replace(',', '.'))
    if (!isFinite(amountNum) || amountNum <= 0) {
      setError('Количество должно быть положительным числом')
      return
    }
    let priceNum: number | null = null
    if (priceRequired(kind)) {
      priceNum = Number(price.replace(',', '.'))
      if (!isFinite(priceNum) || priceNum <= 0) {
        setError(`Для ${kind === 'buy' ? 'покупки' : 'продажи'} нужна цена за единицу`)
        return
      }
    } else if (price.trim()) {
      const p = Number(price.replace(',', '.'))
      priceNum = isFinite(p) && p > 0 ? p : null
    }
    let feeNum = 0
    if (fee.trim()) {
      feeNum = Number(fee.replace(',', '.'))
      if (!isFinite(feeNum) || feeNum < 0) {
        setError('Комиссия должна быть неотрицательным числом')
        return
      }
    }
    if (!occurredAt) {
      setError('Укажите дату и время')
      return
    }

    setBusy(true)
    try {
      await create({
        holding_id: holdingId,
        kind,
        amount: amountNum,
        price_per_unit_base: priceNum,
        fee_base: feeNum,
        occurred_at: new Date(occurredAt).toISOString(),
        note: note.trim() || null,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить операцию')
    } finally {
      setBusy(false)
    }
  }

  const symbol = currencySymbol(baseCurrency)

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
            Новая операция
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 text-xl leading-none"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {!holding && (
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Холдинг
              </label>
              <select
                value={holdingId}
                onChange={(e) => setHoldingId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-colors"
                required
              >
                {holdings.map((h) => {
                  const c = coins.find((x) => x.id === h.coin_id)
                  return (
                    <option key={h.id} value={h.id}>
                      {c?.symbol ?? '?'} · {h.custodian}
                    </option>
                  )
                })}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Тип операции
            </label>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as CryptoTxKind)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-colors"
            >
              {KIND_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} — {opt.hint}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Количество ({coinForHolding?.symbol ?? 'монеты'})
            </label>
            <AuthInput
              type="text"
              inputMode="decimal"
              placeholder="0.0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Цена за 1 {coinForHolding?.symbol ?? 'монету'} в {symbol}
              {priceRequired(kind) ? ' *' : ' (необязательно)'}
            </label>
            <AuthInput
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required={priceRequired(kind)}
            />
            {lastPriceHint && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Последняя цена CoinGecko: {lastPriceHint.price.toLocaleString('ru-RU')} {symbol}
                <button
                  type="button"
                  onClick={() => setPrice(String(lastPriceHint.price))}
                  className="ml-2 text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  использовать
                </button>
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Комиссия в {symbol} (необязательно)
            </label>
            <AuthInput
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Когда
            </label>
            <AuthInput
              type="datetime-local"
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
              placeholder="Например: купил на просадке"
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
              {busy ? 'Сохраняем…' : 'Создать операцию'}
            </PrimaryButton>
          </div>
        </form>
      </div>
    </div>
  )
}
