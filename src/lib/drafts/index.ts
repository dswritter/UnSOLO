'use client'

import { useCallback, useSyncExternalStore } from 'react'

/**
 * Unsent text kept in this browser (comments, join intros, posts) so it survives sign-in, a reload or
 * going back. A draft lives until it is sent or the person discards it. Display convenience only:
 * nothing here is trusted by the server.
 */
const PREFIX = 'unsolo.draft.'
const EVENT = 'unsolo:draft'

export function readDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch { return null }
}

/** Saves a draft; `null`, '' or an object with no filled-in values removes it. */
export function writeDraft(key: string, value: unknown) {
  try {
    if (isEmpty(value)) localStorage.removeItem(PREFIX + key)
    else localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch { /* private mode / quota: drafts are best-effort */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT, { detail: key }))
}

export const clearDraft = (key: string) => writeDraft(key, null)

function isEmpty(v: unknown): boolean {
  if (v == null) return true
  if (typeof v === 'string') return v.trim() === ''
  if (Array.isArray(v)) return v.every(isEmpty)
  if (typeof v === 'object') return Object.values(v as Record<string, unknown>).every(isEmpty)
  return false
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb)
  window.addEventListener('storage', cb)
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener('storage', cb) }
}

/** A text draft as state: empty on the server and first paint, the saved text right after hydration. */
export function useTextDraft(key: string): [string, (v: string) => void] {
  const value = useSyncExternalStore(subscribe, () => readDraft<string>(key) ?? '', () => '')
  const set = useCallback((v: string) => writeDraft(key, v), [key])
  return [value, set]
}

const noop = () => () => {}
/** true once running in the browser after hydration. */
export function useHydrated() {
  return useSyncExternalStore(noop, () => true, () => false)
}
