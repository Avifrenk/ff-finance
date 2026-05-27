import { useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/useApp'

export interface CreateTransferInput {
  from_account_id: string
  to_account_id: string
  amount: number
  occurred_at: string
  note?: string | null
}

export function useTransfers() {
  const { household } = useApp()

  const create = useCallback(
    async (input: CreateTransferInput) => {
      if (!household) throw new Error('No household')
      const { data, error } = await supabase.rpc('create_transfer', {
        p_from_account_id: input.from_account_id,
        p_to_account_id: input.to_account_id,
        p_amount: input.amount,
        p_occurred_at: input.occurred_at,
        p_note: input.note ?? null,
      })
      if (error) throw error
      window.dispatchEvent(new CustomEvent('ff:operations-changed'))
      return data as string
    },
    [household],
  )

  const remove = useCallback(async (transferId: string) => {
    const { error } = await supabase.from('transfers').delete().eq('id', transferId)
    if (error) throw error
    window.dispatchEvent(new CustomEvent('ff:operations-changed'))
  }, [])

  return { create, remove }
}
