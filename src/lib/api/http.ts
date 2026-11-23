import { NextResponse } from 'next/server'
import { z } from 'zod'

/**
 * Shared /api/v1 response helpers. Contract: docs/revamp/api-v1.md (Conventions).
 */
export type ApiErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'phone_required'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'upgrade_required'
  | 'server_error'
  | 'unavailable'

const STATUS: Record<ApiErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  phone_required: 403,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  upgrade_required: 426,
  server_error: 500,
  unavailable: 503,
}

export class ApiError extends Error {
  constructor(
    public code: ApiErrorCode,
    message?: string,
    public extra: { field?: string; retryAfter?: number } = {},
  ) {
    super(message ?? code)
  }
}

export function fail(code: ApiErrorCode, message?: string, extra: ApiError['extra'] = {}) {
  const headers: Record<string, string> = { 'Cache-Control': 'private, no-store' }
  if (extra.retryAfter) headers['Retry-After'] = String(extra.retryAfter)
  return NextResponse.json(
    { error: { code, message: message ?? code, ...(extra.field ? { field: extra.field } : {}) } },
    { status: STATUS[code], headers },
  )
}

type CacheMode = 'private' | 'public' | 'none'

export function ok<T>(data: T, init: { status?: number; cache?: CacheMode; req?: Request } = {}) {
  const body = JSON.stringify(data)
  const headers: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8' }
  if (init.cache === 'public') {
    headers['Cache-Control'] = 'public, s-maxage=60, stale-while-revalidate=300'
    const etag = weakEtag(body)
    headers['ETag'] = etag
    if (init.req?.headers.get('if-none-match') === etag) {
      return new NextResponse(null, { status: 304, headers })
    }
  } else {
    headers['Cache-Control'] = 'private, no-store'
  }
  return new NextResponse(body, { status: init.status ?? 200, headers })
}

export function noContent() {
  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'private, no-store' } })
}

/** FNV-1a 32-bit — cheap, stable ETag (not a security primitive). */
function weakEtag(s: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `W/"${(h >>> 0).toString(36)}-${s.length.toString(36)}"`
}

export async function parseJson<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    throw new ApiError('bad_request', 'Body must be JSON')
  }
  return parseWith(schema, raw)
}

export function parseQuery<S extends z.ZodType>(req: Request, schema: S): z.infer<S> {
  const url = new URL(req.url)
  return parseWith(schema, Object.fromEntries(url.searchParams.entries()))
}

export function parseWith<S extends z.ZodType>(schema: S, raw: unknown): z.infer<S> {
  const r = schema.safeParse(raw)
  if (!r.success) {
    const issue = r.error.issues[0]
    throw new ApiError('bad_request', issue?.message ?? 'Invalid request', {
      field: issue?.path?.join('.') || undefined,
    })
  }
  return r.data
}

/** Wrap a route handler: maps ApiError → JSON error, logs unexpected errors without leaking them. */
export function route<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args)
    } catch (e) {
      if (e instanceof ApiError) return fail(e.code, e.message, e.extra)
      const pg = e as { code?: string; message?: string }
      // Map common Postgres / PostgREST errors raised by RLS and guard triggers.
      if (pg?.code === '42501') return fail('forbidden', 'Not allowed')
      if (pg?.code === '23505') return fail('conflict', 'Already exists')
      if (pg?.code === 'P0001' && pg.message) return fail('conflict', pg.message)
      console.error('[api/v1]', e)
      return fail('server_error', 'Something went wrong')
    }
  }
}

export const uuid = z.string().uuid()
