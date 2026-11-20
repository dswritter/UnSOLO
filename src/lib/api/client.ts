'use client'

/** Browser client for /api/v1 (cookie session). Errors carry the contract's code + field. */
export class ApiClientError extends Error {
  constructor(public code: string, message: string, public status: number, public field?: string) {
    super(message)
  }
}

export async function apiFetch<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
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
    throw new ApiClientError(e.code ?? 'server_error', e.message ?? 'Something went wrong', res.status, e.field)
  }
  return data as T
}

export function newClientId(): string {
  return crypto.randomUUID()
}
