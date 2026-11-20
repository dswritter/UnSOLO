'use client'

/**
 * Web "local vs online" sync for writes: if a create fails because the browser is offline, the
 * request (with its idempotent clientId) is kept in localStorage and replayed when back online.
 * Native apps do the same with Room / SwiftData outboxes.
 */
const KEY = 'unsolo.outbox.v1'
type Item = { id: string; path: string; body: unknown; createdAt: number; tries: number }

function read(): Item[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Item[] } catch { return [] }
}
function write(items: Item[]) {
  try { localStorage.setItem(KEY, JSON.stringify(items.slice(-50))) } catch { /* quota */ }
}

export function enqueue(path: string, body: unknown, id: string) {
  write([...read().filter((i) => i.id !== id), { id, path, body, createdAt: Date.now(), tries: 0 }])
}

export function pendingCount() {
  return read().length
}

let flushing = false
export async function flushOutbox(): Promise<number> {
  if (flushing || typeof navigator !== 'undefined' && !navigator.onLine) return 0
  flushing = true
  let sent = 0
  try {
    for (const item of read()) {
      try {
        const res = await fetch(`/api/v1${item.path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-unsolo-client': 'web' }, body: JSON.stringify(item.body) })
        if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) {
          write(read().filter((i) => i.id !== item.id)) // done, or permanently rejected
          if (res.ok) sent++
        } else {
          write(read().map((i) => (i.id === item.id ? { ...i, tries: i.tries + 1 } : i)))
        }
      } catch {
        break // still offline
      }
    }
  } finally {
    flushing = false
  }
  return sent
}

export function isNetworkError(e: unknown) {
  return e instanceof TypeError || (typeof navigator !== 'undefined' && !navigator.onLine)
}
