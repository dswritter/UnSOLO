import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ client: vi.fn(), service: vi.fn(), getClaims: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.client, createServiceRoleClient: mocks.service }))
vi.mock('@/lib/auth/admin-permissions', () => ({
  STAFF_ROLES: ['admin', 'social_media_manager', 'field_person', 'chat_responder', 'host_onboarding_staff', 'custom'],
}))
import { searchHostListingContacts } from './host-listing-search'

type Row = Record<string, unknown>
type Result = { data: Row[] | Row | null; error: { message: string } | null }
type Call = { table: string; privileged: boolean; steps: { method: string; args: unknown[] }[] }
let calls: Call[]
let profile: Row | null
let membership: Row | null
let fail: string | null

function builder(table: string, privileged: boolean) {
  const call: Call = { table, privileged, steps: [] }
  calls.push(call)
  const query: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'not', 'in', 'or', 'order', 'limit']) {
    query[method] = (...args: unknown[]) => {
      call.steps.push({ method, args })
      return query
    }
  }
  const resolve = (): Result => {
    return {
      data: table === 'profiles' ? profile : membership,
      error: fail === table ? { message: 'private database error' } : null,
    }
  }
  query.maybeSingle = async () => resolve()
  query.then = (onFulfilled: (result: Result) => unknown, onRejected?: (error: unknown) => unknown) =>
    Promise.resolve(resolve()).then(onFulfilled, onRejected)
  return query
}

const assignment = (id = 'old-1', overrides: Row = {}): Row => ({
  id: `previous-listing:${id}`, label: 'Mountain Stay', email: 'private@example.com', phone: '+9779812345678',
  source: 'previous-listing', verified: false, subtitle: 'stay: Mountain Stay', ...overrides,
})

