import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/useApp'

export interface FlightRoute {
  id: number
  owner_chat_id: number
  origin: string
  destination: string
  depart_date: string
  return_date: string | null
  status: 'active' | 'archived'
  created_at: string
  max_transfers: number | null
  airlines: string | null
  airlines_mode: 'only' | 'except' | null
  household_id: string | null
  created_by_profile_id: string | null
}

/** Сводка по наблюдениям одного маршрута (веб только читает их — пишет бот). */
export interface RouteStats {
  count: number
  last: {
    price: number
    currency: string
    airline: string
    transfers: number
    link: string
    observed_at: string
  } | null
  min: number | null
  max: number | null
  avg: number | null
  /** Цены по времени (ascending) для мини-спарклайна. */
  series: number[]
}

export interface CreateRouteInput {
  origin: string
  destination: string
  depart_date: string
  return_date: string | null
  max_transfers: number | null
  airlines: string | null
  airlines_mode: 'only' | 'except' | null
  /** chat_id создателя — берём из flight_telegram_links, кладём в owner_chat_id. */
  owner_chat_id: number
}

const ROUTE_COLS =
  'id, owner_chat_id, origin, destination, depart_date, return_date, status, created_at, max_transfers, airlines, airlines_mode, household_id, created_by_profile_id'

export function useFlightRoutes() {
  const { household, profile } = useApp()
  const [routes, setRoutes] = useState<FlightRoute[]>([])
  const [stats, setStats] = useState<Record<number, RouteStats>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!household) {
      setRoutes([])
      setStats({})
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)

    const { data: routeRows, error: routeErr } = await supabase
      .from('flight_routes')
      .select(ROUTE_COLS)
      .eq('household_id', household.id)
      .order('created_at', { ascending: false })

    if (routeErr) {
      setLoading(false)
      // 42P01 = relation does not exist (миграция не применена) — не падаем.
      if ((routeErr as { code?: string }).code === '42P01') {
        setRoutes([])
        setStats({})
        return
      }
      setError(routeErr.message)
      return
    }

    const list = (routeRows ?? []) as FlightRoute[]
    setRoutes(list)

    const ids = list.map((r) => r.id)
    if (ids.length === 0) {
      setStats({})
      setLoading(false)
      return
    }

    const { data: obsRows, error: obsErr } = await supabase
      .from('flight_observations')
      .select('route_id, price, currency, airline, transfers, link, observed_at')
      .in('route_id', ids)
      .order('observed_at', { ascending: true })

    setLoading(false)
    if (obsErr) {
      // Наблюдений может не быть/таблица недоступна — карточки покажут «нет данных».
      setStats({})
      return
    }

    const byRoute: Record<number, RouteStats> = {}
    for (const id of ids) {
      byRoute[id] = { count: 0, last: null, min: null, max: null, avg: null, series: [] }
    }
    for (const o of obsRows ?? []) {
      const s = byRoute[o.route_id]
      if (!s) continue
      s.count += 1
      s.series.push(o.price)
      s.min = s.min === null ? o.price : Math.min(s.min, o.price)
      s.max = s.max === null ? o.price : Math.max(s.max, o.price)
      // obsRows отсортированы по времени — последнее наблюдение перетирает last.
      s.last = {
        price: o.price,
        currency: o.currency,
        airline: o.airline,
        transfers: o.transfers,
        link: o.link,
        observed_at: o.observed_at,
      }
    }
    for (const id of ids) {
      const s = byRoute[id]
      if (s.count > 0) s.avg = s.series.reduce((a, b) => a + b, 0) / s.count
    }
    setStats(byRoute)
  }, [household])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const create = useCallback(
    async (input: CreateRouteInput) => {
      if (!household || !profile) throw new Error('Нет household')
      const { data, error: err } = await supabase
        .from('flight_routes')
        .insert({
          household_id: household.id,
          created_by_profile_id: profile.id,
          owner_chat_id: input.owner_chat_id,
          origin: input.origin,
          destination: input.destination,
          depart_date: input.depart_date,
          return_date: input.return_date,
          status: 'active',
          max_transfers: input.max_transfers,
          airlines: input.airlines,
          airlines_mode: input.airlines_mode,
        })
        .select(ROUTE_COLS)
        .single()
      if (err) throw err
      setRoutes((prev) => [data as FlightRoute, ...prev])
      return data as FlightRoute
    },
    [household, profile],
  )

  const setArchived = useCallback(async (id: number, archived: boolean) => {
    const { data, error: err } = await supabase
      .from('flight_routes')
      .update({ status: archived ? 'archived' : 'active' })
      .eq('id', id)
      .select(ROUTE_COLS)
      .single()
    if (err) throw err
    setRoutes((prev) => prev.map((r) => (r.id === id ? (data as FlightRoute) : r)))
    return data as FlightRoute
  }, [])

  const remove = useCallback(async (id: number) => {
    const { error: err } = await supabase.from('flight_routes').delete().eq('id', id)
    if (err) throw err
    setRoutes((prev) => prev.filter((r) => r.id !== id))
  }, [])

  return { routes, stats, loading, error, reload: load, create, setArchived, remove }
}
