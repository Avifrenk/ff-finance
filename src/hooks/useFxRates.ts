import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { RatesByDate } from '../lib/fx'

// Грузим курсы за последние 90 дней — этого хватает на агрегации Dashboard
// и кросс-валютные переводы. Точечный fetch на конкретную дату — это уже
// оптимизация, пока MVP.
const WINDOW_DAYS = 90

function isoNDaysAgo(n: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

export interface UseFxRates {
  ratesByDate: RatesByDate
  loading: boolean
  error: string | null
}

export function useFxRates(): UseFxRates {
  const [ratesByDate, setRates] = useState<RatesByDate>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /* eslint-disable react-hooks/set-state-in-effect --
     Загрузка курсов из БД — стандартный data-fetch на маунт. */
  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    const since = isoNDaysAgo(WINDOW_DAYS)
    supabase
      .from('fx_rates')
      .select('base_code, quote_code, rate, as_of')
      .eq('quote_code', 'EUR') // храним обе стороны; берём «X → EUR»
      .gte('as_of', since)
      .then(({ data, error: err }) => {
        if (!active) return
        if (err) {
          setError(err.message)
          setLoading(false)
          return
        }
        const map: RatesByDate = new Map()
        for (const row of data ?? []) {
          const date = row.as_of
          let inner = map.get(date)
          if (!inner) {
            inner = new Map<string, number>()
            map.set(date, inner)
          }
          inner.set(row.base_code, Number(row.rate))
        }
        // EUR → EUR = 1 в каждой дате (для удобства lookup).
        for (const inner of map.values()) inner.set('EUR', 1)
        setRates(map)
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  return { ratesByDate, loading, error }
}
