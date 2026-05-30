import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/useApp'

export interface CryptoHolding {
  id: string
  profile_id: string
  coin_id: string
  custodian: string
  created_at: string
}

export interface CreateHoldingInput {
  coinId: string
  custodian: string
}

const SELECT_COLS = 'id, profile_id, coin_id, custodian, created_at'

export function useCryptoHoldings() {
  const { profile } = useApp()
  const [holdings, setHoldings] = useState<CryptoHolding[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!profile) {
      setHoldings([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('crypto_holdings')
      .select(SELECT_COLS)
      .order('created_at', { ascending: true })
    setLoading(false)
    if (err) {
      if ((err as { code?: string }).code === '42P01') {
        setHoldings([])
        return
      }
      setError(err.message)
      return
    }
    setHoldings(data ?? [])
  }, [profile])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  useEffect(() => {
    const handler = () => load()
    window.addEventListener('ff:crypto-holdings-changed', handler)
    return () => window.removeEventListener('ff:crypto-holdings-changed', handler)
  }, [load])

  const create = useCallback(
    async (input: CreateHoldingInput) => {
      if (!profile) throw new Error('No profile')
      const custodian = input.custodian.trim()
      if (!custodian) throw new Error('Custodian required')
      const { data, error: err } = await supabase
        .from('crypto_holdings')
        .insert({
          profile_id: profile.id,
          coin_id: input.coinId,
          custodian,
        })
        .select(SELECT_COLS)
        .single()
      if (err) {
        // UNIQUE (profile_id, coin_id, custodian) — если уже есть, возвращаем существующий.
        if ((err as { code?: string }).code === '23505') {
          const { data: existing, error: selErr } = await supabase
            .from('crypto_holdings')
            .select(SELECT_COLS)
            .eq('profile_id', profile.id)
            .eq('coin_id', input.coinId)
            .eq('custodian', custodian)
            .single()
          if (selErr) throw selErr
          return existing
        }
        throw err
      }
      setHoldings((prev) => [...prev, data])
      window.dispatchEvent(new CustomEvent('ff:crypto-holdings-changed'))
      return data
    },
    [profile],
  )

  const remove = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('crypto_holdings').delete().eq('id', id)
    if (err) throw err
    setHoldings((prev) => prev.filter((h) => h.id !== id))
    window.dispatchEvent(new CustomEvent('ff:crypto-holdings-changed'))
    window.dispatchEvent(new CustomEvent('ff:crypto-transactions-changed'))
  }, [])

  return {
    holdings,
    loading,
    error,
    reload: load,
    create,
    remove,
  }
}
