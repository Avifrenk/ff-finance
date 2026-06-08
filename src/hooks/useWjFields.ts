import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/useApp'

export type WjFieldType =
  | 'text' | 'number' | 'money' | 'date' | 'phone'
  | 'link' | 'select' | 'status' | 'checklist' | 'note'

export type WjMoneyDirection = 'income' | 'expense'

export type WjAnalyticsRole =
  | 'amount' | 'date_payment' | 'date_due' | 'status' | 'client_name'

// Поле принадлежит карточке клиента (шапка) или заказу/записи под клиентом.
export type WjFieldScope = 'client' | 'order'

// Определение поля проекта (конструктор). Видимость и право записи наследуются
// от проекта через RLS — отдельного visibility у поля нет.
export interface WjField {
  id: string
  project_id: string
  household_id: string
  key: string
  label: string
  type: WjFieldType
  options: Record<string, unknown> | unknown[] | null
  money_direction: WjMoneyDirection | null
  is_required: boolean
  sort_order: number
  analytics_role: WjAnalyticsRole | null
  scope: WjFieldScope
  created_at: string
}

export interface CreateWjFieldInput {
  key: string
  label: string
  type: WjFieldType
  options?: Record<string, unknown> | unknown[] | null
  money_direction?: WjMoneyDirection | null
  is_required?: boolean
  sort_order?: number
  analytics_role?: WjAnalyticsRole | null
  scope?: WjFieldScope
}

export interface UpdateWjFieldInput {
  key?: string
  label?: string
  type?: WjFieldType
  options?: Record<string, unknown> | unknown[] | null
  money_direction?: WjMoneyDirection | null
  is_required?: boolean
  sort_order?: number
  analytics_role?: WjAnalyticsRole | null
  scope?: WjFieldScope
}

const SELECT_COLS =
  'id, project_id, household_id, key, label, type, options, money_direction, is_required, sort_order, analytics_role, scope, created_at'

export function useWjFields(projectId?: string) {
  const { household } = useApp()
  const [fields, setFields] = useState<WjField[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!household || !projectId) {
      setFields([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('wj_fields')
      .select(SELECT_COLS)
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    setLoading(false)
    if (err) {
      if ((err as { code?: string }).code === '42P01') {
        setFields([])
        return
      }
      setError(err.message)
      return
    }
    setFields((data ?? []) as WjField[])
  }, [household, projectId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  useEffect(() => {
    const handler = () => load()
    window.addEventListener('ff:wj-fields-changed', handler)
    return () => window.removeEventListener('ff:wj-fields-changed', handler)
  }, [load])

  const create = useCallback(
    async (input: CreateWjFieldInput) => {
      if (!household || !projectId) throw new Error('No project')
      const { data, error: err } = await supabase
        .from('wj_fields')
        .insert({
          project_id: projectId,
          household_id: household.id,
          key: input.key,
          label: input.label,
          type: input.type,
          options: input.options ?? null,
          money_direction: input.money_direction ?? null,
          is_required: input.is_required ?? false,
          sort_order: input.sort_order ?? fields.length,
          analytics_role: input.analytics_role ?? null,
          scope: input.scope ?? 'order',
        })
        .select(SELECT_COLS)
        .single()
      if (err) throw err
      setFields((prev) => [...prev, data as WjField])
      window.dispatchEvent(new CustomEvent('ff:wj-fields-changed'))
      return data as WjField
    },
    [household, projectId, fields.length],
  )

  const update = useCallback(async (id: string, patch: UpdateWjFieldInput) => {
    const { data, error: err } = await supabase
      .from('wj_fields')
      .update(patch)
      .eq('id', id)
      .select(SELECT_COLS)
      .single()
    if (err) throw err
    setFields((prev) => prev.map((f) => (f.id === id ? (data as WjField) : f)))
    window.dispatchEvent(new CustomEvent('ff:wj-fields-changed'))
    return data as WjField
  }, [])

  const remove = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('wj_fields').delete().eq('id', id)
    if (err) throw err
    setFields((prev) => prev.filter((f) => f.id !== id))
    window.dispatchEvent(new CustomEvent('ff:wj-fields-changed'))
  }, [])

  // Переупорядочивание: сохранить новый порядок sort_order пачкой.
  const reorder = useCallback(async (orderedIds: string[]) => {
    const updates = orderedIds.map((id, i) =>
      supabase.from('wj_fields').update({ sort_order: i }).eq('id', id),
    )
    const results = await Promise.all(updates)
    const firstErr = results.find((r) => r.error)?.error
    if (firstErr) throw firstErr
    setFields((prev) => {
      const byId = new Map(prev.map((f) => [f.id, f]))
      return orderedIds
        .map((id, i) => {
          const f = byId.get(id)
          return f ? { ...f, sort_order: i } : null
        })
        .filter((f): f is WjField => f !== null)
    })
    window.dispatchEvent(new CustomEvent('ff:wj-fields-changed'))
  }, [])

  // Поля шапки клиента vs поля заказа (по scope) — для раздельного рендера.
  const clientFields = fields.filter((f) => f.scope === 'client')
  const orderFields = fields.filter((f) => f.scope === 'order')

  return {
    fields,
    clientFields,
    orderFields,
    loading,
    error,
    reload: load,
    create,
    update,
    remove,
    reorder,
  }
}
