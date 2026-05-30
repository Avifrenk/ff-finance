import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/useApp'

export interface Goal {
  id: string
  household_id: string
  owner_profile_id: string
  name: string
  target_amount: number
  target_date: string | null
  visibility: 'personal' | 'shared'
  auto_percent_of_income: number
  icon: string | null
  color: string | null
  is_archived: boolean
  created_at: string
  updated_at: string
}

export interface CreateGoalInput {
  name: string
  target_amount: number
  target_date?: string | null
  visibility: 'personal' | 'shared'
  auto_percent_of_income?: number
  icon?: string | null
  color?: string | null
}

export interface UpdateGoalInput {
  name?: string
  target_amount?: number
  target_date?: string | null
  visibility?: 'personal' | 'shared'
  auto_percent_of_income?: number
  icon?: string | null
  color?: string | null
}

const SELECT_COLS =
  'id, household_id, owner_profile_id, name, target_amount, target_date, visibility, auto_percent_of_income, icon, color, is_archived, created_at, updated_at'

export function useGoals({ includeArchived = false }: { includeArchived?: boolean } = {}) {
  const { household, profile } = useApp()
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!household) {
      setGoals([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    let q = supabase
      .from('goals')
      .select(SELECT_COLS)
      .eq('household_id', household.id)
      .order('created_at', { ascending: false })
    if (!includeArchived) q = q.eq('is_archived', false)
    const { data, error: err } = await q
    setLoading(false)
    if (err) {
      // 42P01 = relation does not exist. Если миграция ещё не применена,
      // тихо возвращаем пустой список — UI не падает (как в useBudgets).
      if ((err as { code?: string }).code === '42P01') {
        setGoals([])
        return
      }
      setError(err.message)
      return
    }
    setGoals(data ?? [])
  }, [household, includeArchived])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  useEffect(() => {
    const handler = () => load()
    window.addEventListener('ff:goals-changed', handler)
    // Auto-зачисление меняет contributions, но not сами goals — отдельный канал.
    return () => window.removeEventListener('ff:goals-changed', handler)
  }, [load])

  const create = useCallback(
    async (input: CreateGoalInput) => {
      if (!household || !profile) throw new Error('No household')
      const { data, error: err } = await supabase
        .from('goals')
        .insert({
          household_id: household.id,
          owner_profile_id: profile.id,
          name: input.name,
          target_amount: input.target_amount,
          target_date: input.target_date ?? null,
          visibility: input.visibility,
          auto_percent_of_income: input.auto_percent_of_income ?? 0,
          icon: input.icon ?? null,
          color: input.color ?? null,
        })
        .select(SELECT_COLS)
        .single()
      if (err) throw err
      setGoals((prev) => [data, ...prev])
      window.dispatchEvent(new CustomEvent('ff:goals-changed'))
      return data
    },
    [household, profile],
  )

  const update = useCallback(async (id: string, patch: UpdateGoalInput) => {
    const { data, error: err } = await supabase
      .from('goals')
      .update(patch)
      .eq('id', id)
      .select(SELECT_COLS)
      .single()
    if (err) throw err
    setGoals((prev) => prev.map((g) => (g.id === id ? data : g)))
    window.dispatchEvent(new CustomEvent('ff:goals-changed'))
    return data
  }, [])

  const setArchived = useCallback(
    async (id: string, isArchived: boolean) => {
      const { data, error: err } = await supabase
        .from('goals')
        .update({ is_archived: isArchived })
        .eq('id', id)
        .select(SELECT_COLS)
        .single()
      if (err) throw err
      setGoals((prev) => {
        if (!includeArchived && isArchived) return prev.filter((g) => g.id !== id)
        return prev.map((g) => (g.id === id ? data : g))
      })
      window.dispatchEvent(new CustomEvent('ff:goals-changed'))
      return data
    },
    [includeArchived],
  )

  const remove = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('goals').delete().eq('id', id)
    if (err) throw err
    setGoals((prev) => prev.filter((g) => g.id !== id))
    window.dispatchEvent(new CustomEvent('ff:goals-changed'))
    window.dispatchEvent(new CustomEvent('ff:goal-contributions-changed'))
  }, [])

  return {
    goals,
    loading,
    error,
    reload: load,
    create,
    update,
    setArchived,
    remove,
  }
}
