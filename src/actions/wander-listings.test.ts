import { beforeEach, describe, expect, it, vi } from 'vitest'

const { packages, services, items, metrics } = vi.hoisted(() => ({
  packages: vi.fn(), services: vi.fn(), items: vi.fn(), metrics: vi.fn(),
}))
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }))
vi.mock('@/lib/explore/cachedPublicPackageData', () => ({ getCachedExplorePackagePage: packages }))
vi.mock('@/lib/explore/cachedPublicServiceData', () => ({ getCachedPublicServiceListings: services }))
vi.mock('@/lib/wander/wanderQueries', () => ({ getWanderServiceItemsForListings: items }))
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({ rpc: metrics }) }))
import { loadMoreWanderListings } from './wander-listings'

beforeEach(() => {
  vi.clearAllMocks()
  packages.mockResolvedValue({ packages: [{ id: 'trip' }], totalCount: 17 })
  services.mockResolvedValue({ listings: [{ id: 'service' }], total: 9 })
  items.mockImplementation(async listings => listings.map((listing: { id: string }) => ({ ...listing, items: [] })))
  metrics.mockResolvedValue({
    data: [{ package_id: 'trip', booked_guests: '7', interest_count: '12' }], error: null,
  })
})

describe('public homepage row continuation', () => {
  it('loads eight public trips and global metrics without viewer auth', async () => {
    const result = await loadMoreWanderListings('trips', 1)
    expect(packages).toHaveBeenCalledWith({}, 1, 8)
    expect(metrics).toHaveBeenCalledWith('get_wander_trip_candidate_metrics', { p_package_ids: ['trip'] })
    expect(result).toMatchObject({ page: 1, hasMore: true, spotsBooked: { trip: 7 }, interestCounts: { trip: 12 } })
    expect(services).not.toHaveBeenCalled()
  })

  it.each(['stays', 'activities', 'rentals'] as const)('loads public %s with options and the correct end-of-list state', async kind => {
    const result = await loadMoreWanderListings(kind, 2)
    expect(services).toHaveBeenCalledWith(kind, {}, 2, 8)
    expect(items).toHaveBeenCalledWith([{ id: 'service' }])
    expect(result).toMatchObject({ page: 2, hasMore: false, serviceListings: [{ id: 'service', items: [] }] })
    expect(packages).not.toHaveBeenCalled()
  })

  it('does not query trip aggregates for an empty page', async () => {
    packages.mockResolvedValue({ packages: [], totalCount: 0 })
    expect(await loadMoreWanderListings('trips', 1)).toMatchObject({ packages: [], hasMore: false })
    expect(metrics).not.toHaveBeenCalled()
  })

  it('propagates service and aggregate failures so the row can offer a retry', async () => {
    services.mockRejectedValueOnce(new Error('service query failed'))
    await expect(loadMoreWanderListings('stays', 1)).rejects.toThrow('service query failed')
    metrics.mockResolvedValueOnce({ data: null, error: new Error('metrics unavailable') })
    await expect(loadMoreWanderListings('trips', 1)).rejects.toThrow('metrics unavailable')
  })

  it.each([0, -1, 1.5, 1001, NaN])('rejects invalid page %s before querying', async page => {
    await expect(loadMoreWanderListings('trips', page)).rejects.toThrow('Invalid listing page')
    expect(packages).not.toHaveBeenCalled()
  })

  it('rejects unknown categories before querying', async () => {
    await expect(Reflect.apply(loadMoreWanderListings, null, ['private', 1])).rejects.toThrow('Invalid listing category')
    expect(services).not.toHaveBeenCalled()
  })
})
