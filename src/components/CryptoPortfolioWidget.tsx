import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useCryptoCoins } from '../hooks/useCryptoCoins'
import { useCryptoHoldings } from '../hooks/useCryptoHoldings'
import { useCryptoTransactions } from '../hooks/useCryptoTransactions'
import { useCryptoPrices } from '../hooks/useCryptoPrices'
import {
  fifoCostBasis,
  groupByHolding,
  portfolioAllocation,
  unrealizedPnl,
} from '../lib/crypto'
import { CryptoDonut } from './CryptoDonut'
import { formatMoney } from '../lib/format'

interface Props {
  baseCurrency: string
}

type BaseQuote = 'ILS' | 'USD' | 'EUR'

function normalizeBase(code: string): BaseQuote {
  if (code === 'USD' || code === 'EUR') return code
  return 'ILS'
}

// Виджет крипто-портфеля на Dashboard. Если у пользователя нет холдингов —
// возвращает null (не рендерится). Крипта — личная сущность, не зависит
// от viewMode (личный/семейный — оба видят свой портфель одинаково).
export function CryptoPortfolioWidget({ baseCurrency }: Props) {
  const { coins } = useCryptoCoins()
  const { holdings } = useCryptoHoldings()
  const { transactions } = useCryptoTransactions()
  const { priceByCoinId } = useCryptoPrices(normalizeBase(baseCurrency))

  const txByHolding = useMemo(() => groupByHolding(transactions), [transactions])
  const allocation = useMemo(
    () => portfolioAllocation(holdings, txByHolding, priceByCoinId, coins),
    [holdings, txByHolding, priceByCoinId, coins],
  )

  const pnl = useMemo(() => {
    let realized = 0
    let unrealized: number | null = 0
    for (const h of holdings) {
      const txs = txByHolding.get(h.id) ?? []
      const fifo = fifoCostBasis(txs)
      realized += fifo.realizedPnl
      const price = priceByCoinId.get(h.coin_id)?.price ?? null
      const u = unrealizedPnl(fifo.remainingLots, price)
      if (u === null) {
        unrealized = null
      } else if (unrealized !== null) {
        unrealized += u
      }
    }
    return { realized, unrealized }
  }, [holdings, txByHolding, priceByCoinId])

  const pnlTotal = pnl.unrealized === null ? null : pnl.realized + pnl.unrealized

  if (holdings.length === 0) return null

  const pnlText =
    pnlTotal === null
      ? 'цены ещё не подтянулись'
      : `${pnlTotal >= 0 ? '+' : '−'}${formatMoney(Math.abs(pnlTotal), baseCurrency, 0).replace('−', '')}`

  const pnlColor =
    pnlTotal === null
      ? 'text-slate-500 dark:text-slate-400'
      : pnlTotal >= 0
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-rose-600 dark:text-rose-400'

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-5">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div>
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">🪙 Крипта</h2>
          <div className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
            {formatMoney(allocation.totalValue, baseCurrency, 0)}
          </div>
          <div className={`text-xs tabular-nums mt-0.5 ${pnlColor}`}>P&L: {pnlText}</div>
        </div>
        <Link
          to="/crypto"
          className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline shrink-0"
        >
          Подробнее →
        </Link>
      </div>
      {allocation.items.length > 0 && (
        <CryptoDonut
          items={allocation.items}
          totalValue={allocation.totalValue}
          baseCurrency={baseCurrency}
          size={120}
        />
      )}
    </section>
  )
}
