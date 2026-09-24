/* Trip Clubhouse — push-only service worker.
 *
 * DELIBERATELY MINIMAL. There is intentionally NO fetch/caching handler: this SW
 * exists solely to receive Web Push and drive the app badge. With no fetch
 * handler it never intercepts navigation or asset requests, so it can't serve a
 * stale bundle or change how the PWA installs/updates — it's purely additive to
 * the (previously service-worker-less) app.
 *
 * Push payload shape (from netlify/functions/chat-notify.js):
 *   { title, body, badge, url, tag }
 */

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = {} }

  const title = data.title || 'Trip Clubhouse'
  const body = data.body || 'New message'
  const url = data.url || '/'
  const tag = data.tag || 'trash-talk'
  const badge = typeof data.badge === 'number' ? data.badge : null

  event.waitUntil((async () => {
    await self.registration.showNotification(title, {
      body,
      tag,          // collapse repeated thread notifications into one
      renotify: true,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url },
    })
    // Drive the home-screen app icon badge from the server-computed unread count.
    if (badge != null && 'setAppBadge' in self.navigator) {
      try { await self.navigator.setAppBadge(badge) } catch { /* unsupported */ }
    }
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of wins) {
      if ('focus' in c) {
        await c.focus()
        if (c.navigate && url !== '/') { try { await c.navigate(url) } catch { /* cross-origin */ } }
        return
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(url)
  })())
})
