import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { contactEmail, isPhonePlaceholderEmail, startPhoneLogin, verifyPhoneLogin, type PhoneLoginDeps } from './phone-login'

type Opts = { owner?: { id: string; email: string | null } | null; limiterDown?: boolean; existingPlaceholder?: boolean }

function makeDeps(opts: Opts = {}) {
  const counts = new Map<string, number>()
  const sms: { phone: string; otp: string }[] = []
  const profileUpdates: { id: string; row: Record<string, unknown> }[] = []
  const created: Record<string, unknown>[] = []
  const links: string[] = []
  let otpSeq = 0
  const svc = {
    rpc: vi.fn(async (_fn: string, a: { p_key: string; p_max: number }) => {
      if (opts.limiterDown) return { data: null, error: { message: 'relation "rate_limits" does not exist' } }
      const n = (counts.get(a.p_key) ?? 0) + 1
      counts.set(a.p_key, n)
      return { data: n <= a.p_max, error: null }
    }),
    from: vi.fn(() => {
      const q = {
        select: () => q, eq: () => q, order: () => q, limit: () => q,
        maybeSingle: async () => ({ data: opts.owner ? { id: opts.owner.id } : null, error: null }),
        update: (row: Record<string, unknown>) => ({ eq: async (_c: string, id: string) => { profileUpdates.push({ id, row }); return { error: null } } }),
      }
      return q
    }),
    auth: {
      admin: {
        getUserById: vi.fn(async (id: string) => ({ data: { user: { id, email: opts.owner?.email ?? null } }, error: null })),
        updateUserById: vi.fn(async () => ({ data: {}, error: null })),
        createUser: vi.fn(async (attrs: Record<string, unknown>) => {
          created.push(attrs)
          if (opts.existingPlaceholder) return { data: { user: null }, error: { message: 'A user with this email address has already been registered' } }
          return { data: { user: { id: 'new-user' } }, error: null }
        }),
        generateLink: vi.fn(async ({ email }: { email: string }) => {
          links.push(email)
          return { data: { properties: { hashed_token: `hash-${email}` }, user: { id: opts.owner?.id ?? (opts.existingPlaceholder ? 'old-placeholder' : 'new-user') } }, error: null }
        }),
      },
    },
  }
  const anon = {
    auth: {
      verifyOtp: vi.fn(async ({ token_hash }: { token_hash: string }) => ({
        data: { session: { access_token: `at-${token_hash}`, refresh_token: 'rt', expires_in: 3600, token_type: 'bearer', user: {} } }, error: null,
      })),
    },
  }
  let now = 1_800_000_000_000
  const deps: PhoneLoginDeps = {
    svc: svc as unknown as SupabaseClient,
    anon: anon as unknown as SupabaseClient,
    sendSMS: vi.fn(async (phone: string, otp: string) => { sms.push({ phone, otp }); return { success: true } }),
    generateOTP: () => String(1234 + otpSeq++),
    secret: 'test-secret',
    now: () => now,
    production: true,
  }
  return { deps, svc, anon, sms, profileUpdates, created, links, advance: (ms: number) => { now += ms } }
}

const IP = '203.0.113.7'

describe('phone sign-in: start', () => {
  it('rejects numbers that are not Indian mobiles, without sending', async () => {
    const t = makeDeps()
    const r = await startPhoneLogin(t.deps, '12345', IP)
    expect(r).toMatchObject({ ok: false, code: 'bad_request' })
    expect(t.sms).toHaveLength(0)
  })

  it('texts a code through our gateway and returns a challenge that does not contain it', async () => {
    const t = makeDeps()
    const r = await startPhoneLogin(t.deps, '+91 98765 43210', IP)
    expect(r.ok).toBe(true)
    expect(t.sms).toEqual([{ phone: '9876543210', otp: '1234' }])
    if (r.ok) {
      expect(r.challenge).not.toContain('1234')
      expect(Buffer.from(r.challenge.split('.')[0], 'base64url').toString()).not.toContain('1234')
      expect(r.devCode).toBeUndefined()
    }
  })

  it('makes you wait before a resend, and caps codes per number', async () => {
    const t = makeDeps()
    expect((await startPhoneLogin(t.deps, '9876543210', IP)).ok).toBe(true)
    expect(await startPhoneLogin(t.deps, '9876543210', IP)).toMatchObject({ ok: false, code: 'rate_limited' })
    expect(t.sms).toHaveLength(1)
  })

  it('fails closed when the limiter is down (no SMS is spent)', async () => {
    const t = makeDeps({ limiterDown: true })
    expect(await startPhoneLogin(t.deps, '9876543210', IP)).toMatchObject({ ok: false, code: 'server_error' })
    expect(t.sms).toHaveLength(0)
  })
})

