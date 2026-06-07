import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/useApp'

// Цель привязки задачи: либо проект целиком, либо конкретная запись (клиент/заказ)
// внутри проекта. Один плоский список для автокомплита «проект · клиент» —
// без каскадных дропдаунов (находка UX, Фаза 4).
export interface WjLinkTarget {
  projectId: string
  recordId: string | null // null = привязка к проекту целиком
  label: string // имя клиента (для записи) или имя проекта
  context: string | null // имя проекта (для записи) — показываем как подпись
  search: string // нормализованная строка для поиска
}

interface RecordRow {
  id: string
  project_id: string
  values: Record<string, unknown>
}

interface FieldRow {
  project_id: string
  key: string
  type: string
  analytics_role: string | null
  sort_order: number
}

// Имя клиента из записи: поле с ролью client_name → первое текстовое поле →
// первое непустое строковое значение. Фаза 4 обычно пустая (записи — Фаза 6),
// но автокомплит должен заработать сразу, как появятся данные.
function recordLabel(
  values: Record<string, unknown>,
  fields: FieldRow[],
): string {
  const byRole = fields.find((f) => f.analytics_role === 'client_name')
  const byType = fields.find((f) => f.type === 'text' || f.type === 'phone')
  for (const f of [byRole, byType].filter(Boolean) as FieldRow[]) {
    const v = values[f.key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  for (const v of Object.values(values)) {
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return 'Запись без имени'
}

/**
 * Плоский список целей привязки (проекты + записи) для автокомплита.
 * RLS отсекает чужие personal. Объёмы v1 (десятки-сотни записей) — грузим всё
 * разом и фильтруем на клиенте.
 */
export function useWjLinkTargets() {
  const { household } = useApp()
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [records, setRecords] = useState<RecordRow[]>([])
  const [fields, setFields] = useState<FieldRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!household) {
      setProjects([])
      setRecords([])
      setFields([])
      setLoading(false)
      return
    }
    setLoading(true)
    const [pRes, rRes, fRes] = await Promise.all([
      supabase
        .from('wj_projects')
        .select('id, name')
        .eq('household_id', household.id)
        .eq('is_archived', false)
        .order('created_at', { ascending: false }),
      supabase
        .from('wj_records')
        .select('id, project_id, values')
        .eq('household_id', household.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('wj_fields')
        .select('project_id, key, type, analytics_role, sort_order')
        .eq('household_id', household.id)
        .order('sort_order', { ascending: true }),
    ])
    setLoading(false)
    // 42P01 (нет таблицы) и любые ошибки → пустые списки, UI не падает.
    setProjects(pRes.error ? [] : ((pRes.data ?? []) as { id: string; name: string }[]))
    setRecords(rRes.error ? [] : ((rRes.data ?? []) as RecordRow[]))
    setFields(fRes.error ? [] : ((fRes.data ?? []) as FieldRow[]))
  }, [household])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  useEffect(() => {
    const handler = () => load()
    window.addEventListener('ff:wj-projects-changed', handler)
    window.addEventListener('ff:wj-records-changed', handler)
    window.addEventListener('ff:wj-fields-changed', handler)
    return () => {
      window.removeEventListener('ff:wj-projects-changed', handler)
      window.removeEventListener('ff:wj-records-changed', handler)
      window.removeEventListener('ff:wj-fields-changed', handler)
    }
  }, [load])

  const targets = useMemo<WjLinkTarget[]>(() => {
    const projectName = new Map(projects.map((p) => [p.id, p.name]))
    const fieldsByProject = new Map<string, FieldRow[]>()
    for (const f of fields) {
      const arr = fieldsByProject.get(f.project_id)
      if (arr) arr.push(f)
      else fieldsByProject.set(f.project_id, [f])
    }
    const out: WjLinkTarget[] = []
    for (const p of projects) {
      out.push({
        projectId: p.id,
        recordId: null,
        label: p.name,
        context: null,
        search: p.name.toLowerCase(),
      })
    }
    for (const r of records) {
      const pName = projectName.get(r.project_id)
      if (!pName) continue // запись осиротевшего/невидимого проекта — пропускаем
      const label = recordLabel(r.values, fieldsByProject.get(r.project_id) ?? [])
      out.push({
        projectId: r.project_id,
        recordId: r.id,
        label,
        context: pName,
        search: `${pName} ${label}`.toLowerCase(),
      })
    }
    return out
  }, [projects, records, fields])

  // Резолвер для отображения уже привязанной задачи (project_id [+ record_id]).
  const resolve = useCallback(
    (projectId: string | null, recordId: string | null): WjLinkTarget | null => {
      if (!projectId) return null
      if (recordId) {
        const t = targets.find((x) => x.recordId === recordId)
        if (t) return t
      }
      const p = targets.find((x) => x.projectId === projectId && x.recordId === null)
      return p ?? null
    },
    [targets],
  )

  return { targets, resolve, loading, reload: load }
}
