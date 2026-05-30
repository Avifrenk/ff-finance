import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export type CryptoTxKind = 'buy' | 'sell' | 'transfer_in' | 'transfer_out' | 'fee' | 'airdrop'

export interface CryptoTransaction {
  id: string
  holding_id: string
  kind: CryptoTxKind
  amount: number
  price_per_unit_base: number | null
  fee_base: number
  occurred_at: string
  note: string | null
  created_at: string
}

export interface CreateCryptoTxInput {
  holding_id: string
  kind: CryptoTxKind
  amount: number
  price_per_unit_base?: number | null
  fee_base?: number
  occurred_at: string
  note?: string | null
}

export interface UpdateCryptoTxInput {
  kind?: CryptoTxKind
  amount?: number
  price_per_unit_base?: number | null
  fee_base?: number
  occurred_at?: string
  note?: string | null
}

const SELECT_COLS = 'id, holding_id, kind, amount, price_per_unit_base, fee_base, occurred_at, note, created_at'

export function useCryptoTransactions(holdingId?: string) {
  const [transactions, setTransactions] = useState<CryptoTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    let q = supabase
      .from('crypto_transactions')
      .select(SELECT_COLS)
      .order('occurred_at', { ascending: true })
      .order('created_at', { ascending: true })
    if (holdingId) q = q.eq('holding_id', holdingId)
    const { data, error: err } = await q
    setLoading(false)
    if (err) {
      if ((err as { code?: string }).code === '42P01') {
        setTransactions([])
        return
      }
      setError(err.message)
      return
    }
    setTransactions(
      (data ?? []).map((row) => ({
        ...row,
        amount: Number(row.amount),
        price_per_unit_base: row.price_per_unit_base === null ? null : Number(row.price_per_unit_base),
        fee_base: Number(row.fee_base),
      })),
    )
  }, [holdingId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  useEffect(() => {
    const handler = () => load()
    window.addEventListener('ff:crypto-transactions-changed', handler)
    window.addEventListener('ff:crypto-holdings-changed', handler)
    return () => {
      window.removeEventListener('ff:crypto-transactions-changed', handler)
      window.removeEventListener('ff:crypto-holdings-changed', handler)
    }
  }, [load])

  const create = useCallback(async (input: CreateCryptoTxInput) => {
    const { data, error: err } = await supabase
      .from('crypto_transactions')
      .insert({
        holding_id: input.holding_id,
        kind: input.kind,
        amount: input.amount,
        price_per_unit_base: input.price_per_unit_base ?? null,
        fee_base: input.fee_base ?? 0,
        occurred_at: input.occurred_at,
        note: input.note ?? null,
      })
      .select(SELECT_COLS)
      .single()
    if (err) throw err
    window.dispatchEvent(new CustomEvent('ff:crypto-transactions-changed'))
    return data
  }, [])

  const update = useCallback(async (id: string, patch: UpdateCryptoTxInput) => {
    const { data, error: err } = await supabase
      .from('crypto_transactions')
      .update(patch)
      .eq('id', id)
      .select(SELECT_COLS)
      .single()
    if (err) throw err
    window.dispatchEvent(new CustomEvent('ff:crypto-transactions-changed'))
    return data
  }, [])

  const remove = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('crypto_transactions').delete().eq('id', id)
    if (err) throw err
    window.dispatchEvent(new CustomEvent('ff:crypto-transactions-changed'))
  }, [])

  return {
    transactions,
    loading,
    error,
    reload: load,
    create,
    update,
    remove,
  }
}
