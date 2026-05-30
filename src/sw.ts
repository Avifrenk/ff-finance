/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>
}

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('push', (event: PushEvent) => {
  const raw = event.data?.text() ?? '{}'
  let data: { title?: string; body?: string; url?: string } = {}
  try {
    data = JSON.parse(raw) as typeof data
  } catch {
    data = { title: 'FF Finance', body: raw }
  }
  const title = data.title ?? 'FF Finance'
  const body = data.body ?? ''
  const url = data.url ?? '/'
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      data: { url },
    }),
  )
})

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()
  const data = event.notification.data as { url?: string } | undefined
  const url = data?.url ?? '/'
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of clients) {
        if (client.url.endsWith(url)) {
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    })(),
  )
})

self.addEventListener('install', () => {
  void self.skipWaiting()
})
self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(self.clients.claim())
})
