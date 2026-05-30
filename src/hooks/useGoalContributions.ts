import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/useApp'

export interface GoalContribution {
  id: string
  goal_id: string
  amount: number
  occurred_at: string
  author_profile_id: string
  source: 'manual' | 'auto'
  source_operation_id: string | null
  note: string | null
  created_at: string
}

const SELECT_COLS =
  'id, goal_id, amount, occurred_at, author_profile_id, source, source_operation_id, note, created_at'

/**
 * Лог пополнений. Если goalId задан — только этой цели; если не задан —
 * все contributions, видимые текущему пользователю (RLS на стороне БД
 * отсекает чужие personal-цели).
 *
 * Dashboard вызывает без goalId, чтобы посчитать прогресс по всем целям
 * сразу (без N+1 запросов).
 */
export function useGoalContributions(goalId?: string) {
  const { household } = useApp()
  const [contributions, setContributions] = useState<GoalContribution[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!household) {
      setContributions([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    let q = supabase
      .from('goal_contributions')
      .select(SELECT_COLS)
      .order('occurred_at', { ascending: false })
      .order('created_at', { ascending: false })
    if (goalId) q = q.eq('goal_id', goalId)
    const { data, error: err } = await q
    setLoading(false)
    if (err) {
      if ((err as { code?: string }).code === '42P01') {
        setContributions([])
        return
      }
      setError(err.message)
      return
    }
    setContributions(data ?? [])
  }, [household, goalId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  useEffect(() => {
    const handler = () => load()
    window.addEventListener('ff:goal-contributions-changed', handler)
    // Auto-зачисление крутится в tick_schedules — при его ручном дёрге
    // меняются operations, и contributions могут добавиться. Слушаем оба.
    window.addEventListener('ff:operations-changed', handler)
    return () => {
      window.removeEventListener('ff:goal-contributions-changed', handler)
      window.removeEventListener('ff:operations-changed', handler)
    }
  }, [load])

  const contribute = useCallback(
    async (
      targetGoalId: string,
      amount: number,
      occurredAt?: string,
      note?: string | null,
    ) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      if (!isFinite(amount) || amount <= 0) {
        throw new Error('Сумма должна быть положительной')
      }
      const { data, error: err } = await supabase
        .from('goal_contributions')
        .insert({
          goal_id: targetGoalId,
          amount,
          occurred_at: occurredAt ?? new Date().toISOString().slice(0, 10),
          author_profile_id: user.id,
          source: 'manual',
          note: note ?? null,
        })
        .select(SELECT_COLS)
        .single()
      if (err) throw err
      setContributions((prev) => [data, ...prev])
      window.dispatchEvent(new CustomEvent('ff:goal-contributions-changed'))
      return data
    },
    [],
  )

  const removeContribution = useCallback(async (id: string) => {
    const { error: err } = await supabase
      .from('goal_contributions')
      .delete()
      .eq('id', id)
    if (err) throw err
    setContributions((prev) => prev.filter((c) => c.id !== id))
    window.dispatchEvent(new CustomEvent('ff:goal-contributions-changed'))
  }, [])

  return { contributions, loading, error, reload: load, contribute, removeContribution }
}
