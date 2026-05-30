import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Refresh цен раз в минуту: CoinGecko-cron пишет раз в час, реальная цена
// меняется медленнее минуты — этого достаточно. Без Realtime-подписок —
// меньше движущихся частей.
const REFRESH_MS = 60_000

export interface CoinPrice {
  price: number
  asOf: string
}

export interface UseCryptoPrices {
  /** coinId → последняя цена в выбранной quote_code. */
  priceByCoinId: Map<string, CoinPrice>
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useCryptoPrices(quote: 'ILS' | 'USD' | 'EUR' = 'ILS'): UseCryptoPrices {
  const [priceByCoinId, setPriceByCoinId] = useState<Map<string, CoinPrice>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    // Грузим все строки за последние 24 часа в нужной валюте, в JS берём
    // top-1 per coin. На ~5-10 монетах это десятки строк, дёшево.
    const since = new Date()
    since.setUTCHours(since.getUTCHours() - 24)
    const { data, error: err } = await supabase
      .from('crypto_prices')
      .select('coin_id, price, as_of')
      .eq('quote_code', quote)
      .gte('as_of', since.toISOString())
      .order('as_of', { ascending: false })
    setLoading(false)
    if (err) {
      if ((err as { code?: string }).code === '42P01') {
        setPriceByCoinId(new Map())
        return
      }
      setError(err.message)
      return
    }
    const map = new Map<string, CoinPrice>()
    for (const row of data ?? []) {
      if (map.has(row.coin_id)) continue // первая запись = самая свежая (ORDER BY desc).
      map.set(row.coin_id, { price: Number(row.price), asOf: row.as_of })
    }
    setPriceByCoinId(map)
  }, [quote])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
    const t = setInterval(load, REFRESH_MS)
    return () => clearInterval(t)
  }, [load])

  return { priceByCoinId, loading, error, refresh: load }
}
