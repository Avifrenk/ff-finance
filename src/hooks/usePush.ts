import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/useApp'
import {
  getCurrentSubscription,
  isPushSupported,
  subscribeToPush,
  subscriptionToPayload,
  unsubscribeFromPush,
} from '../lib/push'

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export function usePush() {
  const { profile } = useApp()
  const [supported, setSupported] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function check() {
      const isSup = isPushSupported()
      if (cancelled) return
      setSupported(isSup)
      if (!isSup) {
        setLoading(false)
        return
      }
      setPermission(Notification.permission)
      const sub = await getCurrentSubscription()
      if (cancelled) return
      setIsSubscribed(sub !== null)
      setLoading(false)
    }
    void check()
    return () => {
      cancelled = true
    }
  }, [])

  async function enable() {
    setError(null)
    if (!profile) {
      setError('Не залогинены')
      return
    }
    if (!VAPID_PUBLIC) {
      setError('VAPID public key не задан (VITE_VAPID_PUBLIC_KEY)')
      return
    }
    setLoading(true)
    try {
      if (Notification.permission === 'default') {
        const result = await Notification.requestPermission()
        setPermission(result)
        if (result !== 'granted') {
          setLoading(false)
          return
        }
      } else if (Notification.permission === 'denied') {
        setPermission('denied')
        setLoading(false)
        return
      } else {
        setPermission('granted')
      }
      const sub = await subscribeToPush(VAPID_PUBLIC)
      const payload = subscriptionToPayload(sub)
      const { error: err } = await supabase
        .from('push_subscriptions')
        .upsert(
          { profile_id: profile.id, user_agent: navigator.userAgent, ...payload },
          { onConflict: 'profile_id,endpoint' },
        )
      if (err) throw err
      setIsSubscribed(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось включить уведомления')
    } finally {
      setLoading(false)
    }
  }

  async function disable() {
    setError(null)
    setLoading(true)
    try {
      const endpoint = await unsubscribeFromPush()
      if (endpoint && profile) {
        const { error: err } = await supabase
          .from('push_subscriptions')
          .delete()
          .eq('profile_id', profile.id)
          .eq('endpoint', endpoint)
        if (err) throw err
      }
      setIsSubscribed(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось отключить уведомления')
    } finally {
      setLoading(false)
    }
  }

  return { supported, permission, isSubscribed, loading, error, enable, disable }
}
