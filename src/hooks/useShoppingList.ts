import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/useApp'

export interface ShoppingItem {
  id: string
  household_id: string
  title: string
  added_by: string
  checked_at: string | null
  checked_by: string | null
  deleted_at: string | null
  created_at: string
}

const SELECT_COLS =
  'id, household_id, title, added_by, checked_at, checked_by, deleted_at, created_at'

const MAX_TITLE = 200

// Граница "сегодня" в локальной таймзоне пользователя. Возвращает ISO-строку
// начала текущего дня. Используется для фильтра doneToday.
function startOfLocalDayIso(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export function useShoppingList() {
  const { household, profile } = useApp()
  const [items, setItems] = useState<ShoppingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!household) {
      setItems([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('shopping_items')
      .select(SELECT_COLS)
      .eq('household_id', household.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    setLoading(false)
    if (err) {
      const code = (err as { code?: string }).code
      if (code === '42P01') {
        setItems([])
        return
      }
      setError(err.message)
      return
    }
    setItems(data ?? [])
  }, [household])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  // Локальная событийная шина — для синхронизации между виджетами в одной вкладке
  // (бейдж на Dashboard и страница /shopping). Realtime закроет кросс-устройство.
  useEffect(() => {
    const handler = () => load()
    window.addEventListener('ff:shopping-changed', handler)
    return () => window.removeEventListener('ff:shopping-changed', handler)
  }, [load])

  // Supabase Realtime: кросс-устройственное обновление. Жена пишет с дивана,
  // муж в магазине видит без F5. См. план — это первое использование Realtime
  // в проекте, специально под shopping list.
  useEffect(() => {
    if (!household) return
    const channel = supabase
      .channel(`shopping_items:${household.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shopping_items',
          filter: `household_id=eq.${household.id}`,
        },
        () => load(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [household, load])

  const pending = useMemo(
    () => items.filter((i) => i.checked_at === null),
    [items],
  )

  const doneToday = useMemo(() => {
    const startIso = startOfLocalDayIso()
    return items
      .filter((i) => i.checked_at !== null && i.checked_at >= startIso)
      .sort((a, b) => (a.checked_at! < b.checked_at! ? 1 : -1))
  }, [items])

  const history = useMemo(() => {
    const startIso = startOfLocalDayIso()
    return items
      .filter((i) => i.checked_at !== null && i.checked_at < startIso)
      .sort((a, b) => (a.checked_at! < b.checked_at! ? 1 : -1))
  }, [items])

  const notify = () => window.dispatchEvent(new CustomEvent('ff:shopping-changed'))

  const add = useCallback(
    async (titleRaw: string) => {
      if (!household || !profile) throw new Error('No household / profile')
      const title = titleRaw.trim().slice(0, MAX_TITLE)
      if (!title) return null
      const { data, error: err } = await supabase
        .from('shopping_items')
        .insert({
          household_id: household.id,
          title,
          added_by: profile.id,
        })
        .select(SELECT_COLS)
        .single()
      if (err) throw err
      notify()
      return data as ShoppingItem
    },
    [household, profile],
  )

  const addBatch = useCallback(
    async (titlesRaw: string[]) => {
      if (!household || !profile) throw new Error('No household / profile')
      const titles = titlesRaw
        .map((t) => t.trim().slice(0, MAX_TITLE))
        .filter((t) => t.length > 0)
      if (titles.length === 0) return []
      const { data, error: err } = await supabase
        .from('shopping_items')
        .insert(
          titles.map((title) => ({
            household_id: household.id,
            title,
            added_by: profile.id,
          })),
        )
        .select(SELECT_COLS)
      if (err) throw err
      notify()
      return (data ?? []) as ShoppingItem[]
    },
    [household, profile],
  )

  const toggle = useCallback(
    async (id: string) => {
      if (!profile) throw new Error('No profile')
      const item = items.find((i) => i.id === id)
      if (!item) return
      const patch =
        item.checked_at === null
          ? { checked_at: new Date().toISOString(), checked_by: profile.id }
          : { checked_at: null, checked_by: null }
      const { error: err } = await supabase
        .from('shopping_items')
        .update(patch)
        .eq('id', id)
      if (err) throw err
      notify()
    },
    [items, profile],
  )

  const remove = useCallback(async (id: string) => {
    const { error: err } = await supabase
      .from('shopping_items')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    if (err) throw err
    notify()
  }, [])

  const restore = useCallback(async (id: string) => {
    const { error: err } = await supabase
      .from('shopping_items')
      .update({ deleted_at: null })
      .eq('id', id)
    if (err) throw err
    notify()
  }, [])

  return {
    items,
    pending,
    doneToday,
    history,
    loading,
    error,
    reload: load,
    add,
    addBatch,
    toggle,
    remove,
    restore,
  }
}
