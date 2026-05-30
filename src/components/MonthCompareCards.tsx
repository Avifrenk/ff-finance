import { formatMoney } from '../lib/format'
import type { MonthTotals } from '../lib/aggregate'

interface Props {
  current: MonthTotals
  previous: MonthTotals
  /** Есть ли вообще операции за прошлый месяц (хоть одна, любого kind). */
  previousHasData: boolean
  baseCurrency: string
}

/**
 * Две карточки: текущий период (income / expense / net) и предыдущий, плюс
 * дельта между ними. Дельта расхода положительная (стало больше) → красная,
 * отрицательная → зелёная; для дохода — наоборот.
 *
 * Edge case: previousHasData=false → дельту не считаем, пишем «нет данных».
 */
export function MonthCompareCards({ current, previous, previousHasData, baseCurrency }: Props) {
  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Card title="Этот период" totals={current} baseCurrency={baseCurrency} />
      <Card
        title="Прошлый период"
        totals={previous}
        baseCurrency={baseCurrency}
        muted={!previousHasData}
        emptyHint={!previousHasData ? 'Нет данных за прошлый период' : undefined}
      />

      <div className="sm:col-span-2 grid grid-cols-3 gap-3">
        <Delta
          label="Доход"
          current={current.income}
          previous={previous.income}
          previousHasData={previousHasData}
          baseCurrency={baseCurrency}
          // У дохода рост — это хорошо.
          positiveIsGood
        />
        <Delta
          label="Расход"
          current={current.expense}
          previous={previous.expense}
          previousHasData={previousHasData}
          baseCurrency={baseCurrency}
        />
        <Delta
          label="Итог"
          current={current.net}
          previous={previous.net}
          previousHasData={previousHasData}
          baseCurrency={baseCurrency}
          positiveIsGood
        />
      </div>
    </section>
  )
}

function Card({
  title,
  totals,
  baseCurrency,
  muted,
  emptyHint,
}: {
  title: string
  totals: MonthTotals
  baseCurrency: string
  muted?: boolean
  emptyHint?: string
}) {
  const netColor =
    totals.net > 0
      ? 'text-emerald-600 dark:text-emerald-400'
      : totals.net < 0
        ? 'text-rose-600 dark:text-rose-400'
        : 'text-slate-900 dark:text-slate-100'
  return (
    <div
      className={`rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-5 ${
        muted ? 'opacity-70' : ''
      }`}
    >
      <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {title}
      </div>
      {emptyHint ? (
        <div className="text-sm text-slate-500 dark:text-slate-400 mt-2">{emptyHint}</div>
      ) : (
        <>
          <div className={`text-2xl font-semibold mt-1 ${netColor}`}>
            {formatMoney(totals.net, baseCurrency)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            +{formatMoney(totals.income, baseCurrency)} −{' '}
            {formatMoney(totals.expense, baseCurrency)}
          </div>
        </>
      )}
    </div>
  )
}

function Delta({
  label,
  current,
  previous,
  previousHasData,
  baseCurrency,
  positiveIsGood,
}: {
  label: string
  current: number
  previous: number
  previousHasData: boolean
  baseCurrency: string
  positiveIsGood?: boolean
}) {
  if (!previousHasData) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-3">
        <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Δ {label}
        </div>
        <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">нет данных</div>
      </div>
    )
  }
  const diff = current - previous
  const sign = diff > 0 ? '+' : diff < 0 ? '−' : ''
  const absDiff = Math.abs(diff)
  const pct = previous !== 0 ? Math.round((diff / Math.abs(previous)) * 100) : null
  const isGood = positiveIsGood ? diff >= 0 : diff <= 0
  const color =
    diff === 0
      ? 'text-slate-500'
      : isGood
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-rose-600 dark:text-rose-400'
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-3">
      <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Δ {label}
      </div>
      <div className={`text-base font-semibold mt-1 tabular-nums ${color}`}>
        {sign}
        {formatMoney(absDiff, baseCurrency, 0).replace('−', '')}
      </div>
      {pct !== null && (
        <div className={`text-xs mt-0.5 tabular-nums ${color}`}>
          {sign}
          {Math.abs(pct)}%
        </div>
      )}
    </div>
  )
}
