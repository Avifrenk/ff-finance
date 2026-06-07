import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/useApp'

// Задача на день. По умолчанию — просто дело; опц. привязка к проекту/записи.
// RLS personal/shared: shared-задачу правят оба члена household, personal — owner.
export interface WjTask {
  id: string
  household_id: string
  owner_profile_id: string
  visibility: 'personal' | 'shared'
  title: string
  notes: string | null
  due_date: string | null
  is_done: boolean
  done_at: string | null
  reminder_at: string | null
  project_id: string | null
  record_id: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface CreateWjTaskInput {
  title: string
  visibility?: 'personal' | 'shared'
  notes?: string | null
  due_date?: string | null
  reminder_at?: string | null
  project_id?: string | null
  record_id?: string | null
  sort_order?: number
}

export interface UpdateWjTaskInput {
  title?: string
  visibility?: 'personal' | 'shared'
  notes?: string | null
  due_date?: string | null
  reminder_at?: string | null
  project_id?: string | null
  record_id?: string | null
  sort_order?: number
}

const SELECT_COLS =
  'id, household_id, owner_profile_id, visibility, title, notes, due_date, is_done, done_at, reminder_at, project_id, record_id, sort_order, created_at, updated_at'

/**
 * Задачи household. Опции фильтра:
 *   * date  — только задачи с due_date = этой датой (экран «Сегодня»);
 *   * projectId — только привязанные к проекту;
 * без фильтров — все видимые задачи (RLS отсекает чужие personal).
 */
export function useWjTasks(
  { date, projectId }: { date?: string; projectId?: string } = {},
) {
  const { household, profile } = useApp()
  const [tasks, setTasks] = useState<WjTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!household) {
      setTasks([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    let q = supabase
      .from('wj_tasks')
      .select(SELECT_COLS)
      .eq('household_id', household.id)
    if (date) q = q.eq('due_date', date)
    if (projectId) q = q.eq('project_id', projectId)
    q = q
      .order('is_done', { ascending: true })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
    const { data, error: err } = await q
    setLoading(false)
    if (err) {
      if ((err as { code?: string }).code === '42P01') {
        setTasks([])
        return
      }
      setError(err.message)
      return
    }
    setTasks((data ?? []) as WjTask[])
  }, [household, date, projectId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  useEffect(() => {
    const handler = () => load()
    window.addEventListener('ff:wj-tasks-changed', handler)
    return () => window.removeEventListener('ff:wj-tasks-changed', handler)
  }, [load])

  const create = useCallback(
    async (input: CreateWjTaskInput) => {
      if (!household || !profile) throw new Error('No household')
      const { data, error: err } = await supabase
        .from('wj_tasks')
        .insert({
          household_id: household.id,
          owner_profile_id: profile.id,
          visibility: input.visibility ?? 'personal',
          title: input.title,
          notes: input.notes ?? null,
          due_date: input.due_date ?? null,
          reminder_at: input.reminder_at ?? null,
          project_id: input.project_id ?? null,
          record_id: input.record_id ?? null,
          sort_order: input.sort_order ?? 0,
        })
        .select(SELECT_COLS)
        .single()
      if (err) throw err
      setTasks((prev) => [data as WjTask, ...prev])
      window.dispatchEvent(new CustomEvent('ff:wj-tasks-changed'))
      return data as WjTask
    },
    [household, profile],
  )

  const update = useCallback(async (id: string, patch: UpdateWjTaskInput) => {
    const { data, error: err } = await supabase
      .from('wj_tasks')
      .update(patch)
      .eq('id', id)
      .select(SELECT_COLS)
      .single()
    if (err) throw err
    setTasks((prev) => prev.map((t) => (t.id === id ? (data as WjTask) : t)))
    window.dispatchEvent(new CustomEvent('ff:wj-tasks-changed'))
    return data as WjTask
  }, [])

  // Закрыть/переоткрыть задачу: is_done + done_at вместе.
  const toggleDone = useCallback(async (id: string, isDone: boolean) => {
    const { data, error: err } = await supabase
      .from('wj_tasks')
      .update({ is_done: isDone, done_at: isDone ? new Date().toISOString() : null })
      .eq('id', id)
      .select(SELECT_COLS)
      .single()
    if (err) throw err
    setTasks((prev) => prev.map((t) => (t.id === id ? (data as WjTask) : t)))
    window.dispatchEvent(new CustomEvent('ff:wj-tasks-changed'))
    return data as WjTask
  }, [])

  const remove = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('wj_tasks').delete().eq('id', id)
    if (err) throw err
    setTasks((prev) => prev.filter((t) => t.id !== id))
    window.dispatchEvent(new CustomEvent('ff:wj-tasks-changed'))
  }, [])

  return { tasks, loading, error, reload: load, create, update, toggleDone, remove }
}
