import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hostProfileHref, unlinkedHostProfileHref } from './host-profile'

const mocks = vi.hoisted(() => ({
  publicClient: vi.fn(), serviceClient: vi.fn(), unlinkedHost: vi.fn(),
}))
vi.mock('@/lib/supabase/public-client', () => ({ createPublicClient: mocks.publicClient }))
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: mocks.serviceClient }))
vi.mock('@/lib/listings/unlinked-host', () => ({ getUnlinkedHost: mocks.unlinkedHost }))

import { findPublicProfile, findUnlinkedHostProfileHref, loadPublicListingHost } from './public-host-profile'

type Result = { data: unknown; error: { message: string } | null }
const id = '12345678-1234-1234-1234-123456789abc'
const steps: Array<{ table: string; method: string; args: unknown[] }> = []
let results: Result[] = []
function from(table: string) {
  const query: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'neq', 'ilike', 'limit', 'or']) {
    query[method] = (...args: unknown[]) => {
      steps.push({ table, method, args })
      return query
    }
  }
  const resolve = () => {
    const result = results.shift()
    if (!result) throw new Error('Unexpected database query')
    return result
  }
  query.maybeSingle = async () => resolve()
  query.single = async () => resolve()
  query.then = (fulfilled: (value: Result) => unknown) => Promise.resolve(resolve()).then(fulfilled)
  return query
}
function respond(...data: unknown[]) {
  results = data.map(value => ({ data: value, error: null }))
}
const listing = { id, title: 'Mountain weekend', slug: 'mountain-weekend', host_id: null, created_on_behalf_by: 'staff' }

beforeEach(() => {
  vi.clearAllMocks()
  results = []
  steps.length = 0
  mocks.publicClient.mockReturnValue({ from })
  mocks.serviceClient.mockReturnValue({ from })
  mocks.unlinkedHost.mockResolvedValue({ full_name: 'Strangers Tribe' })
})

describe('host profile URLs', () => {
  it('encodes username path characters without changing identity', () => {
    expect(hostProfileHref({ username: 'strangers tribe' })).toBe('/profile/strangers%20tribe')
    expect(hostProfileHref({ username: 'name/#?%' })).toBe('/profile/name%2F%23%3F%25')
  })
  it('uses stable listing-scoped URLs only when there is no linked username', () => {
    const profileHref = unlinkedHostProfileHref('trip', id)
    expect(profileHref).toBe(`/hosts/trip/${id}`)
    expect(hostProfileHref({ username: '', profileHref })).toBe(profileHref)
    expect(hostProfileHref({ username: 'linked', profileHref })).toBe('/profile/linked')
    expect(hostProfileHref({ username: '' })).toBeNull()
  })
})

describe('registered profile lookup', () => {
  it('preserves exact usernames, including spaces', async () => {
    respond({ id, username: 'strangers tribe' })
    expect(await findPublicProfile('strangers tribe')).toMatchObject({ profile: { username: 'strangers tribe' }, ambiguous: false })
    expect(steps).toContainEqual({ table: 'profiles', method: 'eq', args: ['username', 'strangers tribe'] })
    expect(results).toHaveLength(0)
  })
  it('resolves a differently-cased username', async () => {
    respond(null, [{ id, username: 'Strangers Tribe' }])
    expect(await findPublicProfile('strangers tribe')).toMatchObject({ profile: { username: 'Strangers Tribe' }, ambiguous: false })
  })
  it('resolves a unique host display name to its actual username', async () => {
    respond(null, [], [{ id, username: 'strangers_tribe', full_name: 'Strangers Tribe' }])
    expect(await findPublicProfile('strangers tribe')).toMatchObject({ profile: { username: 'strangers_tribe' }, ambiguous: false })
    expect(steps).toContainEqual({ table: 'profiles', method: 'eq', args: ['is_host', true] })
  })
  it('never treats underscores or percent signs as wildcards', async () => {
    respond(null, [], [])
    expect(await findPublicProfile('host_100%')).toEqual({ profile: null, ambiguous: false })
    expect(steps.filter(step => step.method === 'ilike').map(step => step.args[1]))
      .toEqual(['host\\_100\\%', 'host\\_100\\%'])
  })
  it.each([
    [null, [{ username: 'HOST' }, { username: 'Host' }]],
    [null, [], [{ username: 'one' }, { username: 'two' }]],
  ])('does not choose an ambiguous identity', async (...data) => {
    respond(...data)
    expect(await findPublicProfile('host')).toEqual({ profile: null, ambiguous: true })
  })
  it('surfaces database failures instead of returning not found', async () => {
    results = [{ data: null, error: { message: 'database unavailable' } }]
    await expect(findPublicProfile('host')).rejects.toEqual({ message: 'database unavailable' })
  })
})

