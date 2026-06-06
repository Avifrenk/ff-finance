import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/useApp'

export type AccountRole = 'wallet' | 'monthly_budget'

export interface Account {
  id: string
  household_id: string
  owner_profile_id: string
  name: string
  currency: string
  visibility: 'personal' | 'shared'
  initial_balance: number
  role: AccountRole
  monthly_amount: number | null
  created_at: string
}

export interface CreateAccountInput {
  name: string
  visibility: 'personal' | 'shared'
  initial_balance: number
  currency?: string
  role?: AccountRole
  monthly_amount?: number | null
}

export function useAccounts() {
  const { household, profile } = useApp()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!household) {
      setAccounts([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('accounts')
      .select('id, household_id, owner_profile_id, name, currency, visibility, initial_balance, role, monthly_amount, created_at')
      .eq('household_id', household.id)
      .order('created_at', { ascending: true })
    setLoading(false)
    if (err) {
      setError(err.message)
      return
    }
    setAccounts(data ?? [])
  }, [household])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  useEffect(() => {
    const handler = () => load()
    window.addEventListener('ff:accounts-changed', handler)
    return () => window.removeEventListener('ff:accounts-changed', handler)
  }, [load])

  const create = useCallback(
    async (input: CreateAccountInput) => {
      if (!household || !profile) throw new Error('No household')
      const role: AccountRole = input.role ?? 'wallet'
      const { data, error: err } = await supabase
        .from('accounts')
        .insert({
          household_id: household.id,
          owner_profile_id: profile.id,
          name: input.name,
          currency: input.currency ?? 'ILS',
          visibility: input.visibility,
          initial_balance: input.initial_balance,
          role,
          monthly_amount: role === 'monthly_budget' ? (input.monthly_amount ?? null) : null,
        })
        .select('id, household_id, owner_profile_id, name, currency, visibility, initial_balance, role, monthly_amount, created_at')
        .single()
      if (err) throw err
      setAccounts((prev) => [...prev, data])
      window.dispatchEvent(new CustomEvent('ff:accounts-changed'))
      return data
    },
    [household, profile],
  )

  const remove = useCallback(async (accountId: string) => {
    const { error: err } = await supabase.from('accounts').delete().eq('id', accountId)
    if (err) throw err
    setAccounts((prev) => prev.filter((a) => a.id !== accountId))
    window.dispatchEvent(new CustomEvent('ff:accounts-changed'))
  }, [])

  return { accounts, loading, error, reload: load, create, remove }
}
