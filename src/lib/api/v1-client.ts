'use client'

import { ApiClientError, apiFetch } from '@/lib/api/client'

export type V1Result<T> = { ok: true; data: T } | { ok: false; status: number; error: string }

/**
 * Result-style wrapper over `apiFetch` (cookie session, x-unsolo-client: web) for components that
 * show errors in place instead of catching.
 */
export async function v1<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<V1Result<T>> {
  try {
    return { ok: true, data: await apiFetch<T>(path.startsWith('/') ? path : `/${path}`, init) }
  } catch (e) {
    if (e instanceof ApiClientError) return { ok: false, status: e.status, error: e.message }
    if ((e as Error)?.name === 'AbortError') return { ok: false, status: 0, error: 'Cancelled' }
    return { ok: false, status: 0, error: 'You seem to be offline. Try again.' }
  }
}

/** Only same-site paths ("/x"), never "//host" or schemes. */
export function safeInternalPath(p: string | null | undefined): string | null {
  return typeof p === 'string' && /^\/(?![/\\])[^\s\\]*$/.test(p) ? p : null
}

/** Digits for tel:/sms:/wa.me links. Keeps a leading + for tel/sms. */
export function telHref(phone: string | null | undefined): string | null {
  const d = (phone ?? '').replace(/[^\d+]/g, '')
  return d.replace(/\D/g, '').length >= 3 ? `tel:${d}` : null
}

export function waDigits(phone: string | null | undefined): string | null {
  const d = (phone ?? '').replace(/\D/g, '')
  if (!d) return null
  return d.length === 10 ? `91${d}` : d
}
