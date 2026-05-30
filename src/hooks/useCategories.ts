import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/useApp'

export interface Category {
  id: string
  household_id: string
  name: string
  kind: 'expense' | 'income'
  icon: string | null
  color: string | null
  is_default: boolean
  is_essential: boolean
}

const SELECT_COLS = 'id, household_id, name, kind, icon, color, is_default, is_essential'

export function useCategories() {
  const { household } = useApp()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!household) {
      setCategories([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('categories')
      .select(SELECT_COLS)
      .eq('household_id', household.id)
      .order('kind', { ascending: true })
      .order('name', { ascending: true })
    setLoading(false)
    if (err) {
      // 42703 — колонка is_essential ещё не накатана: defensive fallback на старый SELECT.
      if ((err as { code?: string }).code === '42703') {
        const { data: legacy } = await supabase
          .from('categories')
          .select('id, household_id, name, kind, icon, color, is_default')
          .eq('household_id', household.id)
        setCategories((legacy ?? []).map((c) => ({ ...c, is_essential: false })))
        return
      }
      setError(err.message)
      return
    }
    setCategories(data ?? [])
  }, [household])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  useEffect(() => {
    const handler = () => load()
    window.addEventListener('ff:categories-changed', handler)
    return () => window.removeEventListener('ff:categories-changed', handler)
  }, [load])

  const setEssential = useCallback(async (id: string, value: boolean) => {
    const { error: err } = await supabase
      .from('categories')
      .update({ is_essential: value })
      .eq('id', id)
    if (err) throw err
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, is_essential: value } : c)))
    window.dispatchEvent(new CustomEvent('ff:categories-changed'))
  }, [])

  return { categories, loading, error, reload: load, setEssential }
}