async function challengeFor(t: ReturnType<typeof makeDeps>, phone = '9876543210') {
  const r = await startPhoneLogin(t.deps, phone, IP)
  if (!r.ok) throw new Error(r.error)
  return { challenge: r.challenge, code: t.sms.at(-1)!.otp }
}

describe('phone sign-in: verify', () => {
  it('signs into the account that already owns the verified number', async () => {
    const t = makeDeps({ owner: { id: 'u1', email: 'asha@example.com' } })
    const { challenge, code } = await challengeFor(t)
    const r = await verifyPhoneLogin(t.deps, challenge, code, IP)
    expect(r).toMatchObject({ ok: true, isNew: false })
    expect(t.links).toEqual(['asha@example.com'])
    expect(t.created).toHaveLength(0)
    if (r.ok) expect(r.session.access_token).toBe('at-hash-asha@example.com')
  })

  it('creates a phone-only account with a placeholder email and records the verified number', async () => {
    const t = makeDeps({ owner: null })
    const { challenge, code } = await challengeFor(t)
    const r = await verifyPhoneLogin(t.deps, challenge, code, IP)
    expect(r).toMatchObject({ ok: true, isNew: true })
    expect(t.created[0]).toMatchObject({ email: '9876543210@phone.unsolo.in', email_confirm: true })
    expect(t.profileUpdates).toEqual([{ id: 'new-user', row: expect.objectContaining({ phone_number: '9876543210', is_phone_verified: true }) }])
  })

  it('reuses an earlier placeholder account for the same number', async () => {
    const t = makeDeps({ owner: null, existingPlaceholder: true })
    const { challenge, code } = await challengeFor(t)
    const r = await verifyPhoneLogin(t.deps, challenge, code, IP)
    expect(r).toMatchObject({ ok: true, isNew: false })
    expect(t.profileUpdates[0].id).toBe('old-placeholder')
  })

  it('rejects a wrong code, and a challenge edited to another number', async () => {
    const t = makeDeps({ owner: null })
    const { challenge, code } = await challengeFor(t)
    expect(await verifyPhoneLogin(t.deps, challenge, '0000', IP)).toMatchObject({ ok: false, code: 'unauthorized' })
    const [p, sig] = challenge.split('.')
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString())
    const forged = `${Buffer.from(JSON.stringify({ ...payload, p: '9123456789' })).toString('base64url')}.${sig}`
    expect(await verifyPhoneLogin(t.deps, forged, code, IP)).toMatchObject({ ok: false, code: 'unauthorized' })
    expect(t.links).toHaveLength(0)
  })

  it('locks a challenge after 5 attempts, even with the right code', async () => {
    const t = makeDeps({ owner: null })
    const { challenge, code } = await challengeFor(t)
    for (let i = 0; i < 5; i++) await verifyPhoneLogin(t.deps, challenge, '0000', IP)
    expect(await verifyPhoneLogin(t.deps, challenge, code, IP)).toMatchObject({ ok: false, code: 'rate_limited' })
  })

  it('expires codes after 5 minutes', async () => {
    const t = makeDeps({ owner: null })
    const { challenge, code } = await challengeFor(t)
    t.advance(6 * 60_000)
    expect(await verifyPhoneLogin(t.deps, challenge, code, IP)).toMatchObject({ ok: false, code: 'unauthorized' })
  })

  it('accepts each code once', async () => {
    const t = makeDeps({ owner: { id: 'u1', email: 'asha@example.com' } })
    const { challenge, code } = await challengeFor(t)
    expect((await verifyPhoneLogin(t.deps, challenge, code, IP)).ok).toBe(true)
    expect(await verifyPhoneLogin(t.deps, challenge, code, IP)).toMatchObject({ ok: false, code: 'unauthorized' })
  })
})

describe('placeholder emails', () => {
  it('are recognised and never used as a contact email', () => {
    expect(isPhonePlaceholderEmail('9876543210@phone.unsolo.in')).toBe(true)
    expect(isPhonePlaceholderEmail('asha@example.com')).toBe(false)
    expect(contactEmail('9876543210@phone.unsolo.in')).toBe('')
    expect(contactEmail('asha@example.com')).toBe('asha@example.com')
    expect(contactEmail(undefined)).toBe('')
  })
})

describe('SMS code format', () => {
  it('generates 4-digit codes (the approved SMS template has a 4-character slot)', async () => {
    const { generateOTP } = await import('@/lib/sms/client')
    for (let i = 0; i < 200; i++) expect(generateOTP()).toMatch(/^[1-9]\d{3}$/)
  })
  it('rejects codes that are not 4 digits before touching limits', async () => {
    const t = makeDeps({ owner: null })
    const { challenge } = await challengeFor(t)
    expect(await verifyPhoneLogin(t.deps, challenge, '123456', IP)).toMatchObject({ ok: false, code: 'bad_request' })
  })
})
