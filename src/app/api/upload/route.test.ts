import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UPLOAD_MAX_IMAGE_BYTES, UPLOAD_IMAGE_TOO_LARGE_MESSAGE } from '@/lib/constants'

const mocks = vi.hoisted(() => ({
  client: vi.fn(), service: vi.fn(), getUser: vi.fn(), from: vi.fn(),
  sharp: vi.fn(), upload: vi.fn(), remove: vi.fn(), publicUrl: vi.fn(),
  storageFrom: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.client, createServiceClient: mocks.service,
}))
// Keep the real STAFF_ROLES and hasAdminPermission without invoking request-session auth.
vi.mock('@/lib/auth/request-session', () => ({ getRequestAuth: vi.fn() }))
vi.mock('sharp', () => ({ default: mocks.sharp }))

import { POST } from './route'

type Row = Record<string, unknown>
let profile: Row | null
let membership: Row | null
let failedTable: string | null
let thrownTable: string | null
let queries: { table: string; select: string; eq: unknown[] }[]

function request(purpose: string | null = 'service_listing', type = 'image/jpeg', size = 4) {
  const body = new FormData()
  body.set('file', new Blob([new Uint8Array(size)], { type }), 'photo.jpg')
  if (purpose !== null) body.set('purpose', purpose)
  return new NextRequest('http://localhost/api/upload', { method: 'POST', body })
}

function expectNoProcessing() {
  expect(mocks.sharp).not.toHaveBeenCalled()
  expect(mocks.service).not.toHaveBeenCalled()
  expect(mocks.storageFrom).not.toHaveBeenCalled()
  expect(mocks.upload).not.toHaveBeenCalled()
}

