import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/useApp'

export interface Operation {
  id: string
  household_id: string
  account_id: string
  category_id: string | null
  author_profile_id: string
  kind: 'expense' | 'income'
  amount: number
  occurred_at: string
  note: string | null
  is_private: boolean
  created_at: string
}

export interface CreateOperationInput {
  account_id: string
  category_id: string | null
  kind: 'expense' | 'income'
  amount: number
  occurred_at: string
  note?: string | null
  is_private?: boolean
}

export type PeriodFilter = 'month' | 'prev-month' | 'week' | 'all'

function periodRange(period: PeriodFilter): { from?: string; to?: string } {
  const now = new Date()
  const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)
  const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0)
  const iso = (d: Date) => d.toISOString().slice(0, 10)

  if (period === 'month') {
    return { from: iso(startOfMonth(now)), to: iso(endOfMonth(now)) }
  }
  if (period === 'prev-month') {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    return { from: iso(startOfMonth(prev)), to: iso(endOfMonth(prev)) }
  }
  if (period === 'week') {
    const from = new Date(now)
    from.setDate(from.getDate() - 6)
    return { from: iso(from), to: iso(now) }
  }
  return {}
}

export function useOperations(period: PeriodFilter = 'month') {
  const { household, profile } = useApp()
  const [operations, setOperations] = useState<Operation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!household) {
      setOperations([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const range = periodRange(period)
    let q = supabase
      .from('operations')
      .select(
        'id, household_id, account_id, category_id, author_profile_id, kind, amount, occurred_at, note, is_private, created_at',
      )
      .eq('household_id', household.id)
      .order('occurred_at', { ascending: false })
      .order('created_at', { ascending: false })

    if (range.from) q = q.gte('occurred_at', range.from)
    if (range.to) q = q.lte('occurred_at', range.to)

    // viewMode-фильтрация делается в страницах (по accounts), не здесь —
    // хук возвращает всё, что видимо через RLS.

    const { data, error: err } = await q
    setLoading(false)
    if (err) {
      setError(err.message)
      return
    }
    setOperations(data ?? [])
  }, [household, period])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  // Глобальный сигнал «что-то изменилось в операциях» — слушаем и перезагружаем.
  useEffect(() => {
    const handler = () => load()
    window.addEventListener('ff:operations-changed', handler)
    return () => window.removeEventListener('ff:operations-changed', handler)
  }, [load])

  const create = useCallback(
    async (input: CreateOperationInput) => {
      if (!household || !profile) throw new Error('No household')
      const { data, error: err } = await supabase
        .from('operations')
        .insert({
          household_id: household.id,
          author_profile_id: profile.id,
          account_id: input.account_id,
          category_id: input.category_id,
          kind: input.kind,
          amount: input.amount,
          occurred_at: input.occurred_at,
          note: input.note ?? null,
          is_private: input.is_private ?? false,
        })
        .select(
          'id, household_id, account_id, category_id, author_profile_id, kind, amount, occurred_at, note, is_private, created_at',
        )
        .single()
      if (err) throw err
      setOperations((prev) => [data, ...prev])
      window.dispatchEvent(new CustomEvent('ff:operations-changed'))
      return data
    },
    [household, profile],
  )

  const remove = useCallback(async (operationId: string) => {
    const { error: err } = await supabase.from('operations').delete().eq('id', operationId)
    if (err) throw err
    setOperations((prev) => prev.filter((o) => o.id !== operationId))
    window.dispatchEvent(new CustomEvent('ff:operations-changed'))
  }, [])

  return { operations, loading, error, reload: load, create, remove }
}
