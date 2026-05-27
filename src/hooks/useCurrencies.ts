import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface Currency {
  code: string
  symbol: string
  name: string
  decimals: number
}

let cache: Currency[] | null = null
let inFlight: Promise<Currency[]> | null = null

async function fetchCurrencies(): Promise<Currency[]> {
  if (cache) return cache
  if (inFlight) return inFlight
  inFlight = (async () => {
    try {
      const { data, error } = await supabase
        .from('currencies')
        .select('code, symbol, name, decimals')
        .order('code', { ascending: true })
      if (error) throw error
      cache = data ?? []
      return cache
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

export function useCurrencies() {
  const [currencies, setCurrencies] = useState<Currency[]>(cache ?? [])
  const [loading, setLoading] = useState(cache === null)
  const [error, setError] = useState<string | null>(null)

  /* eslint-disable react-hooks/set-state-in-effect --
     Загрузка справочника валют из БД — стандартный data-fetch на маунт. */
  useEffect(() => {
    let active = true
    if (cache) {
      setCurrencies(cache)
      setLoading(false)
      return
    }
    fetchCurrencies()
      .then((rows) => {
        if (!active) return
        setCurrencies(rows)
        setLoading(false)
      })
      .catch((e) => {
        if (!active) return
        setError(e instanceof Error ? e.message : 'Не удалось загрузить валюты')
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  return { currencies, loading, error }
}