describe('listing-scoped host profiles', () => {
  it.each(['trip', 'service'] as const)('shows only the name and public %s listing', async kind => {
    respond(listing, ...(kind === 'service' ? [{ type: 'stays' }] : []))
    const host = await loadPublicListingHost(kind, id)
    expect(host).toEqual({
      linked: false,
      name: 'Strangers Tribe',
      listing: { title: listing.title, href: kind === 'trip' ? '/packages/mountain-weekend' : '/listings/stays/mountain-weekend' },
    })
    expect(steps).toContainEqual({
      table: kind === 'trip' ? 'packages' : 'service_listings', method: 'eq', args: ['is_active', true],
    })
    if (kind === 'service') {
      expect(steps).toContainEqual({
        table: 'service_listings', method: 'or',
        args: ['status.eq.approved,and(status.eq.pending,first_approved_at.not.is.null)'],
      })
    }
  })
  it('rejects invalid IDs before database access', async () => {
    expect(await loadPublicListingHost('trip', 'not-a-uuid')).toBeNull()
    expect(mocks.publicClient).not.toHaveBeenCalled()
  })
  it('does not read private assignments for unpublished listings', async () => {
    respond(null)
    expect(await loadPublicListingHost('trip', id)).toBeNull()
    expect(mocks.unlinkedHost).not.toHaveBeenCalled()
  })
  it('does not invent a host for a curated listing', async () => {
    respond({ ...listing, created_on_behalf_by: null })
    expect(await loadPublicListingHost('trip', id)).toBeNull()
    expect(mocks.unlinkedHost).not.toHaveBeenCalled()
  })
  it('resolves to the real account after ownership is linked', async () => {
    respond({ ...listing, host_id: 'account' }, { username: 'real_host' })
    expect(await loadPublicListingHost('trip', id)).toEqual({ linked: true, username: 'real_host' })
    expect(mocks.unlinkedHost).not.toHaveBeenCalled()
  })
})

describe('legacy unlinked host-name URLs', () => {
  it('resolves the reported spaced name to its public listing profile', async () => {
    respond([{ package_id: id, service_listing_id: null }], listing)
    expect(await findUnlinkedHostProfileHref('strangers tribe')).toBe(`/hosts/trip/${id}`)
    expect(steps).toContainEqual({
      table: 'host_listing_assignments', method: 'select', args: ['package_id, service_listing_id'],
    })
    expect(steps).toContainEqual({
      table: 'host_listing_assignments', method: 'ilike', args: ['host_name', 'strangers tribe'],
    })
  })
  it('does not expose a private assignment for an unpublished listing', async () => {
    respond([{ package_id: id }], null)
    expect(await findUnlinkedHostProfileHref('strangers tribe')).toBeNull()
    expect(mocks.unlinkedHost).not.toHaveBeenCalled()
  })
  it('does not merge different hosts with matching names', async () => {
    respond([{ package_id: id }, { service_listing_id: id }])
    expect(await findUnlinkedHostProfileHref('same name')).toBeNull()
    expect(mocks.publicClient).not.toHaveBeenCalled()
  })
})
