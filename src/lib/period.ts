import {
  last30DaysRange,
  monthRange,
  previousMonthRange,
  quarterToDateRange,
  type DateRange,
} from './aggregate'

export type DashboardPeriod = 'month' | 'prev-month' | '30days' | 'quarter'

export function rangeFor(period: DashboardPeriod, ref: Date = new Date()): DateRange {
  if (period === 'month') return monthRange(ref)
  if (period === 'prev-month') return previousMonthRange(ref)
  if (period === '30days') return last30DaysRange(ref)
  return quarterToDateRange(ref)
}
