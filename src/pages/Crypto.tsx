import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../contexts/useApp'
import { useCryptoCoins } from '../hooks/useCryptoCoins'
import { useCryptoHoldings, type CryptoHolding } from '../hooks/useCryptoHoldings'
import { useCryptoTransactions } from '../hooks/useCryptoTransactions'
import { useCryptoPrices } from '../hooks/useCryptoPrices'
import {
  fifoCostBasis,
  groupByHolding,
  portfolioAllocation,
  unrealizedPnl,
} from '../lib/crypto'
import { CryptoHoldingCard } from '../components/CryptoHoldingCard'
import { CryptoDonut } from '../components/CryptoDonut'
import { NewHoldingDialog } from '../components/NewHoldingDialog'
import { CryptoTxDialog } from '../components/CryptoTxDialog'
import { PrimaryButton } from '../components/AuthControls'
import { formatMoney } from '../lib/format'

type BaseQuote = 'ILS' | 'USD' | 'EUR'

function normalizeBase(code: string): BaseQuote {
  if (code === 'USD' || code === 'EUR') return code
  return 'ILS'
}

export function Crypto() {
  const { household } = useApp()
  const baseCurrency = household?.base_currency ?? 'ILS'
  const base = normalizeBase(baseCurrency)

  const { coins } = useCryptoCoins()
  const { holdings, loading: holdingsLoading, remove } = useCryptoHoldings()
  const { transactions, remove: removeTx } = useCryptoTransactions()
  const { priceByCoinId } = useCryptoPrices(base)

  const [newHoldingOpen, setNewHoldingOpen] = useState(false)
  const [txDialogOpen, setTxDialogOpen] = useState(false)
  const [txHolding, setTxHolding] = useState<CryptoHolding | undefined>(undefined)

  const txByHolding = useMemo(() => groupByHolding(transactions), [transactions])

  // Аллокация портфеля + общий unrealized + realized.
  const allocation = useMemo(
    () => portfolioAllocation(holdings, txByHolding, priceByCoinId, coins),
    [holdings, txByHolding, priceByCoinId, coins],
  )

  // realized + unrealized по всем холдингам сразу.
  const overallPnl = useMemo(() => {
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

  const pnlTotal =
    overallPnl.unrealized === null ? null : overallPnl.realized + overallPnl.unrealized

  // Процент — только по нереализованной части (текущая стоимость vs cost basis
  // оставшихся лотов). Реализованный P&L относится к УЖЕ продаваемым лотам,
  // у них своя «база», смешивать в один процент некорректно.
  const unrealizedPercent = useMemo(() => {
    if (overallPnl.unrealized === null) return null
    const costBasisOfRemaining = allocation.totalValue - overallPnl.unrealized
    if (costBasisOfRemaining <= 0) return null
    return (overallPnl.unrealized / costBasisOfRemaining) * 100
  }, [overallPnl.unrealized, allocation.totalValue])

  // Сортированные транзакции для ленты (desc по дате).
  const txFeed = useMemo(
    () =>
      [...transactions].sort((a, b) =>
        a.occurred_at > b.occurred_at ? -1 : a.occurred_at < b.occurred_at ? 1 : 0,
      ),
    [transactions],
  )

  if (!household) return null

  const isEmpty = !holdingsLoading && holdings.length === 0

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Крипта</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Личный портфель — партнёр не видит ни одной строки.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/crypto/tax"
            className="text-sm px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Налоговый отчёт →
          </Link>
        </div>
      </header>

      {isEmpty && (
        <section className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center">
          <div className="text-4xl mb-2">🪙</div>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
            Пока ни одной монеты. Добавьте холдинг (где у вас лежит крипта) и первые операции —
            увидите портфель и P&L.
          </p>
          <div className="flex justify-center">
            <div className="w-44">
              <PrimaryButton onClick={() => setNewHoldingOpen(true)}>+ Холдинг</PrimaryButton>
            </div>
          </div>
        </section>
      )}

      {!isEmpty && (
        <>
          <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-6">
            <div className="flex items-baseline justify-between gap-3 flex-wrap mb-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
                  Стоимость портфеля
                </div>
                <div className="text-3xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  {formatMoney(allocation.totalValue, baseCurrency, 0)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
                  P&L (realized + unrealized)
                </div>
                <div
                  className={`text-base font-medium tabular-nums ${
                    pnlTotal === null
                      ? 'text-slate-500 dark:text-slate-400'
                      : pnlTotal >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {pnlTotal === null
                    ? 'цены ещё не подтянулись'
                    : `${pnlTotal >= 0 ? '+' : '−'}${formatMoney(Math.abs(pnlTotal), baseCurrency, 0).replace('−', '')}`}
                  {unrealizedPercent !== null && (
                    <span className="text-xs text-slate-500 dark:text-slate-400 ml-1" title="Нереализованная доходность от cost basis оставшихся лотов">
                      ({unrealizedPercent >= 0 ? '+' : ''}
                      {unrealizedPercent.toFixed(1)}% unrealized)
                    </span>
                  )}
                </div>
              </div>
            </div>
            {allocation.items.length > 0 && (
              <CryptoDonut
                items={allocation.items}
                totalValue={allocation.totalValue}
                baseCurrency={baseCurrency}
              />
            )}
          </section>

          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Холдинги</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setNewHoldingOpen(true)}
                className="text-sm px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                + Холдинг
              </button>
              <button
                onClick={() => {
                  setTxHolding(undefined)
                  setTxDialogOpen(true)
                }}
                className="text-sm px-3 py-1.5 rounded-md bg-indigo-500 hover:bg-indigo-600 text-white transition-colors"
              >
                + Операция
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {holdings.map((h) => {
              const txs = txByHolding.get(h.id) ?? []
              const coin = coins.find((c) => c.id === h.coin_id)
              const price = priceByCoinId.get(h.coin_id)?.price ?? null
              return (
                <CryptoHoldingCard
                  key={h.id}
                  holding={h}
                  coin={coin}
                  transactions={txs}
                  lastPriceInBase={price}
                  baseCurrency={baseCurrency}
                  onAddTx={() => {
                    setTxHolding(h)
                    setTxDialogOpen(true)
                  }}
                  onDelete={async () => {
                    if (
                      confirm(
                        `Удалить холдинг ${coin?.symbol ?? '?'} на ${h.custodian}? У него нет операций — удаление безопасно.`,
                      )
                    ) {
                      await remove(h.id)
                    }
                  }}
                />
              )
            })}
          </div>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">
              Лента операций
            </h2>
            {txFeed.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Пока ни одной операции.</p>
            ) : (
              <ul className="space-y-1.5">
                {txFeed.map((tx) => {
                  const h = holdings.find((x) => x.id === tx.holding_id)
                  const coin = coins.find((c) => c.id === h?.coin_id)
                  const symbol = coin?.symbol ?? '?'
                  return (
                    <li
                      key={tx.id}
                      className="flex items-center gap-3 text-sm py-2 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/40"
                    >
                      <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums w-24 shrink-0">
                        {formatDateTime(tx.occurred_at)}
                      </span>
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400 w-24 shrink-0">
                        {kindLabel(tx.kind)}
                      </span>
                      <span className="flex-1 min-w-0 truncate text-slate-900 dark:text-slate-100">
                        {tx.amount} {symbol}
                        {tx.price_per_unit_base !== null && (
                          <span className="text-slate-500 dark:text-slate-400">
                            {' '}
                            @ {formatMoney(tx.price_per_unit_base, baseCurrency, 0)}
                          </span>
                        )}
                        {tx.note && (
                          <span className="text-slate-500 dark:text-slate-400"> · {tx.note}</span>
                        )}
                      </span>
                      <button
                        onClick={async () => {
                          if (confirm(`Удалить операцию ${kindLabel(tx.kind)} ${tx.amount} ${symbol}?`)) {
                            await removeTx(tx.id)
                          }
                        }}
                        className="text-xs text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 shrink-0"
                        title="Удалить операцию"
                      >
                        ✕
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </>
      )}

      <NewHoldingDialog open={newHoldingOpen} onClose={() => setNewHoldingOpen(false)} />
      <CryptoTxDialog
        open={txDialogOpen}
        onClose={() => setTxDialogOpen(false)}
        holding={txHolding}
      />
    </div>
  )
}

function kindLabel(kind: string): string {
  switch (kind) {
    case 'buy':
      return 'Купил'
    case 'sell':
      return 'Продал'
    case 'transfer_in':
      return 'Перевод +'
    case 'transfer_out':
      return 'Перевод −'
    case 'fee':
      return 'Комиссия'
    case 'airdrop':
      return 'Airdrop'
    default:
      return kind
  }
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}
