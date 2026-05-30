import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/useApp'

export interface Budget {
  id: string
  household_id: string
  category_id: string
  month: string
  amount: number
  created_by: string
  created_at: string
  updated_at: string
}

const SELECT_COLS =
  'id, household_id, category_id, month, amount, created_by, created_at, updated_at'

/** Месяц-ключ ISO: 2026-05-01 для мая 2026. */
export function monthKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01`
}

export function previousMonthKey(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const prev = new Date(y, m - 2, 1) // m уже 1-индексирован, минус ещё месяц
  return monthKey(prev)
}

/**
 * Бюджеты конкретного месяца (по умолчанию — текущий).
 * Хук возвращает { budgets, upsert, remove, copyFromPreviousMonth } по стилю
 * useSchedules. Все суммы хранятся в households.base_currency.
 */
export function useBudgets(month: string) {
  const { household, profile } = useApp()
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!household) {
      setBudgets([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('budgets')
      .select(SELECT_COLS)
      .eq('household_id', household.id)
      .eq('month', month)
    setLoading(false)
    if (err) {
      // 42P01 = relation does not exist. Если миграция ещё не применена,
      // тихо возвращаем пустой список — UI не ломаем.
      if ((err as { code?: string }).code === '42P01') {
        setBudgets([])
        return
      }
      setError(err.message)
      return
    }
    setBudgets(data ?? [])
  }, [household, month])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  useEffect(() => {
    const handler = () => load()
    window.addEventListener('ff:budgets-changed', handler)
    return () => window.removeEventListener('ff:budgets-changed', handler)
  }, [load])

  const upsert = useCallback(
    async (categoryId: string, amount: number) => {
      if (!household || !profile) throw new Error('No household')
      if (!isFinite(amount) || amount <= 0) {
        throw new Error('Сумма должна быть положительной')
      }
      const { data, error: err } = await supabase
        .from('budgets')
        .upsert(
          {
            household_id: household.id,
            category_id: categoryId,
            month,
            amount,
            created_by: profile.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'household_id,category_id,month' },
        )
        .select(SELECT_COLS)
        .single()
      if (err) throw err
      setBudgets((prev) => {
        const without = prev.filter((b) => b.category_id !== categoryId)
        return [...without, data]
      })
      window.dispatchEvent(new CustomEvent('ff:budgets-changed'))
      return data
    },
    [household, profile, month],
  )

  const remove = useCallback(
    async (categoryId: string) => {
      if (!household) throw new Error('No household')
      const { error: err } = await supabase
        .from('budgets')
        .delete()
        .eq('household_id', household.id)
        .eq('category_id', categoryId)
        .eq('month', month)
      if (err) throw err
      setBudgets((prev) => prev.filter((b) => b.category_id !== categoryId))
      window.dispatchEvent(new CustomEvent('ff:budgets-changed'))
    },
    [household, month],
  )

  /**
   * Копирует бюджеты с предыдущего месяца. Уже существующие на текущем месяце
   * не перезаписывает. Возвращает количество скопированных строк.
   */
  const copyFromPreviousMonth = useCallback(async (): Promise<number> => {
    if (!household || !profile) throw new Error('No household')
    const prev = previousMonthKey(month)
    const { data: prevRows, error: prevErr } = await supabase
      .from('budgets')
      .select('category_id, amount')
      .eq('household_id', household.id)
      .eq('month', prev)
    if (prevErr) throw prevErr
    if (!prevRows || prevRows.length === 0) return 0

    const existing = new Set(budgets.map((b) => b.category_id))
    const toInsert = prevRows
      .filter((r) => !existing.has(r.category_id))
      .map((r) => ({
        household_id: household.id,
        category_id: r.category_id,
        month,
        amount: r.amount,
        created_by: profile.id,
      }))
    if (toInsert.length === 0) return 0
    const { data: inserted, error: insErr } = await supabase
      .from('budgets')
      .insert(toInsert)
      .select(SELECT_COLS)
    if (insErr) throw insErr
    setBudgets((prev) => [...prev, ...(inserted ?? [])])
    window.dispatchEvent(new CustomEvent('ff:budgets-changed'))
    return inserted?.length ?? 0
  }, [household, profile, month, budgets])

  return { budgets, loading, error, reload: load, upsert, remove, copyFromPreviousMonth }
}

/**
 * Хук для Dashboard: бюджеты на месяц + быстрая мапа categoryId → amount.
 * Не требует прав на запись, чтобы Dashboard не подтягивал всю CRUD-логику.
 */
export function useBudgetsByCategory(month: string) {
  const { budgets, loading, error } = useBudgets(month)
  const byCategory = new Map<string, number>()
  for (const b of budgets) byCategory.set(b.category_id, Number(b.amount))
  return { byCategory, loading, error }
}
