import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/useApp'

// Карточка клиента (мастер). values — значения client-scope полей (wj_fields,
// scope='client'), ключ = wj_fields.key. Видимость наследуется от проекта (RLS).
export type WjClientValues = Record<string, unknown>

export interface WjClient {
  id: string
  project_id: string
  household_id: string
  values: WjClientValues
  created_at: string
  updated_at: string
}

const SELECT_COLS = 'id, project_id, household_id, values, created_at, updated_at'

export function useWjClients(projectId?: string) {
  const { household } = useApp()
  const [clients, setClients] = useState<WjClient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!household || !projectId) {
      setClients([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('wj_clients')
      .select(SELECT_COLS)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
    setLoading(false)
    if (err) {
      if ((err as { code?: string }).code === '42P01') {
        setClients([])
        return
      }
      setError(err.message)
      return
    }
    setClients((data ?? []) as WjClient[])
  }, [household, projectId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  useEffect(() => {
    const handler = () => load()
    window.addEventListener('ff:wj-clients-changed', handler)
    return () => window.removeEventListener('ff:wj-clients-changed', handler)
  }, [load])

  const create = useCallback(
    async (values: WjClientValues = {}) => {
      if (!household || !projectId) throw new Error('No project')
      const { data, error: err } = await supabase
        .from('wj_clients')
        .insert({ project_id: projectId, household_id: household.id, values })
        .select(SELECT_COLS)
        .single()
      if (err) throw err
      setClients((prev) => [data as WjClient, ...prev])
      window.dispatchEvent(new CustomEvent('ff:wj-clients-changed'))
      return data as WjClient
    },
    [household, projectId],
  )

  // Патч values: мержим на клиенте, пишем целиком (jsonb-колонка).
  const update = useCallback(
    async (id: string, patch: WjClientValues) => {
      const current = clients.find((c) => c.id === id)
      const nextValues = { ...(current?.values ?? {}), ...patch }
      const { data, error: err } = await supabase
        .from('wj_clients')
        .update({ values: nextValues })
        .eq('id', id)
        .select(SELECT_COLS)
        .single()
      if (err) throw err
      setClients((prev) => prev.map((c) => (c.id === id ? (data as WjClient) : c)))
      window.dispatchEvent(new CustomEvent('ff:wj-clients-changed'))
      return data as WjClient
    },
    [clients],
  )

  const replaceValues = useCallback(async (id: string, values: WjClientValues) => {
    const { data, error: err } = await supabase
      .from('wj_clients')
      .update({ values })
      .eq('id', id)
      .select(SELECT_COLS)
      .single()
    if (err) throw err
    setClients((prev) => prev.map((c) => (c.id === id ? (data as WjClient) : c)))
    window.dispatchEvent(new CustomEvent('ff:wj-clients-changed'))
    return data as WjClient
  }, [])

  const remove = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('wj_clients').delete().eq('id', id)
    if (err) throw err
    setClients((prev) => prev.filter((c) => c.id !== id))
    window.dispatchEvent(new CustomEvent('ff:wj-clients-changed'))
    // Заказы клиента удаляются каскадом — обновим зависимые списки.
    window.dispatchEvent(new CustomEvent('ff:wj-records-changed'))
  }, [])

  return { clients, loading, error, reload: load, create, update, replaceValues, remove }
}
