import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/useApp'

// Проект задачника (work-journal). RLS: personal — видит только owner; shared —
// оба члена household. Жизненным циклом (rename/archive/delete) управляет owner.
export interface WjProject {
  id: string
  household_id: string
  owner_profile_id: string
  visibility: 'personal' | 'shared'
  name: string
  icon: string | null
  color: string | null
  is_archived: boolean
  created_at: string
  updated_at: string
}

export interface CreateWjProjectInput {
  name: string
  visibility: 'personal' | 'shared'
  icon?: string | null
  color?: string | null
}

export interface UpdateWjProjectInput {
  name?: string
  visibility?: 'personal' | 'shared'
  icon?: string | null
  color?: string | null
}

const SELECT_COLS =
  'id, household_id, owner_profile_id, visibility, name, icon, color, is_archived, created_at, updated_at'

export function useWjProjects({ includeArchived = false }: { includeArchived?: boolean } = {}) {
  const { household, profile } = useApp()
  const [projects, setProjects] = useState<WjProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!household) {
      setProjects([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    let q = supabase
      .from('wj_projects')
      .select(SELECT_COLS)
      .eq('household_id', household.id)
      .order('created_at', { ascending: false })
    if (!includeArchived) q = q.eq('is_archived', false)
    const { data, error: err } = await q
    setLoading(false)
    if (err) {
      // 42P01 = relation does not exist (миграция не применена) → пустой список,
      // UI не падает (как в useGoals).
      if ((err as { code?: string }).code === '42P01') {
        setProjects([])
        return
      }
      setError(err.message)
      return
    }
    setProjects((data ?? []) as WjProject[])
  }, [household, includeArchived])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  useEffect(() => {
    const handler = () => load()
    window.addEventListener('ff:wj-projects-changed', handler)
    return () => window.removeEventListener('ff:wj-projects-changed', handler)
  }, [load])

  const create = useCallback(
    async (input: CreateWjProjectInput) => {
      if (!household || !profile) throw new Error('No household')
      const { data, error: err } = await supabase
        .from('wj_projects')
        .insert({
          household_id: household.id,
          owner_profile_id: profile.id,
          visibility: input.visibility,
          name: input.name,
          icon: input.icon ?? null,
          color: input.color ?? null,
        })
        .select(SELECT_COLS)
        .single()
      if (err) throw err
      setProjects((prev) => [data as WjProject, ...prev])
      window.dispatchEvent(new CustomEvent('ff:wj-projects-changed'))
      return data as WjProject
    },
    [household, profile],
  )

  const update = useCallback(async (id: string, patch: UpdateWjProjectInput) => {
    const { data, error: err } = await supabase
      .from('wj_projects')
      .update(patch)
      .eq('id', id)
      .select(SELECT_COLS)
      .single()
    if (err) throw err
    setProjects((prev) => prev.map((p) => (p.id === id ? (data as WjProject) : p)))
    window.dispatchEvent(new CustomEvent('ff:wj-projects-changed'))
    return data as WjProject
  }, [])

  const setArchived = useCallback(
    async (id: string, isArchived: boolean) => {
      const { data, error: err } = await supabase
        .from('wj_projects')
        .update({ is_archived: isArchived })
        .eq('id', id)
        .select(SELECT_COLS)
        .single()
      if (err) throw err
      setProjects((prev) => {
        if (!includeArchived && isArchived) return prev.filter((p) => p.id !== id)
        return prev.map((p) => (p.id === id ? (data as WjProject) : p))
      })
      window.dispatchEvent(new CustomEvent('ff:wj-projects-changed'))
      return data as WjProject
    },
    [includeArchived],
  )

  // Жёсткое удаление: каскадом тянет wj_fields и wj_records (FK on delete cascade).
  // Привязанные задачи становятся сиротами (FK on delete set null), не удаляются.
  const remove = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('wj_projects').delete().eq('id', id)
    if (err) throw err
    setProjects((prev) => prev.filter((p) => p.id !== id))
    window.dispatchEvent(new CustomEvent('ff:wj-projects-changed'))
    window.dispatchEvent(new CustomEvent('ff:wj-records-changed'))
    window.dispatchEvent(new CustomEvent('ff:wj-tasks-changed'))
  }, [])

  return { projects, loading, error, reload: load, create, update, setArchived, remove }
}