describe('staff host contact search', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    calls = []
    profile = { role: 'admin' }
    membership = null
    fail = null
    mocks.client.mockResolvedValue({ auth: { getClaims: mocks.getClaims }, from: (table: string) => builder(table, false) })
    mocks.service.mockImplementation(() => {
      expect(calls.map(call => call.table)).toContain('profiles')
      expect(calls.map(call => call.table)).toContain('team_members')
      return { rpc: mocks.rpc }
    })
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: 'staff-1' } }, error: null })
    mocks.rpc.mockResolvedValue({ data: [], error: null })
  })

  it('rejects unauthenticated requests before permissions or private database access', async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: null })
    await expect(searchHostListingContacts('service', '')).rejects.toThrow('Not authenticated')
    expect(calls).toEqual([])
    expect(mocks.service).not.toHaveBeenCalled()
  })
  it('fails closed when JWT verification returns an error, even with claims', async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: 'staff-1' } }, error: { message: 'expired' } })
    await expect(searchHostListingContacts('trip', '')).rejects.toThrow('Not authenticated')
    expect(mocks.service).not.toHaveBeenCalled()
  })
  it.each(['user', 'social_media_manager', 'field_person', 'chat_responder'])('denies %s before creating a service client', async role => {
    profile = { role }
    await expect(searchHostListingContacts('service', '')).rejects.toThrow('Unauthorized')
    expect(mocks.service).not.toHaveBeenCalled()
    expect(calls.every(call => !call.privileged)).toBe(true)
  })
  it.each(['admin', 'host_onboarding_staff'])('allows the effective profile role %s for both kinds', async role => {
    profile = { role }
    await expect(searchHostListingContacts('service', '')).resolves.toEqual([])
    await expect(searchHostListingContacts('trip', '')).resolves.toEqual([])
    expect(mocks.getClaims).toHaveBeenCalledTimes(2)
    expect(mocks.service).toHaveBeenCalledTimes(2)
  })
  it('uses active staff membership when the profile role has not synced', async () => {
    profile = { role: 'user' }
    membership = { role: 'host_onboarding_staff', is_active: true }
    await searchHostListingContacts('service', '')
    expect(mocks.service).toHaveBeenCalledOnce()
    expect(calls.find(call => call.table === 'team_members')?.steps).toContainEqual({ method: 'eq', args: ['user_id', 'staff-1'] })
  })
  it('rejects inactive membership and inactive custom permissions', async () => {
    profile = { role: 'user' }
    membership = { role: 'host_onboarding_staff', is_active: false }
    await expect(searchHostListingContacts('service', '')).rejects.toThrow('Unauthorized')
    profile = { role: 'custom' }
    membership = { role: 'custom', is_active: false, custom_permissions: ['service_listings'] }
    await expect(searchHostListingContacts('service', '')).rejects.toThrow('Unauthorized')
    expect(mocks.service).not.toHaveBeenCalled()
  })
  it.each([
    ['service', 'service_listings', 'trip'], ['trip', 'community_trips', 'service'],
  ] as const)('restricts custom %s access to %s', async (kind, permission, other) => {
    profile = { role: 'custom' }
    membership = { role: 'custom', is_active: true, custom_permissions: [permission] }
    await searchHostListingContacts(kind, '')
    await expect(searchHostListingContacts(other, '')).rejects.toThrow('Unauthorized')
    expect(mocks.service).toHaveBeenCalledOnce()
  })
  it('fails closed on permission database errors', async () => {
    fail = 'team_members'
    await expect(searchHostListingContacts('service', '')).rejects.toThrow('authorize')
    expect(mocks.service).not.toHaveBeenCalled()
  })
  it('validates runtime inputs before database access', async () => {
    await expect(searchHostListingContacts('wrong' as 'trip', '')).rejects.toThrow('kind')
    await expect(searchHostListingContacts('trip', 'x'.repeat(101))).rejects.toThrow('100')
    await expect(searchHostListingContacts('trip', 'bad\nquery')).rejects.toThrow('Invalid')
    expect(mocks.client).not.toHaveBeenCalled()
    expect(mocks.service).not.toHaveBeenCalled()
  })

  it.each(['service', 'trip'] as const)('searches a global directory from %s without sending kind', async kind => {
    mocks.rpc.mockResolvedValue({ data: [assignment()], error: null })
    expect(await searchHostListingContacts(kind, ' old@example.com ')).toEqual([assignment()])
    expect(mocks.rpc).toHaveBeenCalledWith('search_staff_host_contacts', { p_query: 'old@example.com', p_limit: 20 })
    expect(calls.map(call => call.table)).toEqual(['profiles', 'team_members'])
  })
  it('passes punctuation and wildcards as literal RPC parameters', async () => {
    const term = 'x),role.eq.admin,"%_*\\'
    await searchHostListingContacts('service', term)
    expect(mocks.rpc).toHaveBeenCalledWith('search_staff_host_contacts', { p_query: term, p_limit: 20 })
  })
  it('deduplicates verified pairs without merging differing contact pairs', async () => {
    const registered = assignment('host', { id: 'registered:host', source: 'registered', verified: true, phone: null })
    mocks.rpc.mockResolvedValue({ data: [assignment('subset', { phone: null }), assignment('different-pair'), registered], error: null })
    expect((await searchHostListingContacts('trip', '')).map(row => row.id)).toEqual(['registered:host', 'previous-listing:different-pair'])
  })
  it('normalizes usable contacts and drops malformed contact values', async () => {
    mocks.rpc.mockResolvedValue({ data: [assignment('bad', { email: 'bad', phone: '123' }), assignment('phone', { email: null })], error: null })
    expect(await searchHostListingContacts('service', '')).toEqual([assignment('phone', { email: null })])
  })
  it('caps combined output at twenty', async () => {
    mocks.rpc.mockResolvedValue({ data: Array.from({ length: 40 }, (_, i) => assignment(String(i), { email: `host${i}@example.com`, phone: null })), error: null })
    expect(await searchHostListingContacts('trip', '')).toHaveLength(20)
  })
  it('surfaces a redacted database error', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'private contact' } })
    await expect(searchHostListingContacts('service', '')).rejects.toThrow('Unable to search host contacts')
  })
  it.each([null, {}, [{ id: 'bad' }], [assignment('wrong', { verified: 'true' })]])('fails closed on unknown RPC shape %j', async data => {
    mocks.rpc.mockResolvedValue({ data, error: null })
    await expect(searchHostListingContacts('service', '')).rejects.toThrow('Unable to search host contacts')
  })
})