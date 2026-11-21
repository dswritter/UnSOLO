'use client'

import { phoneGate, requestPhoneVerification } from '@/lib/phone-gate'

/** Browser client for /api/v1 (cookie session). Errors carry the contract's code + field. */
export class ApiClientError extends Error {
  constructor(public code: string, message: string, public status: number, public field?: string) {
    super(message)
  }
}

/**
 * `phone_required` doesn't surface as an error: the phone card opens in place, and once the number is
 * verified the same request is sent again. Pass `noPhoneGate` for the phone-verification calls themselves.
 */
export async function apiFetch<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal; noPhoneGate?: boolean } = {}): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
    headers: { 'x-unsolo-client': 'web', ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: 'same-origin',
    signal: init.signal,
  })
  if (res.status === 204 || res.status === 202) return undefined as T
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) {
    const e = data?.error ?? {}
    if (e.code === 'phone_required' && !init.noPhoneGate && phoneGate.hasHost()) {
      if (await requestPhoneVerification()) return apiFetch<T>(path, { ...init, noPhoneGate: true })
      throw new ApiClientError('phone_required', 'Verify your phone number to continue.', res.status)
    }
    throw new ApiClientError(e.code ?? 'server_error', e.message ?? 'Something went wrong', res.status, e.field)
  }
  return data as T
}

export function newClientId(): string {
  return crypto.randomUUID()
}
