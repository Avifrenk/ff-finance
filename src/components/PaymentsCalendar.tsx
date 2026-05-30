import { useMemo, useState } from 'react'
import type { Account } from '../hooks/useAccounts'
import type { Category } from '../hooks/useCategories'
import type { Schedule } from '../hooks/useSchedules'
import { describeCadence } from '../hooks/useSchedules'
import { expandCadenceInMonth, humanMonthFull, monthGrid } from '../lib/scheduleExpand'
import { formatMoney } from '../lib/format'

interface Props {
  schedules: Schedule[]
  accountById: Map<string, Account>
  categoryById: Map<string, Category>
}

interface DayEvent {
  scheduleId: string
  kind: 'expense' | 'income'
  amount: number
  currency: string
  category: Category | null
  account: Account | null
  cadenceRule: string
  note: string | null
}

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

/**
 * Календарь платежей: сетка месяца, в каждой клетке точки/иконки регулярных
 * операций, которые сработают в этот день. Без drag-n-drop; тап раскрывает
 * список деталей под календарём.
 *
 * Фильтрация по viewMode выполняется вызывающим (Dashboard) — здесь только
 * рендер. schedules уже сужены.
 */
export function PaymentsCalendar({ schedules, accountById, categoryById }: Props) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [monthIdx, setMonthIdx] = useState(today.getMonth())
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  // Считаем eventsByDay = Map<dateIso, DayEvent[]>.
  const eventsByDay = useMemo(() => {
    const map = new Map<string, DayEvent[]>()
    for (const s of schedules) {
      if (!s.is_active) continue
      const dates = expandCadenceInMonth(s.cadence_rule, s.next_run_at, year, monthIdx)
      if (dates.length === 0) continue
      const account = accountById.get(s.account_id) ?? null
      const category = s.category_id ? (categoryById.get(s.category_id) ?? null) : null
      const event: DayEvent = {
        scheduleId: s.id,
        kind: s.kind,
        amount: Number(s.amount),
        currency: account?.currency ?? 'ILS',
        category,
        account,
        cadenceRule: s.cadence_rule,
        note: s.note,
      }
      for (const d of dates) {
        const list = map.get(d) ?? []
        list.push(event)
        map.set(d, list)
      }
    }
    return map
  }, [schedules, accountById, categoryById, year, monthIdx])

  const grid = useMemo(() => monthGrid(year, monthIdx), [year, monthIdx])
  const todayIso = isoOf(today)

  function shift(delta: number) {
    let m = monthIdx + delta
    let y = year
    while (m < 0) {
      m += 12
      y -= 1
    }
    while (m > 11) {
      m -= 12
      y += 1
    }
    setMonthIdx(m)
    setYear(y)
    setSelectedDay(null)
  }

  if (schedules.length === 0) return null

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">Календарь платежей</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => shift(-1)}
            className="px-2 py-1 text-sm rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Предыдущий месяц"
          >
            ‹
          </button>
          <div className="text-sm font-medium tabular-nums text-slate-900 dark:text-slate-100 min-w-[120px] text-center">
            {humanMonthFull(year, monthIdx)}
          </div>
          <button
            onClick={() => shift(1)}
            className="px-2 py-1 text-sm rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Следующий месяц"
          >
            ›
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="text-xs text-center text-slate-500 dark:text-slate-400 uppercase tracking-wider"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {grid.map((day) => {
          const [, m] = day.split('-').map(Number)
          const inMonth = m - 1 === monthIdx
          const events = eventsByDay.get(day) ?? []
          const isToday = day === todayIso
          const isSelected = selectedDay === day
          const dayN = day.slice(8)
          return (
            <button
              key={day}
              onClick={() => events.length > 0 && setSelectedDay(isSelected ? null : day)}
              disabled={events.length === 0}
              className={`relative aspect-square min-h-[44px] rounded-md text-xs flex flex-col items-stretch p-1 transition-colors text-left ${
                !inMonth
                  ? 'text-slate-300 dark:text-slate-700'
                  : isSelected
                    ? 'bg-indigo-500/15 ring-2 ring-indigo-500'
                    : events.length > 0
                      ? 'bg-slate-100/70 dark:bg-slate-800/70 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer'
                      : 'bg-transparent'
              }`}
            >
              <div
                className={`text-[11px] tabular-nums ${
                  isToday
                    ? 'text-indigo-600 dark:text-indigo-400 font-bold'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {Number(dayN)}
              </div>
              {events.length > 0 && inMonth && (
                <div className="flex flex-wrap gap-0.5 mt-auto">
                  {events.slice(0, 3).map((e, i) => (
                    <span
                      key={i}
                      className={`inline-block h-1.5 w-1.5 rounded-full ${
                        e.kind === 'income' ? 'bg-emerald-500' : 'bg-slate-500 dark:bg-slate-400'
                      }`}
                    />
                  ))}
                  {events.length > 3 && (
                    <span className="text-[9px] leading-none text-slate-500">
                      +{events.length - 3}
                    </span>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {selectedDay && (
        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
          <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
            {humanDay(selectedDay)}
          </div>
          <ul className="space-y-2">
            {(eventsByDay.get(selectedDay) ?? []).map((e, i) => (
              <li key={i} className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-sm">
                  {e.category?.icon ?? (e.kind === 'expense' ? '💸' : '💰')}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                    {e.category?.name ?? (e.kind === 'expense' ? 'Расход' : 'Доход')}
                    {e.note && <span className="text-slate-500 dark:text-slate-400 font-normal"> · {e.note}</span>}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {describeCadence(e.cadenceRule)}
                    {e.account ? ` · ${e.account.name}` : ''}
                  </div>
                </div>
                <div
                  className={`text-sm font-semibold whitespace-nowrap ${
                    e.kind === 'expense'
                      ? 'text-slate-900 dark:text-slate-100'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {e.kind === 'expense' ? '−' : '+'}
                  {formatMoney(e.amount, e.currency).replace('−', '')}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function isoOf(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function humanDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' })
}
