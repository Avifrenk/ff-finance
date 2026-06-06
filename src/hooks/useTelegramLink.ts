import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/useApp'

// Связка «мой профиль ↔ мой telegram chat_id». Нужна, чтобы при создании
// маршрута проставить owner_chat_id (боту — куда слать пуш о скидке).
// RLS: каждый видит связки своей семьи, но правит только свою (profile_id =
// auth.uid()). chat_id — секрет: не логируем, не показываем в чужих местах.

export function useTelegramLink() {
  const { profile } = useApp()
  const [chatId, setChatId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!profile) {
      setChatId(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('flight_telegram_links')
      .select('chat_id')
      .eq('profile_id', profile.id)
      .maybeSingle()
    setLoading(false)
    if (error) {
      // 42P01 (нет таблицы) или прочее — считаем «не привязан».
      setChatId(null)
      return
    }
    setChatId(data?.chat_id ?? null)
  }, [profile])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  // Связку могут править из разных мест (диалог привязки и страница держат
  // отдельные экземпляры хука) — синхронизируем их общим событием.
  useEffect(() => {
    const handler = () => load()
    window.addEventListener('ff:flight-link-changed', handler)
    return () => window.removeEventListener('ff:flight-link-changed', handler)
  }, [load])

  /** Сохранить/обновить свой chat_id (upsert по profile_id). */
  const save = useCallback(
    async (newChatId: number) => {
      if (!profile) throw new Error('Нет профиля')
      const { error } = await supabase
        .from('flight_telegram_links')
        .upsert(
          { profile_id: profile.id, chat_id: newChatId },
          { onConflict: 'profile_id' },
        )
      if (error) throw error
      setChatId(newChatId)
      window.dispatchEvent(new CustomEvent('ff:flight-link-changed'))
    },
    [profile],
  )

  return { chatId, linked: chatId !== null, loading, reload: load, save }
}
