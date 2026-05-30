import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../contexts/useApp'
import { useCryptoCoins } from '../hooks/useCryptoCoins'
import { useCryptoHoldings } from '../hooks/useCryptoHoldings'
import { useCryptoTransactions } from '../hooks/useCryptoTransactions'
import { fifoCostBasis, taxReportFor, type SoldLot } from '../lib/crypto'
import { formatMoney } from '../lib/format'

// Доступные годы: от 2020 до текущего (включительно).
function availableYears(): number[] {
  const current = new Date().getFullYear()
  const years: number[] = []
  for (let y = current; y >= 2020; y--) years.push(y)
  return years
}

function yearOf(iso: string): number {
  return Number(iso.slice(0, 4))
}

export function CryptoTax() {
  const { household } = useApp()
  const baseCurrency = household?.base_currency ?? 'ILS'
  const { coins } = useCryptoCoins()
  const { holdings } = useCryptoHoldings()
  const { transactions } = useCryptoTransactions()

  const [year, setYear] = useState<number>(new Date().getFullYear())

  const coinByHolding = useMemo(() => {
    const map = new Map<string, { symbol: string }>()
    for (const h of holdings) {
      const c = coins.find((x) => x.id === h.coin_id)
      if (c) map.set(h.id, { symbol: c.symbol })
    }
    return map
  }, [holdings, coins])

  // По годам: для каждого года, в котором были продажи, считаем отдельный
  // отчёт. Это нужно и для главной таблицы, и для секции «По годам».
  const yearlyReports = useMemo(() => {
    const yearsWithSales = new Set<number>()
    for (const tx of transactions) {
      if (tx.kind === 'sell') yearsWithSales.add(yearOf(tx.occurred_at))
    }
    const sorted = [...yearsWithSales].sort((a, b) => b - a)
    return sorted.map((y) => taxReportFor(y, transactions))
  }, [transactions])

  const report = useMemo(() => taxReportFor(year, transactions), [year, transactions])

  // Транзакции с inconsistency — нужно для баннера.
  const fifoAll = useMemo(() => fifoCostBasis(transactions), [transactions])

  if (!household) return null

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            Налоговый отчёт по криптовалюте
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Израиль, Capital Gains Tax — 25% от прибыли. FIFO по дате
            покупки (occurred_at, затем created_at).
          </p>
        </div>
        <Link
          to="/crypto"
          className="text-sm px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          ← К портфелю
        </Link>
      </header>

      {fifoAll.inconsistent && (
        <div className="rounded-2xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm text-amber-800 dark:text-amber-200">
          ⚠ В одной или нескольких продажах не хватило исторических покупок.
          Проверьте, все ли buy/airdrop загружены. Сейчас недостающие лоты
          считаются с cost basis = 0 (gain = весь proceeds — это
          консервативная завышенная оценка налога).
        </div>
      )}

      <div className="flex items-center gap-3">
        <label className="text-sm text-slate-700 dark:text-slate-300">Год:</label>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-colors"
        >
          {availableYears().map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          title="Прибыль"
          value={formatMoney(report.totalGain, baseCurrency, 0)}
          tone={report.totalGain > 0 ? 'positive' : 'neutral'}
        />
        <StatCard
          title="Убытки"
          value={formatMoney(report.totalLoss, baseCurrency, 0)}
          tone={report.totalLoss < 0 ? 'negative' : 'neutral'}
        />
        <StatCard
          title={`Налог (25% от ${formatMoney(Math.max(report.netGain, 0), baseCurrency, 0)})`}
          value={formatMoney(report.taxAmount, baseCurrency, 0)}
          tone={report.taxAmount > 0 ? 'warning' : 'neutral'}
        />
      </section>

      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">
            Продажи за {year}
          </h2>
          {report.sales.length > 0 && (
            <button
              onClick={() => downloadCsv(report.sales, year, coinByHolding, transactions)}
              className="text-sm px-3 py-1.5 rounded-md bg-indigo-500 hover:bg-indigo-600 text-white transition-colors"
            >
              ⤓ Экспорт CSV
            </button>
          )}
        </div>

        {report.sales.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            За {year} продаж не было. Налог считать не с чего.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left py-2 pr-3 font-medium">Куплено</th>
                  <th className="text-left py-2 pr-3 font-medium">Продано</th>
                  <th className="text-left py-2 pr-3 font-medium">Монета</th>
                  <th className="text-right py-2 pr-3 font-medium">Кол-во</th>
                  <th className="text-right py-2 pr-3 font-medium">Cost basis</th>
                  <th className="text-right py-2 pr-3 font-medium">Proceeds</th>
                  <th className="text-right py-2 font-medium">Gain</th>
                </tr>
              </thead>
              <tbody>
                {report.sales.map((s, i) => {
                  const symbol = coinSymbolForSale(s, transactions, coinByHolding)
                  return (
                    <tr
                      key={`${s.saleTxId}-${s.lotTxId}-${i}`}
                      className="border-b border-slate-100 dark:border-slate-800/60 last:border-0"
                    >
                      <td className="py-2 pr-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {s.lotAcquiredAt ? formatDateShort(s.lotAcquiredAt) : '—'}
                      </td>
                      <td className="py-2 pr-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {formatDateShort(s.soldAt)}
                      </td>
                      <td className="py-2 pr-3 font-medium text-slate-900 dark:text-slate-100">
                        {symbol}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{s.amount.toFixed(8).replace(/\.?0+$/, '')}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                        {formatMoney(s.costBasis, baseCurrency, 0)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                        {formatMoney(s.proceeds, baseCurrency, 0)}
                      </td>
                      <td
                        className={`py-2 text-right tabular-nums font-medium ${
                          s.gain >= 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {formatMoney(s.gain, baseCurrency, 0)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 dark:border-slate-600">
                  <td colSpan={6} className="py-2 text-right text-sm font-medium text-slate-700 dark:text-slate-300">
                    Итого gain:
                  </td>
                  <td
                    className={`py-2 text-right tabular-nums font-semibold ${
                      report.netGain >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {formatMoney(report.netGain, baseCurrency, 0)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={6} className="py-1 text-right text-sm font-medium text-slate-700 dark:text-slate-300">
                    К уплате (25%):
                  </td>
                  <td className="py-1 text-right tabular-nums font-semibold text-amber-600 dark:text-amber-400">
                    {formatMoney(report.taxAmount, baseCurrency, 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {yearlyReports.length > 1 && (
        <details className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-900/40">
          <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-slate-700 dark:text-slate-300">
            По годам ({yearlyReports.length})
          </summary>
          <div className="p-4 border-t border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left py-2 font-medium">Год</th>
                  <th className="text-right py-2 font-medium">Net gain</th>
                  <th className="text-right py-2 font-medium">Налог</th>
                </tr>
              </thead>
              <tbody>
                {yearlyReports.map((r) => (
                  <tr key={r.year} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                    <td className="py-2">
                      <button
                        onClick={() => setYear(r.year)}
                        className="text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        {r.year}
                      </button>
                    </td>
                    <td
                      className={`py-2 text-right tabular-nums ${
                        r.netGain >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {formatMoney(r.netGain, baseCurrency, 0)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-amber-600 dark:text-amber-400">
                      {formatMoney(r.taxAmount, baseCurrency, 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  )
}

function StatCard({
  title,
  value,
  tone,
}: {
  title: string
  value: string
  tone: 'positive' | 'negative' | 'warning' | 'neutral'
}) {
  const toneClass = {
    positive: 'text-emerald-600 dark:text-emerald-400',
    negative: 'text-rose-600 dark:text-rose-400',
    warning: 'text-amber-600 dark:text-amber-400',
    neutral: 'text-slate-900 dark:text-slate-100',
  }[tone]
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
        {title}
      </div>
      <div className={`text-lg font-semibold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  )
}

function coinSymbolForSale(
  sale: SoldLot,
  transactions: { id: string; holding_id: string }[],
  coinByHolding: Map<string, { symbol: string }>,
): string {
  const saleTx = transactions.find((t) => t.id === sale.saleTxId)
  if (!saleTx) return '?'
  return coinByHolding.get(saleTx.holding_id)?.symbol ?? '?'
}

function formatDateShort(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
}

// -----------------------------------------------------------------------
// CSV-экспорт
// -----------------------------------------------------------------------
// Формат: purchase_date, sale_date, coin_symbol, amount, cost_basis,
// proceeds, gain, tax_due. Поля в кавычках, разделитель — запятая,
// десятичная точка. Excel/Numbers/Google Sheets откроют корректно.

function csvField(v: string | number): string {
  const s = String(v)
  if (s.includes('"') || s.includes(',') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function isoDate(iso: string): string {
  return iso.slice(0, 10)
}

function downloadCsv(
  sales: SoldLot[],
  year: number,
  coinByHolding: Map<string, { symbol: string }>,
  transactions: { id: string; holding_id: string }[],
): void {
  const header = [
    'purchase_date',
    'sale_date',
    'coin_symbol',
    'amount',
    'cost_basis',
    'proceeds',
    'gain',
    'tax_due_25pct',
  ]
  const rows = sales.map((s) => {
    const symbol = coinSymbolForSale(s, transactions, coinByHolding)
    const taxDue = s.gain > 0 ? s.gain * 0.25 : 0
    return [
      s.lotAcquiredAt ? isoDate(s.lotAcquiredAt) : '',
      isoDate(s.soldAt),
      symbol,
      s.amount.toFixed(10).replace(/\.?0+$/, ''),
      s.costBasis.toFixed(2),
      s.proceeds.toFixed(2),
      s.gain.toFixed(2),
      taxDue.toFixed(2),
    ].map(csvField).join(',')
  })
  const csv = [header.join(','), ...rows].join('\n')
  // UTF-8 BOM — чтобы Excel правильно понял кодировку.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `crypto-tax-${year}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
