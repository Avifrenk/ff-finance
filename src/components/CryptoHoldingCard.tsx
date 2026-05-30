import { useMemo } from 'react'
import type { CryptoHolding } from '../hooks/useCryptoHoldings'
import type { CryptoTransaction } from '../hooks/useCryptoTransactions'
import type { CryptoCoin } from '../hooks/useCryptoCoins'
import { currentBalance, currentValue, fifoCostBasis, unrealizedPnl } from '../lib/crypto'
import { formatMoney } from '../lib/format'

interface Props {
  holding: CryptoHolding
  coin: CryptoCoin | undefined
  transactions: CryptoTransaction[]
  lastPriceInBase: number | null
  baseCurrency: string
  onAddTx: () => void
  onDelete: () => void
}

export function CryptoHoldingCard({
  holding,
  coin,
  transactions,
  lastPriceInBase,
  baseCurrency,
  onAddTx,
  onDelete,
}: Props) {
  const balance = useMemo(() => currentBalance(transactions), [transactions])
  const value = currentValue(balance, lastPriceInBase)
  const fifo = useMemo(() => fifoCostBasis(transactions), [transactions])
  const unrealized = unrealizedPnl(fifo.remainingLots, lastPriceInBase)

  const symbol = coin?.symbol ?? '?'
  const name = coin?.name ?? 'Unknown'
  const icon = coin?.icon ?? '🪙'
  const decimals = coin?.decimals ?? 8

  const pnlColor =
    unrealized === null
      ? 'text-slate-500 dark:text-slate-400'
      : unrealized >= 0
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-rose-600 dark:text-rose-400'

  const isEmpty = transactions.length === 0

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-5">
      <div className="flex items-start gap-3">
        <div
          className="h-10 w-10 rounded-xl flex items-center justify-center text-xl shrink-0 bg-slate-100 dark:bg-slate-800"
          aria-hidden
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {symbol}
            </h3>
            <span className="text-sm text-slate-500 dark:text-slate-400 truncate">{name}</span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
            {holding.custodian}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-base font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
            {value === null ? '—' : formatMoney(value, baseCurrency, 0)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {formatBalance(balance, decimals)} {symbol}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className={`text-xs tabular-nums ${pnlColor}`}>
          {formatPnl(unrealized, baseCurrency)}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onAddTx}
            className="text-xs px-2.5 py-1 rounded-md bg-indigo-500 hover:bg-indigo-600 text-white transition-colors"
          >
            + Операция
          </button>
          {isEmpty && (
            <button
              onClick={onDelete}
              className="text-xs px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
              title="Удалить пустой холдинг"
            >
              Удалить
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

function formatBalance(balance: number, decimals: number): string {
  // Округление до decimals знаков, но без trailing-нулей.
  const fixed = balance.toFixed(Math.min(decimals, 8))
  const trimmed = fixed.replace(/\.?0+$/, '')
  return trimmed || '0'
}

function formatPnl(pnl: number | null, baseCurrency: string): string {
  if (pnl === null) return 'P&L: цены ещё не подтянулись'
  const sign = pnl >= 0 ? '+' : '−'
  return `P&L: ${sign}${formatMoney(Math.abs(pnl), baseCurrency, 0).replace('−', '')}`
}