describe('image upload route', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    profile = { role: 'user', is_host: false }
    membership = null
    failedTable = null
    thrownTable = null
    queries = []
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    mocks.from.mockImplementation((table: string) => {
      const call = { table, select: '', eq: [] as unknown[] }
      queries.push(call)
      const resolve = async () => {
        if (thrownTable === table) throw new Error('Database unavailable')
        return {
          data: table === 'profiles' ? profile : membership,
          error: failedTable === table ? { message: 'Database unavailable' } : null,
        }
      }
      const query = {
        select: (columns: string) => { call.select = columns; return query },
        eq: (...args: unknown[]) => { call.eq = args; return query },
        single: resolve,
        maybeSingle: resolve,
      }
      return query
    })
    mocks.client.mockResolvedValue({ auth: { getUser: mocks.getUser }, from: mocks.from })
    mocks.sharp.mockImplementation(() => {
      const image = {
        rotate: vi.fn(() => image), clone: vi.fn(() => image),
        resize: vi.fn(() => image), webp: vi.fn(() => image),
        toBuffer: vi.fn(async () => Buffer.from('processed webp')),
      }
      return image
    })
    mocks.upload.mockResolvedValue({ error: null })
    mocks.publicUrl.mockImplementation((key: string) => ({
      data: { publicUrl: `https://storage.example/images/${key}` },
    }))
    mocks.storageFrom.mockReturnValue({
      upload: mocks.upload, remove: mocks.remove, getPublicUrl: mocks.publicUrl,
    })
    mocks.service.mockResolvedValue({ storage: { from: mocks.storageFrom } })
  })

  it('rejects unauthenticated uploads before any database or processing work', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    expect((await POST(request())).status).toBe(401)
    expect(mocks.from).not.toHaveBeenCalled()
    expectNoProcessing()
  })

  it('fails closed on an auth error even when a user is returned', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: { message: 'Expired' } })
    expect((await POST(request())).status).toBe(401)
    expectNoProcessing()
  })

  it.each(['admin', 'host_onboarding_staff'])('allows profile %s without a membership lookup', async role => {
    profile = { role, is_host: false }
    expect((await POST(request())).status).toBe(200)
    expect(queries).toEqual([{ table: 'profiles', select: 'role, is_host', eq: ['id', 'user-1'] }])
    expect(mocks.upload).toHaveBeenCalledTimes(2)
  })

  it('allows a verified host without a membership lookup', async () => {
    profile = { role: 'user', is_host: true }
    expect((await POST(request())).status).toBe(200)
    expect(mocks.from).toHaveBeenCalledTimes(1)
  })

  it.each(['admin', 'host_onboarding_staff', 'custom'])('allows active membership %s for an unsynced profile', async role => {
    membership = { role, is_active: true, custom_permissions: ['service_listings'] }
    expect((await POST(request())).status).toBe(200)
    expect(queries[1]).toEqual({
      table: 'team_members', select: 'role, is_active, custom_permissions', eq: ['user_id', 'user-1'],
    })
  })

  it('allows a custom profile only with active service listing permission', async () => {
    profile = { role: 'custom', is_host: false }
    membership = { role: 'custom', is_active: true, custom_permissions: ['service_listings'] }
    expect((await POST(request(' service_listing '))).status).toBe(200)
  })

  it.each(['user', 'social_media_manager', 'field_person', 'chat_responder'])('denies ordinary non-host or staff without service permission: %s', async role => {
    profile = { role, is_host: false }
    expect((await POST(request())).status).toBe(403)
    expectNoProcessing()
  })

  it('preserves effective profile role precedence over membership', async () => {
    profile = { role: 'field_person', is_host: false }
    membership = { role: 'admin', is_active: true }
    expect((await POST(request())).status).toBe(403)
    expect(mocks.from).toHaveBeenCalledTimes(1)
    expectNoProcessing()
  })

  it.each(['user', 'custom'])('denies inactive custom membership with profile %s', async role => {
    profile = { role, is_host: false }
    membership = { role: 'custom', is_active: false, custom_permissions: ['service_listings'] }
    expect((await POST(request())).status).toBe(403)
    expectNoProcessing()
  })

  it('denies inactive onboarding staff membership', async () => {
    membership = { role: 'host_onboarding_staff', is_active: false }
    expect((await POST(request())).status).toBe(403)
    expectNoProcessing()
  })

  it.each([
    { permissions: [] }, { permissions: ['community_trips'] },
    { permissions: null }, { permissions: 'service_listings' },
  ])('denies custom permission values without service access: %j', async ({ permissions }) => {
    profile = { role: 'custom', is_host: false }
    membership = { role: 'custom', is_active: true, custom_permissions: permissions }
    expect((await POST(request())).status).toBe(403)
    expectNoProcessing()
  })

  it.each(['profiles', 'team_members'])('fails closed on %s query errors even with granting data', async table => {
    profile = { role: 'custom', is_host: false }
    membership = { role: 'custom', is_active: true, custom_permissions: ['service_listings'] }
    failedTable = table
    expect((await POST(request())).status).toBe(403)
    expectNoProcessing()
  })

  it.each([
    { role: 'admin', is_host: false }, { role: 'user', is_host: true },
  ])('does not trust a granting profile accompanied by a query error: %j', async grantingProfile => {
    profile = grantingProfile
    failedTable = 'profiles'
    expect((await POST(request())).status).toBe(403)
    expectNoProcessing()
  })

  it('fails closed on a thrown membership query', async () => {
    thrownTable = 'team_members'
    expect((await POST(request())).status).toBe(403)
    expectNoProcessing()
  })

  it('rejects unsupported file types before processing or storage', async () => {
    profile = { role: 'admin' }
    const response = await POST(request('service_listing', 'image/gif'))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Only JPEG, PNG, WebP, AVIF images allowed' })
    expectNoProcessing()
  })

  it('rejects files over 5MB before processing or storage', async () => {
    profile = { role: 'admin' }
    const response = await POST(request('service_listing', 'image/jpeg', UPLOAD_MAX_IMAGE_BYTES + 1))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: UPLOAD_IMAGE_TOO_LARGE_MESSAGE })
    expectNoProcessing()
  })

  it('allows the existing 5MB boundary', async () => {
    profile = { role: 'admin' }
    expect((await POST(request('service_listing', 'image/jpeg', UPLOAD_MAX_IMAGE_BYTES))).status).toBe(200)
  })

  it.each(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])('returns full and thumbnail WebP URLs for %s', async type => {
    profile = { role: 'admin' }
    const response = await POST(request('service_listing', type))
    expect(response.status).toBe(200)
    const keys = mocks.upload.mock.calls.map(call => call[0] as string)
    expect(keys[0]).toMatch(/^service-listings\/user-1-[0-9a-f-]{36}\.webp$/)
    expect(keys[1]).toBe(keys[0].replace('.webp', '_thumb.webp'))
    expect(await response.json()).toEqual({
      url: `https://storage.example/images/${keys[0]}`,
      thumbUrl: `https://storage.example/images/${keys[1]}`,
    })
    for (const call of mocks.upload.mock.calls) {
      expect(call[2]).toEqual({ contentType: 'image/webp', upsert: true })
    }
    expect(mocks.storageFrom.mock.calls.every(call => call[0] === 'images')).toBe(true)
  })

  it('uses unique UUID keys for parallel uploads even at the same timestamp', async () => {
    profile = { role: 'admin' }
    const clock = vi.spyOn(Date, 'now').mockReturnValue(123)
    try {
      const responses = await Promise.all(Array.from({ length: 8 }, () => POST(request())))
      expect(responses.every(response => response.status === 200)).toBe(true)
      const keys = mocks.upload.mock.calls.map(call => call[0] as string)
      expect(keys).toHaveLength(16)
      expect(new Set(keys).size).toBe(16)
    } finally {
      clock.mockRestore()
    }
  })

  it.each([
    ['package', 'packages'], ['host_trip', 'host-trips'], ['avatar', 'avatars'],
    ['community_room', 'community-rooms'], ['status_story', 'status-stories'],
    ['wander_hero', 'wander-hero'], ['unknown', 'packages'], [null, 'packages'],
  ])('preserves the folder and adds UUID keys for existing purpose %s', async (purpose, folder) => {
    profile = { role: 'admin' }
    expect((await POST(request(purpose))).status).toBe(200)
    expect(mocks.upload.mock.calls[0][0]).toMatch(new RegExp(`^${folder}/user-1-[0-9a-f-]{36}\\.webp$`))
    expect(mocks.from).toHaveBeenCalledTimes(1)
  })

  it.each(['package', 'wander_hero', 'community_room', 'host_trip'])('keeps existing %s authorization restrictions', async purpose => {
    profile = { role: 'host_onboarding_staff', is_host: false }
    expect((await POST(request(purpose))).status).toBe(403)
    expectNoProcessing()
  })

  it('preserves the implicit host_trip default for hosts', async () => {
    profile = { role: 'user', is_host: true }
    expect((await POST(request(null))).status).toBe(200)
    expect(mocks.upload.mock.calls[0][0]).toMatch(/^host-trips\/user-1-/)
  })

  it('does not implicitly grant package uploads to onboarding staff', async () => {
    profile = { role: 'host_onboarding_staff', is_host: false }
    expect((await POST(request(null))).status).toBe(403)
    expectNoProcessing()
  })
})