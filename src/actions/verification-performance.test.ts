import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), service: vi.fn(), sms: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth/action-auth', () => ({ getActionAuth: mocks.auth }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createServiceRoleClient: mocks.service }))
vi.mock('@/lib/sms/client', () => ({ sendSMS: mocks.sms, generateOTP: vi.fn() }))
import { checkVerificationStatus } from './verification'
import { MAX_OTP_PER_HOUR, MIN_OTP_SEND_INTERVAL_SECONDS } from '@/lib/constants'

const now = Date.parse('2026-10-22T12:00:00Z')
type Query = { table: string; privileged: boolean; filters: Array<[string, unknown]>; update: boolean; hourly: boolean }
let started: Query[]
let fail: string | null
let release: () => void
let barrier: Promise<void>
let hourly: Array<{ created_at: string }>
let last: { created_at: string } | null
let emailSynced: boolean

function from(table: string, privileged = false) {
  const query: Query = { table, privileged, filters: [], update: false, hourly: false }
  const builder = {
    select: () => builder,
    update: () => { query.update = true; return builder },
    eq: (key: string, value: unknown) => { query.filters.push([key, value]); return builder },
    gte: () => { query.hourly = true; return builder },
    order: () => builder,
    limit: () => builder,
    single: () => execute(),
    maybeSingle: () => execute(),
    then: (fulfilled: (value: Awaited<ReturnType<typeof execute>>) => unknown) => execute().then(fulfilled),
  }
  async function execute() {
    started.push(query)
    await barrier
    return {
      data: query.update ? null : table === 'profiles' ? {
        is_phone_verified: false, is_email_verified: emailSynced, is_host: false,
        phone_number: '9876543210', phone_country_code: '+91', phone_verified_method: null,
      } : table === 'phone_change_requests' ? {
        id: 'change-1', new_phone: '1234567890', new_country_code: '+91', requested_at: new Date(now).toISOString(),
      } : query.hourly ? hourly : last,
      error: fail === table ? { message: 'database unavailable' } : null,
    }
  }
  return builder
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(Date, 'now').mockReturnValue(now)
  started = []
  fail = null
  hourly = []
  last = null
  emailSynced = true
  barrier = new Promise<void>(resolve => { release = resolve })
  mocks.auth.mockResolvedValue({
    user: { id: 'host-1', email_confirmed_at: '2026-10-01' },
    supabase: { from: (table: string) => from(table) },
  })
  mocks.service.mockReturnValue({ from: (table: string) => from(table, true) })
})
afterEach(() => vi.restoreAllMocks())

describe('verification initial data', () => {
  it('runs profile, pending changes, hourly OTP history and latest OTP in one query wave', async () => {
    const result = checkVerificationStatus()
    await vi.waitFor(() => expect(started).toHaveLength(4))
    expect(started.map(query => query.table).sort()).toEqual([
      'phone_change_requests', 'phone_otp_verifications', 'phone_otp_verifications', 'profiles',
    ])
    for (const query of started) {
      expect(query.filters).toContainEqual([query.table === 'profiles' ? 'id' : 'user_id', 'host-1'])
      expect(query.privileged).toBe(query.table === 'phone_otp_verifications')
    }
    release()
    expect(await result).toMatchObject({
      isEmailVerified: true, isPhoneVerified: false, isHost: false, phoneNumber: '9876543210',
      pendingChangeRequest: { id: 'change-1', newPhone: '1234567890' }, otpSendCooldownUntil: null,
    })
    expect(mocks.sms).not.toHaveBeenCalled()
  })
  it('preserves the minimum interval between OTP sends', async () => {
    last = { created_at: new Date(now - 1000).toISOString() }
    release()
    expect((await checkVerificationStatus())?.otpSendCooldownUntil)
      .toBe(new Date(now - 1000 + MIN_OTP_SEND_INTERVAL_SECONDS * 1000).toISOString())
  })
  it('preserves the hourly OTP cap', async () => {
    hourly = Array.from({ length: MAX_OTP_PER_HOUR }, () => ({ created_at: new Date(now - 60000).toISOString() }))
    release()
    expect((await checkVerificationStatus())?.otpSendCooldownUntil)
      .toBe(new Date(now - 60000 + 60 * 60 * 1000).toISOString())
  })
  it('still synchronizes newly verified email status', async () => {
    emailSynced = false
    release()
    await checkVerificationStatus()
    expect(started.filter(query => query.update)).toHaveLength(1)
  })
  it('returns null without accessing private data when signed out', async () => {
    mocks.auth.mockResolvedValue({ user: null })
    expect(await checkVerificationStatus()).toBeNull()
    expect(started).toHaveLength(0)
    expect(mocks.service).not.toHaveBeenCalled()
  })
  it('surfaces cooldown read failures instead of allowing another OTP silently', async () => {
    fail = 'phone_otp_verifications'
    release()
    await expect(checkVerificationStatus()).rejects.toEqual({ message: 'database unavailable' })
  })
})
