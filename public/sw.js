/* UnSOLO service worker: web push + fast repeat loads.
   - Push: shows the notification and opens its internal link on click.
   - Cache: static assets cache-first; Supabase storage images stale-while-revalidate (thumbs first);
     navigations network-first with an offline fallback to the last cached page. Never caches /api. */
const VERSION = 'unsolo-v1'
const STATIC = `${VERSION}-static`
const IMAGES = `${VERSION}-images`
const PAGES = `${VERSION}-pages`
const MAX_IMAGES = 300

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(PAGES).then((c) => c.add('/offline')).catch(() => undefined).then(() => self.skipWaiting()))
})

// Sign-out clears anything cached for this browser.
self.addEventListener('message', (event) => {
  if (event.data === 'unsolo:signed-out') event.waitUntil(Promise.all([caches.delete(PAGES), caches.delete(IMAGES)]))
})
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (!key.startsWith(VERSION)) await caches.delete(key)
    await self.clients.claim()
  })())
})

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i])
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return

  if (url.origin === location.origin && url.pathname.startsWith('/_next/static/')) {
    event.respondWith(caches.open(STATIC).then(async (c) => (await c.match(req)) || c.add(req).then(() => c.match(req)).catch(() => fetch(req))))
    return
  }
  if (/\.supabase\.co$/.test(url.hostname) && url.pathname.includes('/storage/v1/object/public/')) {
    event.respondWith((async () => {
      const cache = await caches.open(IMAGES)
      const hit = await cache.match(req)
      const network = fetch(req).then((res) => {
        if (res.ok) { cache.put(req, res.clone()); trim(IMAGES, MAX_IMAGES) }
        return res
      }).catch(() => hit)
      return hit || network
    })())
    return
  }
  if (req.mode === 'navigate' && url.origin === location.origin) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req)
        // Privacy: never keep signed-in / personalised pages (private or no-store) in Cache Storage.
        const cc = res.headers.get('cache-control') || ''
        if (res.ok && !/no-store|private/i.test(cc)) (await caches.open(PAGES)).put(req, res.clone()).then(() => trim(PAGES, 30))
        return res
      } catch {
        return (await caches.match(req)) || (await caches.match('/offline')) || Response.error()
      }
    })())
  }
})

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { title: 'UnSOLO', body: event.data && event.data.text() } }
  const link = typeof data.link === 'string' && data.link.startsWith('/') && !data.link.startsWith('//') ? data.link : '/activity'
  event.waitUntil(self.registration.showNotification(data.title || 'UnSOLO', {
    body: data.body || '', tag: data.tag || undefined, data: { link }, icon: '/icon-192.png', badge: '/icon-192.png',
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const link = (event.notification.data && event.notification.data.link) || '/activity'
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of all) if (new URL(c.url).origin === location.origin) { await c.focus(); return c.navigate(link) }
    return self.clients.openWindow(link)
  })())
})
