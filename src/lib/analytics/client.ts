'use client'

/**
 * Web analytics queue → POST /api/v1/events. Batches up to 50, flushes every 30 s and on
 * page hide (sendBeacon). anonId/sessionId are random and stored per browser; no PII.
 */
type Ev = { name: string; screen?: string; props?: Record<string, unknown>; ts: string; anonId: string; sessionId: string }

const queue: Ev[] = []
let timer: ReturnType<typeof setTimeout> | null = null

function ids() {
  let anonId = '', sessionId = ''
  try {
    anonId = localStorage.getItem('unsolo.anonId') ?? ''
    if (!anonId) { anonId = crypto.randomUUID(); localStorage.setItem('unsolo.anonId', anonId) }
    sessionId = sessionStorage.getItem('unsolo.sessionId') ?? ''
    if (!sessionId) { sessionId = crypto.randomUUID(); sessionStorage.setItem('unsolo.sessionId', sessionId) }
  } catch { /* private mode */ }
  return { anonId, sessionId }
}

export function track(name: string, props: Record<string, unknown> = {}, screen?: string) {
  if (typeof window === 'undefined') return
  queue.push({ name, props, screen, ts: new Date().toISOString(), ...ids() })
  if (queue.length >= 50) flush()
  else if (!timer) timer = setTimeout(flush, 30_000)
}

export function trackScreen(screen: string, props: Record<string, unknown> = {}) {
  track('screen.view', props, screen)
  try {
    // local tab-usage counts (for the landing-page suggestion when offline / signed out)
    const k = 'unsolo.tabVisits'
    const v = JSON.parse(localStorage.getItem(k) ?? '{}') as Record<string, number>
    v[screen] = (v[screen] ?? 0) + 1
    localStorage.setItem(k, JSON.stringify(v))
  } catch { /* ignore */ }
}

export function flush(useBeacon = false) {
  if (timer) { clearTimeout(timer); timer = null }
  if (queue.length === 0) return
  const events = queue.splice(0, 50).map(({ ts, ...e }) => ({ ...e, ts }))
  const body = JSON.stringify({ events })
  if (useBeacon && navigator.sendBeacon) {
    navigator.sendBeacon('/api/v1/events', new Blob([body], { type: 'application/json' }))
    return
  }
  void fetch('/api/v1/events', { method: 'POST', headers: { 'content-type': 'application/json', 'x-unsolo-client': 'web' }, body, keepalive: true }).catch(() => {
    queue.unshift(...events.map((e) => ({ ...e, ts: e.ts }))) // retry next flush
  })
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => flush(true))
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush(true))
}
