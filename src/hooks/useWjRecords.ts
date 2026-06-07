import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/useApp'

// Запись проекта = один заказ/обращение. values — значения кастомных полей,
// ключ = wj_fields.key. Форма значения по типу поля (см. шапку миграции):
//   money → {amount,currency(,purpose для expense)}; date → ISO;
//   select/status → key значения; checklist → [{text,done}]; иначе скаляр.
// visibility наследуется от проекта через RLS — у записи его нет.
export type WjRecordValues = Record<string, unknown>

export interface WjRecord {
  id: string
  project_id: string
  household_id: string
  values: WjRecordValues
  created_at: string
  updated_at: string
}

const SELECT_COLS = 'id, project_id, household_id, values, created_at, updated_at'

export function useWjRecords(projectId?: string) {
  const { household } = useApp()
  const [records, setRecords] = useState<WjRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!household || !projectId) {
      setRecords([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('wj_records')
      .select(SELECT_COLS)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
    setLoading(false)
    if (err) {
      if ((err as { code?: string }).code === '42P01') {
        setRecords([])
        return
      }
      setError(err.message)
      return
    }
    setRecords((data ?? []) as WjRecord[])
  }, [household, projectId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  useEffect(() => {
    const handler = () => load()
    window.addEventListener('ff:wj-records-changed', handler)
    return () => window.removeEventListener('ff:wj-records-changed', handler)
  }, [load])

  const create = useCallback(
    async (values: WjRecordValues = {}) => {
      if (!household || !projectId) throw new Error('No project')
      const { data, error: err } = await supabase
        .from('wj_records')
        .insert({
          project_id: projectId,
          household_id: household.id,
          values,
        })
        .select(SELECT_COLS)
        .single()
      if (err) throw err
      setRecords((prev) => [data as WjRecord, ...prev])
      window.dispatchEvent(new CustomEvent('ff:wj-records-changed'))
      return data as WjRecord
    },
    [household, projectId],
  )

  // Патч values: мержим на клиенте, пишем целиком (jsonb-колонка).
  const update = useCallback(
    async (id: string, patch: WjRecordValues) => {
      const current = records.find((r) => r.id === id)
      const nextValues = { ...(current?.values ?? {}), ...patch }
      const { data, error: err } = await supabase
        .from('wj_records')
        .update({ values: nextValues })
        .eq('id', id)
        .select(SELECT_COLS)
        .single()
      if (err) throw err
      setRecords((prev) => prev.map((r) => (r.id === id ? (data as WjRecord) : r)))
      window.dispatchEvent(new CustomEvent('ff:wj-records-changed'))
      return data as WjRecord
    },
    [records],
  )

  // Заменить values целиком (например, после пересборки формы).
  const replaceValues = useCallback(async (id: string, values: WjRecordValues) => {
    const { data, error: err } = await supabase
      .from('wj_records')
      .update({ values })
      .eq('id', id)
      .select(SELECT_COLS)
      .single()
    if (err) throw err
    setRecords((prev) => prev.map((r) => (r.id === id ? (data as WjRecord) : r)))
    window.dispatchEvent(new CustomEvent('ff:wj-records-changed'))
    return data as WjRecord
  }, [])

  const remove = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('wj_records').delete().eq('id', id)
    if (err) throw err
    setRecords((prev) => prev.filter((r) => r.id !== id))
    window.dispatchEvent(new CustomEvent('ff:wj-records-changed'))
    // Привязанные задачи становятся сиротами (FK on delete set null).
    window.dispatchEvent(new CustomEvent('ff:wj-tasks-changed'))
  }, [])

  return { records, loading, error, reload: load, create, update, replaceValues, remove }
}
