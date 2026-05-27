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
}

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
      .select('id, household_id, name, kind, icon, color, is_default')
      .eq('household_id', household.id)
      .order('kind', { ascending: true })
      .order('name', { ascending: true })
    setLoading(false)
    if (err) {
      setError(err.message)
      return
    }
    setCategories(data ?? [])
  }, [household])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  return { categories, loading, error, reload: load }
}
