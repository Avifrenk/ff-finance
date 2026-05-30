// Чистые агрегаты для крипто-портфеля.
//
// FIFO детерминированный по (occurred_at asc, created_at asc, id asc).
// price_per_unit_base транзакций — единственный источник истины для cost
// basis и налогового отчёта. Цены из crypto_prices (CoinGecko) здесь НЕ
// используются — они только для UI «текущая стоимость».
//
// Тонкости:
//   * transfer_in/out НЕ создают лот и НЕ съедают лоты — это перемещение
//     между моими кошельками, FIFO их не должен трогать. На balance они
//     влияют (см. currentBalance).
//   * airdrop без цены трактуется как лот с pricePerUnit=0. Это правильно
//     для tax: gain при продаже = весь proceeds (получено бесплатно).
//   * fee на FIFO не влияет (комиссии в cost basis пока не включаем — см.
//     Открытые вопросы плана). На balance fee всегда минус.
//   * Если sell больше суммарного buy/airdrop — используем что есть и
//     ставим флаг inconsistent. UI пометит «недостаточно лотов».

import type { CryptoTransaction } from '../hooks/useCryptoTransactions'

// ---------------------------------------------------------------------------
// 1. Баланс холдинга в монете
// ---------------------------------------------------------------------------
// buy/transfer_in/airdrop — плюс; sell/transfer_out/fee — минус.
//
// Пример:
//   buy 1, buy 1, sell 1.5, fee 0.001 → 1 + 1 − 1.5 − 0.001 = 0.499
export function currentBalance(transactions: CryptoTransaction[]): number {
  let balance = 0
  for (const tx of transactions) {
    if (tx.kind === 'buy' || tx.kind === 'transfer_in' || tx.kind === 'airdrop') {
      balance += tx.amount
    } else {
      // sell, transfer_out, fee
      balance -= tx.amount
    }
  }
  return balance
}

// ---------------------------------------------------------------------------
// 2. Текущая стоимость в base_currency
// ---------------------------------------------------------------------------
// Если lastPriceInBase = null (цены ещё не подтянулись) — возвращаем null.
//
// Пример: balance=0.5, lastPrice=380_000 → 190_000.
export function currentValue(balance: number, lastPriceInBase: number | null): number | null {
  if (lastPriceInBase === null || !Number.isFinite(lastPriceInBase)) return null
  return balance * lastPriceInBase
}

// ---------------------------------------------------------------------------
// 3. FIFO cost basis
// ---------------------------------------------------------------------------
// Возвращает realizedPnl (сумма gain'ов по всем sell), remainingLots
// (что ещё не продано — для расчёта unrealized) и soldLots (для tax-отчёта:
// каждая запись — это «откушенный кусок лота» при продаже).

export interface Lot {
  txId: string
  acquiredAt: string
  amount: number
  pricePerUnitBase: number
}

export interface SoldLot {
  saleTxId: string
  soldAt: string
  lotTxId: string
  lotAcquiredAt: string
  amount: number
  costBasisPerUnit: number
  salePricePerUnit: number
  costBasis: number
  proceeds: number
  gain: number
}

export interface FifoResult {
  realizedPnl: number
  remainingLots: Lot[]
  soldLots: SoldLot[]
  /** sell не покрыт лотами (transfer_in без airdrop/buy перед продажей). */
  inconsistent: boolean
}

