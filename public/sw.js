/* Trip Clubhouse — service worker: push notifications + open-with-no-signal.
 *
 * Push: receives Web Push and drives the app badge (unchanged; see below).
 *
 * Offline (added 2026-10-27, "Phase 2"): keeps a copy of the app so it opens from
 * the home screen with no signal. Built so nobody can get stuck on an old version:
 *   • The page itself (index.html) is NETWORK-FIRST: with any signal the latest
 *     version always loads; the saved copy is used only if the network fails or
 *     takes longer than 4s.
 *   • /assets/* files have the version in their name (index-<hash>.js), so they're
 *     safe to keep: cache-first. Old versions are pruned whenever a fresh page loads.
 *   • Google Fonts are kept so the serif still shows offline.
 *   • NOTHING else is stored — never Supabase/database calls, Netlify functions or
 *     anything else cross-origin. Data offline is handled by the app itself.
 * Bump CACHE_VERSION to throw every saved copy away on the next visit.
 *
 * Push payload shape (from netlify/functions/chat-notify.js):
 *   { title, body, badge, url, tag }
 * title = sender's name, body = message. The app name ("Trip Clubhouse") is NOT
 * in the payload — iOS already renders it in the system notification header.
 */

const CACHE_VERSION = 'v1'
const SHELL = `tc-shell-${CACHE_VERSION}`   // the page (index.html)
const ASSETS = `tc-assets-${CACHE_VERSION}` // versioned JS/CSS + icons
const FONTS = `tc-fonts-${CACHE_VERSION}`   // Google Fonts
const KEEP = [SHELL, ASSETS, FONTS]
const PAGE_TIMEOUT_MS = 4000

// Asset URLs referenced by a page (so we can save them and prune old versions).
function assetUrlsIn(html) {
  const out = new Set()
  for (const m of html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)) out.add(m[1])
  return [...out]
}

// Save a fresh copy of the page plus everything it needs, and drop asset files
// from older versions.
async function savePage(response) {
  const html = await response.clone().text()
  const shell = await caches.open(SHELL)
  await shell.put('/', new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
  const wanted = assetUrlsIn(html)
  const assets = await caches.open(ASSETS)
  await Promise.all(wanted.map(async url => {
    if (!(await assets.match(url, { ignoreVary: true }))) { try { await assets.add(url) } catch { /* next time */ } }
  }))
  for (const req of await assets.keys()) {
    const path = new URL(req.url).pathname
    if (path.startsWith('/assets/') && !wanted.includes(path)) await assets.delete(req)
  }
}

self.addEventListener('install', (event) => {
  self.skipWaiting()
  // Save the app straight away so the very next launch already works offline.
  event.waitUntil((async () => {
    try {
      const res = await fetch('/', { cache: 'no-store' })
      if (res.ok) await savePage(res)
      const assets = await caches.open(ASSETS)
      await Promise.all(['/icon-192.png', '/apple-touch-icon.png', '/manifest.json', '/favicon.svg'].map(u => assets.add(u).catch(() => {})))
    } catch { /* offline during install — saved on a later visit */ }
  })())
})

self.addEventListener('activate', (event) => event.waitUntil((async () => {
  // Drop saved copies from older CACHE_VERSIONs.
  for (const name of await caches.keys()) if (name.startsWith('tc-') && !KEEP.includes(name)) await caches.delete(name)
  await self.clients.claim()
})()))

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // Google Fonts: serve the saved copy, refresh it in the background.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith((async () => {
      const cache = await caches.open(FONTS)
      const hit = await cache.match(req, { ignoreVary: true })
      const fresh = fetch(req).then(res => { if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res }).catch(() => null)
      return hit || (await fresh) || Response.error()
    })())
    return
  }

  // Everything else cross-origin (Supabase, weather, golf API…) is never touched.
  if (url.origin !== self.location.origin) return
  // Netlify functions and the service worker itself: always live.
  if (url.pathname.startsWith('/.netlify/') || url.pathname === '/sw.js') return

  // The page: network-first (4s), saved copy only when there's no signal.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await Promise.race([
          fetch(req),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), PAGE_TIMEOUT_MS)),
        ])
        if (res.ok) event.waitUntil(savePage(res.clone()).catch(() => {}))
        return res
      } catch {
        const saved = await (await caches.open(SHELL)).match('/', { ignoreVary: true, ignoreSearch: true })
        return saved || Response.error()
      }
    })())
    return
  }

  // Versioned assets + icons: saved copy first, otherwise fetch and save.
  // Matched by path with ignoreVary: the page asks for its module script with an
  // Origin header (crossorigin) while the saved copy was fetched without one, and
  // servers mark these files "Vary: Origin" — a strict match would miss offline.
  if (url.pathname.startsWith('/assets/') || /\.(png|svg|ico|json|webmanifest)$/.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(ASSETS)
      const hit = await cache.match(url.pathname, { ignoreVary: true, ignoreSearch: true })
      if (hit) return hit
      try {
        const res = await fetch(req)
        if (res.ok) cache.put(url.pathname, res.clone())
        return res
      } catch {
        return Response.error()
      }
    })())
  }
})

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = {} }

  const title = data.title || 'Trip Clubhouse' // sender's name (fallback if missing)
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
