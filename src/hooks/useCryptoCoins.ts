import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface CryptoCoin {
  id: string
  symbol: string
  coingecko_id: string
  name: string
  decimals: number
  icon: string | null
  is_active: boolean
}

const SELECT_COLS = 'id, symbol, coingecko_id, name, decimals, icon, is_active'

export function useCryptoCoins() {
  const [coins, setCoins] = useState<CryptoCoin[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /* eslint-disable react-hooks/set-state-in-effect --
     Загрузка справочника на маунт; справочник статичный. */
  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    supabase
      .from('cryptocurrencies')
      .select(SELECT_COLS)
      .eq('is_active', true)
      .order('symbol', { ascending: true })
      .then(({ data, error: err }) => {
        if (!active) return
        if (err) {
          if ((err as { code?: string }).code === '42P01') {
            setCoins([])
            setLoading(false)
            return
          }
          setError(err.message)
          setLoading(false)
          return
        }
        setCoins(data ?? [])
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  return { coins, loading, error }
}
