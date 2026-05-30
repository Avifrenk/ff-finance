import { safetyCushion, type MonthlyExpense } from '../lib/goals'
import { formatMoney } from '../lib/format'

interface Props {
  monthlyExpenses: MonthlyExpense[]
  totalBalance: number
  baseCurrency: string
}

/**
 * «У вас X месяцев жизни без дохода» — totalBalance / средний расход за
 * последние 3 ПОЛНЫХ месяца.
 *
 * Состояния:
 *   * нет данных → «Пока нет данных за прошлые месяцы».
 *   * < 3 мес → янтарная плашка «маловато, обычно советуют 3-6».
 *   * 3-6 мес → нейтральный.
 *   * ≥ 6 мес → зелёная плашка «надёжный запас».
 *   * < 0 мес (овердрафт) → нейтрально-предупредительный текст.
 */
export function SafetyCushion({ monthlyExpenses, totalBalance, baseCurrency }: Props) {
  const cushion = safetyCushion(monthlyExpenses, totalBalance)

  if (cushion.months === null) {
    return (
      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-5">
        <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
          🛟 Подушка безопасности
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
          Пока нет данных за прошлые месяцы. Появятся, как только мы увидим
          расходы хотя бы за один полный месяц.
        </p>
      </section>
    )
  }

  const months = cushion.months
  // Округляем до 0.5 — «4.5 мес» читается естественнее «4.37».
  const roundedMonths = Math.round(months * 2) / 2

  if (months < 0) {
    return (
      <section className="rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 p-5">
        <div className="text-xs uppercase tracking-wider text-amber-700 dark:text-amber-400">
          🛟 Подушка безопасности
        </div>
        <div className="text-xl font-semibold mt-1 text-slate-900 dark:text-slate-100">
          Расходов больше, чем активов
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Средний расход — {formatMoney(cushion.avgExpense, baseCurrency, 0)}/мес за{' '}
          {cushion.monthsUsed} мес.
        </p>
      </section>
    )
  }

  let tone: 'low' | 'mid' | 'high' = 'mid'
  if (months < 3) tone = 'low'
  else if (months >= 6) tone = 'high'

  const wrapperColors = {
    low: 'border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30',
    mid: 'border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60',
    high: 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30',
  }
  const captionColors = {
    low: 'text-amber-700 dark:text-amber-400',
    mid: 'text-slate-500 dark:text-slate-400',
    high: 'text-emerald-700 dark:text-emerald-400',
  }
  const hintText = {
    low: 'маловато, обычно советуют 3–6 месяцев',
    mid: 'неплохо, можно стремиться к 6 месяцам',
    high: '🎉 надёжный запас',
  }

  return (
    <section className={`rounded-2xl border p-5 ${wrapperColors[tone]}`}>
      <div className={`text-xs uppercase tracking-wider ${captionColors[tone]}`}>
        🛟 Подушка безопасности
      </div>
      <div className="text-3xl font-semibold mt-1 text-slate-900 dark:text-slate-100">
        {formatMonths(roundedMonths)}{' '}
        <span className="text-base font-normal text-slate-600 dark:text-slate-400">
          жизни без дохода
        </span>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
        Средний расход — {formatMoney(cushion.avgExpense, baseCurrency, 0)}/мес за{' '}
        {cushion.monthsUsed} {monthsWord(cushion.monthsUsed)}.
      </p>
      <p className={`text-xs mt-2 ${captionColors[tone]}`}>{hintText[tone]}</p>
    </section>
  )
}

function formatMonths(n: number): string {
  if (n === Math.floor(n)) return `${n} ${monthsWord(n)}`
  return `${n.toFixed(1)} мес`
}

function monthsWord(n: number): string {
  const abs = Math.abs(Math.round(n))
  const mod10 = abs % 10
  const mod100 = abs % 100
  if (mod10 === 1 && mod100 !== 11) return 'месяц'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'месяца'
  return 'месяцев'
}
