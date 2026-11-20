import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ApiError, ok, parseWith, route } from './http'
import { parseClientHeader } from './context'
import { decodeCursor, encodeCursor } from '@/lib/tribe/cursor'

describe('api/v1 http helpers', () => {
  it('maps ApiError, RLS and guard-trigger errors to contract codes without leaking internals', async () => {
    const r1 = await route(async () => { throw new ApiError('phone_required', 'Verify your phone') })()
    expect(r1.status).toBe(403)
    expect(await r1.json()).toEqual({ error: { code: 'phone_required', message: 'Verify your phone' } })
    const r2 = await route(async () => { throw { code: '42501', message: 'new row violates row-level security policy' } })()
    expect((await r2.json()).error.code).toBe('forbidden')
    const r3 = await route(async () => { throw { code: 'P0001', message: 'plan is full' } })()
    expect(await r3.json()).toEqual({ error: { code: 'conflict', message: 'plan is full' } })
    const r4 = await route(async () => { throw new Error('connection string postgres://secret') })()
    expect(r4.status).toBe(500)
    expect(JSON.stringify(await r4.json())).not.toContain('secret')
  })

  it('serves public GETs with an ETag and answers 304 when unchanged', async () => {
    const first = ok({ a: 1 }, { cache: 'public', req: new Request('http://x/') })
    const etag = first.headers.get('etag')!
    expect(first.headers.get('cache-control')).toContain('s-maxage')
    const again = ok({ a: 1 }, { cache: 'public', req: new Request('http://x/', { headers: { 'if-none-match': etag } }) })
    expect(again.status).toBe(304)
    expect(ok({ a: 1 }).headers.get('cache-control')).toBe('private, no-store')
  })

  it('reports the first invalid field', () => {
    expect(() => parseWith(z.object({ intro: z.string().min(10) }), { intro: 'hi' })).toThrow(ApiError)
    try { parseWith(z.object({ intro: z.string().min(10) }), { intro: 'hi' }) } catch (e) { expect((e as ApiError).extra.field).toBe('intro') }
  })

  it('parses the client header', () => {
    expect(parseClientHeader('android/1.2.0 (12)')).toEqual({ platform: 'android', version: '1.2.0', build: 12 })
    expect(parseClientHeader('ios/1.0 (3)')).toEqual({ platform: 'ios', version: '1.0', build: 3 })
    expect(parseClientHeader(null).platform).toBe('web')
    expect(parseClientHeader('<script>').platform).toBe('web')
  })

  it('round-trips cursors and rejects tampered ones', () => {
    const c = encodeCursor({ score: 4.2, id: '00000000-0000-4000-8000-000000000001' })
    expect(decodeCursor(c)).toEqual({ score: 4.2, id: '00000000-0000-4000-8000-000000000001' })
    expect(decodeCursor(Buffer.from(JSON.stringify({ id: "x'; drop table", offset: -5 })).toString('base64url'))).toEqual({})
    expect(decodeCursor('not base64 json')).toBeNull()
  })
})