function sortFifo(transactions: CryptoTransaction[]): CryptoTransaction[] {
  return [...transactions].sort((a, b) => {
    if (a.occurred_at !== b.occurred_at) return a.occurred_at < b.occurred_at ? -1 : 1
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

// Численная погрешность: на ~10-significant-digits сравнение «равно» делаем с допуском.
const EPSILON = 1e-10

export function fifoCostBasis(transactions: CryptoTransaction[]): FifoResult {
  const sorted = sortFifo(transactions)
  const lots: Lot[] = []
  const soldLots: SoldLot[] = []
  let realizedPnl = 0
  let inconsistent = false

  for (const tx of sorted) {
    if (tx.kind === 'buy') {
      // price_per_unit_base гарантировано NOT NULL для buy через DB CHECK,
      // но защитимся.
      const price = tx.price_per_unit_base ?? 0
      lots.push({
        txId: tx.id,
        acquiredAt: tx.occurred_at,
        amount: tx.amount,
        pricePerUnitBase: price,
      })
    } else if (tx.kind === 'airdrop') {
      // Бесплатное получение → лот с нулевой стоимостью.
      // При продаже весь proceeds станет gain'ом — это корректно для tax.
      lots.push({
        txId: tx.id,
        acquiredAt: tx.occurred_at,
        amount: tx.amount,
        pricePerUnitBase: tx.price_per_unit_base ?? 0,
      })
    } else if (tx.kind === 'sell') {
      const salePrice = tx.price_per_unit_base ?? 0
      let remaining = tx.amount
      while (remaining > EPSILON) {
        const lot = lots[0]
        if (!lot) {
          inconsistent = true
          // Считаем gain как весь proceeds (cost = 0). Налогово консервативно —
          // в реальности пользователь должен ввести недостающий buy/airdrop.
          const proceeds = remaining * salePrice
          soldLots.push({
            saleTxId: tx.id,
            soldAt: tx.occurred_at,
            lotTxId: '',
            lotAcquiredAt: '',
            amount: remaining,
            costBasisPerUnit: 0,
            salePricePerUnit: salePrice,
            costBasis: 0,
            proceeds,
            gain: proceeds,
          })
          realizedPnl += proceeds
          break
        }
        const used = Math.min(lot.amount, remaining)
        const costBasis = used * lot.pricePerUnitBase
        const proceeds = used * salePrice
        const gain = proceeds - costBasis
        soldLots.push({
          saleTxId: tx.id,
          soldAt: tx.occurred_at,
          lotTxId: lot.txId,
          lotAcquiredAt: lot.acquiredAt,
          amount: used,
          costBasisPerUnit: lot.pricePerUnitBase,
          salePricePerUnit: salePrice,
          costBasis,
          proceeds,
          gain,
        })
        realizedPnl += gain
        lot.amount -= used
        remaining -= used
        if (lot.amount <= EPSILON) lots.shift()
      }
    }
    // transfer_in / transfer_out / fee — FIFO их не трогает.
  }

  return { realizedPnl, remainingLots: lots, soldLots, inconsistent }
}

// ---------------------------------------------------------------------------
// 4. Unrealized P&L
// ---------------------------------------------------------------------------
// По оставшимся лотам: (lastPrice − lotPrice) × amount. Если lastPrice
// null — возвращаем null (не «0»: 0 ≠ «нет данных»).
export function unrealizedPnl(remainingLots: Lot[], lastPriceInBase: number | null): number | null {
  if (lastPriceInBase === null || !Number.isFinite(lastPriceInBase)) return null
  let sum = 0
  for (const lot of remainingLots) {
    sum += (lastPriceInBase - lot.pricePerUnitBase) * lot.amount
  }
  return sum
}

// ---------------------------------------------------------------------------
// 5. Portfolio allocation
// ---------------------------------------------------------------------------
// Группируем по coin_id (один coin может быть на нескольких custodian).

export interface AllocationItem {
  coinId: string
  symbol: string
  balance: number
  valueBase: number
  share: number // 0..1
}

const ALLOCATION_MIN_VALUE = 0.01

export function portfolioAllocation(
  holdings: { id: string; coin_id: string }[],
  transactionsByHolding: Map<string, CryptoTransaction[]>,
  pricesByCoinId: Map<string, { price: number; asOf: string }>,
  coins: { id: string; symbol: string }[],
): { items: AllocationItem[]; totalValue: number } {
  const symbolByCoin = new Map(coins.map((c) => [c.id, c.symbol]))
  const balanceByCoin = new Map<string, number>()

  for (const h of holdings) {
    const txs = transactionsByHolding.get(h.id) ?? []
    const balance = currentBalance(txs)
    balanceByCoin.set(h.coin_id, (balanceByCoin.get(h.coin_id) ?? 0) + balance)
  }

  const items: AllocationItem[] = []
  let totalValue = 0
  for (const [coinId, balance] of balanceByCoin) {
    const price = pricesByCoinId.get(coinId)
    if (!price) continue
    const value = balance * price.price
    if (value < ALLOCATION_MIN_VALUE) continue
    items.push({
      coinId,
      symbol: symbolByCoin.get(coinId) ?? '?',
      balance,
      valueBase: value,
      share: 0, // заполним после
    })
    totalValue += value
  }
  for (const item of items) {
    item.share = totalValue > 0 ? item.valueBase / totalValue : 0
  }
  items.sort((a, b) => b.valueBase - a.valueBase)
  return { items, totalValue }
}

// ---------------------------------------------------------------------------
// 6. Налоговый отчёт за год
// ---------------------------------------------------------------------------
// Берём ВСЕ транзакции (нужны для FIFO), фильтруем soldLots по году продажи.
// totalGain = сумма gain (с убытками); taxAmount = 25% от max(totalGain, 0).
//
// Примеры (из плана):
//   buy 1 BTC @ 100k, buy 1 BTC @ 120k, sell 1.5 BTC @ 150k →
//     soldLots: [{used 1 @ cost 100k, sale 150k, gain 50k},
//                {used 0.5 @ cost 60k, sale 75k, gain 15k}]
//     totalGain = 65 000, taxAmount = 16 250.
//     remainingLots: [{amount 0.5, price 120k}]

export interface TaxYearReport {
  year: number
  sales: SoldLot[]
  totalGain: number
  totalLoss: number
  netGain: number
  taxAmount: number
  inconsistent: boolean
}

const TAX_RATE_IL_CAPITAL_GAINS = 0.25

function yearOf(isoTs: string): number {
  return Number(isoTs.slice(0, 4))
}

export function taxReportFor(year: number, transactions: CryptoTransaction[]): TaxYearReport {
  const fifo = fifoCostBasis(transactions)
  const sales = fifo.soldLots.filter((s) => yearOf(s.soldAt) === year)
  let totalGain = 0
  let totalLoss = 0
  for (const s of sales) {
    if (s.gain >= 0) totalGain += s.gain
    else totalLoss += s.gain // отрицательное
  }
  const netGain = totalGain + totalLoss
  const taxAmount = Math.max(netGain, 0) * TAX_RATE_IL_CAPITAL_GAINS
  return {
    year,
    sales,
    totalGain,
    totalLoss,
    netGain,
    taxAmount,
    inconsistent: fifo.inconsistent,
  }
}

// ---------------------------------------------------------------------------
// 7. Группировка транзакций по холдингу (helper для UI)
// ---------------------------------------------------------------------------
export function groupByHolding(transactions: CryptoTransaction[]): Map<string, CryptoTransaction[]> {
  const map = new Map<string, CryptoTransaction[]>()
  for (const tx of transactions) {
    const list = map.get(tx.holding_id) ?? []
    list.push(tx)
    map.set(tx.holding_id, list)
  }
  return map
}
