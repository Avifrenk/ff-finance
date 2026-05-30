/**
 * Web Push subscription helpers — браузерный API, без БД.
 * useApp/usePush обвязывают это вызовами Supabase.
 */

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

export async function subscribeToPush(vapidPublicKey: string): Promise<PushSubscription> {
  if (!isPushSupported()) {
    throw new Error('Push API не поддерживается в этом браузере')
  }
  if (!vapidPublicKey) {
    throw new Error('VITE_VAPID_PUBLIC_KEY не задан')
  }
  const reg = await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  if (existing) return existing
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
  })
}

export async function unsubscribeFromPush(): Promise<string | null> {
  const sub = await getCurrentSubscription()
  if (!sub) return null
  const endpoint = sub.endpoint
  await sub.unsubscribe()
  return endpoint
}

export function subscriptionToPayload(sub: PushSubscription): {
  endpoint: string
  p256dh: string
  auth: string
} {
  const json = sub.toJSON()
  const keys = json.keys ?? {}
  if (!json.endpoint || !keys.p256dh || !keys.auth) {
    throw new Error('Subscription без endpoint/p256dh/auth — браузер не вернул ключи')
  }
  return { endpoint: json.endpoint, p256dh: keys.p256dh, auth: keys.auth }
}

// URL-safe base64 → Uint8Array. Web Push требует именно такую конверсию для
// applicationServerKey — стандартный atob спотыкается на `-` и `_`.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const output = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) output[i] = rawData.charCodeAt(i)
  return output
}
