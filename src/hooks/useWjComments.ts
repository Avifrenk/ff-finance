import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/useApp'

// Комментарий в ленте под карточкой клиента. read/insert — по видимости проекта
// клиента; править/удалять может только автор (RLS). Лента — по возрастанию даты.
export interface WjComment {
  id: string
  client_id: string
  household_id: string
  author_profile_id: string
  body: string
  created_at: string
}

const SELECT_COLS = 'id, client_id, household_id, author_profile_id, body, created_at'

export function useWjComments(clientId?: string) {
  const { household, profile } = useApp()
  const [comments, setComments] = useState<WjComment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!household || !clientId) {
      setComments([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('wj_comments')
      .select(SELECT_COLS)
      .eq('client_id', clientId)
      .order('created_at', { ascending: true })
    setLoading(false)
    if (err) {
      if ((err as { code?: string }).code === '42P01') {
        setComments([])
        return
      }
      setError(err.message)
      return
    }
    setComments((data ?? []) as WjComment[])
  }, [household, clientId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  useEffect(() => {
    const handler = () => load()
    window.addEventListener('ff:wj-comments-changed', handler)
    return () => window.removeEventListener('ff:wj-comments-changed', handler)
  }, [load])

  const add = useCallback(
    async (body: string) => {
      const text = body.trim()
      if (!text) return null
      if (!household || !clientId || !profile) throw new Error('No client')
      const { data, error: err } = await supabase
        .from('wj_comments')
        .insert({
          client_id: clientId,
          household_id: household.id,
          author_profile_id: profile.id,
          body: text,
        })
        .select(SELECT_COLS)
        .single()
      if (err) throw err
      setComments((prev) => [...prev, data as WjComment])
      window.dispatchEvent(new CustomEvent('ff:wj-comments-changed'))
      return data as WjComment
    },
    [household, clientId, profile],
  )

  const remove = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('wj_comments').delete().eq('id', id)
    if (err) throw err
    setComments((prev) => prev.filter((c) => c.id !== id))
    window.dispatchEvent(new CustomEvent('ff:wj-comments-changed'))
  }, [])

  return { comments, loading, error, reload: load, add, remove }
}
