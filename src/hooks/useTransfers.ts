import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/useApp'

export interface Transfer {
  id: string
  household_id: string
  from_account_id: string
  to_account_id: string
  amount: number
  occurred_at: string
  note: string | null
  author_profile_id: string
  is_debt_settlement: boolean
  created_at: string
}

export interface CreateTransferInput {
  from_account_id: string
  to_account_id: string
  amount: number
  occurred_at: string
  note?: string | null
  /** Сумма, фактически зачисленная на to-счёт (в его валюте). Если не задана — равна amount (та же валюта). */
  to_amount?: number | null
  /** Если true — перевод считается погашением долга (Фаза 7). */
  is_debt_settlement?: boolean
}

const SELECT_COLS =
  'id, household_id, from_account_id, to_account_id, amount, occurred_at, note, author_profile_id, is_debt_settlement, created_at'

export function useTransfers() {
  const { household } = useApp()
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!household) {
      setTransfers([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('transfers')
      .select(SELECT_COLS)
      .eq('household_id', household.id)
      .order('occurred_at', { ascending: false })
    setLoading(false)
    if (err) {
      // 42703 — колонки is_debt_settlement ещё нет; 42P01 — таблицы нет.
      // На MVP не падаем, отдаём пустой список (хук-defensive паттерн).
      const code = (err as { code?: string }).code
      if (code === '42P01' || code === '42703') {
        setTransfers([])
        return
      }
      setError(err.message)
      return
    }
    setTransfers(
      (data ?? []).map((t) => ({
        ...t,
        amount: Number(t.amount),
      })),
    )
  }, [household])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  useEffect(() => {
    const handler = () => load()
    window.addEventListener('ff:operations-changed', handler)
    return () => window.removeEventListener('ff:operations-changed', handler)
  }, [load])

  const create = useCallback(
    async (input: CreateTransferInput) => {
      if (!household) throw new Error('No household')
      const { data, error: rpcErr } = await supabase.rpc('create_transfer', {
        p_from_account_id: input.from_account_id,
        p_to_account_id: input.to_account_id,
        p_amount: input.amount,
        p_occurred_at: input.occurred_at,
        p_note: input.note ?? null,
        p_to_amount: input.to_amount ?? null,
        p_is_debt_settlement: input.is_debt_settlement ?? false,
      })
      if (rpcErr) throw rpcErr
      window.dispatchEvent(new CustomEvent('ff:operations-changed'))
      return data as string
    },
    [household],
  )

  const remove = useCallback(async (transferId: string) => {
    const { error: delErr } = await supabase.from('transfers').delete().eq('id', transferId)
    if (delErr) throw delErr
    window.dispatchEvent(new CustomEvent('ff:operations-changed'))
  }, [])

  return { transfers, loading, error, reload: load, create, remove }
}
