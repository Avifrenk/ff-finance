import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/useApp'

export interface Schedule {
  id: string
  household_id: string
  account_id: string
  category_id: string | null
  author_profile_id: string
  kind: 'expense' | 'income'
  amount: number
  cadence_rule: string
  next_run_at: string
  last_run_at: string | null
  is_active: boolean
  note: string | null
  is_private: boolean
  created_at: string
}

export interface CreateScheduleInput {
  account_id: string
  category_id: string | null
  kind: 'expense' | 'income'
  amount: number
  cadence_rule: string
  next_run_at: string
  note?: string | null
  is_private?: boolean
}

const SELECT_COLS =
  'id, household_id, account_id, category_id, author_profile_id, kind, amount, cadence_rule, next_run_at, last_run_at, is_active, note, is_private, created_at'

export function useSchedules() {
  const { household, profile } = useApp()
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!household) {
      setSchedules([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('operation_schedules')
      .select(SELECT_COLS)
      .eq('household_id', household.id)
      .order('next_run_at', { ascending: true })
    setLoading(false)
    if (err) {
      setError(err.message)
      return
    }
    setSchedules(data ?? [])
  }, [household])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  useEffect(() => {
    const handler = () => load()
    window.addEventListener('ff:schedules-changed', handler)
    window.addEventListener('ff:operations-changed', handler)
    return () => {
      window.removeEventListener('ff:schedules-changed', handler)
      window.removeEventListener('ff:operations-changed', handler)
    }
  }, [load])

  const create = useCallback(
    async (input: CreateScheduleInput) => {
      if (!household || !profile) throw new Error('No household')
      const { data, error: err } = await supabase
        .from('operation_schedules')
        .insert({
          household_id: household.id,
          author_profile_id: profile.id,
          account_id: input.account_id,
          category_id: input.category_id,
          kind: input.kind,
          amount: input.amount,
          cadence_rule: input.cadence_rule,
          next_run_at: input.next_run_at,
          note: input.note ?? null,
          is_private: input.is_private ?? false,
        })
        .select(SELECT_COLS)
        .single()
      if (err) throw err
      setSchedules((prev) => [...prev, data])
      window.dispatchEvent(new CustomEvent('ff:schedules-changed'))
      return data
    },
    [household, profile],
  )

  const toggle = useCallback(async (id: string, isActive: boolean) => {
    const { error: err } = await supabase
      .from('operation_schedules')
      .update({ is_active: isActive })
      .eq('id', id)
    if (err) throw err
    setSchedules((prev) => prev.map((s) => (s.id === id ? { ...s, is_active: isActive } : s)))
    window.dispatchEvent(new CustomEvent('ff:schedules-changed'))
  }, [])

  const remove = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('operation_schedules').delete().eq('id', id)
    if (err) throw err
    setSchedules((prev) => prev.filter((s) => s.id !== id))
    window.dispatchEvent(new CustomEvent('ff:schedules-changed'))
  }, [])

  const tickNow = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('tick_schedules')
    if (err) throw err
    window.dispatchEvent(new CustomEvent('ff:operations-changed'))
    window.dispatchEvent(new CustomEvent('ff:schedules-changed'))
    return data as number
  }, [])

  return { schedules, loading, error, reload: load, create, toggle, remove, tickNow }
}

// Утилиты для UI cadence_rule.

export function describeCadence(rule: string): string {
  if (rule === 'daily') return 'каждый день'
  const [kind, arg] = rule.split(':')
  if (kind === 'weekly') {
    const dows = ['воскресеньям', 'понедельникам', 'вторникам', 'средам', 'четвергам', 'пятницам', 'субботам']
    return `по ${dows[Number(arg)] ?? '?'}`
  }
  if (kind === 'monthly') return `${arg}-го числа каждого месяца`
  return rule
}
