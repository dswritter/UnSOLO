import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Package } from '@/types'

const { getRequestAuth, getCachedExplorePackagePage, getInterestedExplorePackagePage, getCachedExploreMaxPackagePrice, getCachedPackageInterestCounts, getCachedPublicServiceItems, getServiceListingsByType } = vi.hoisted(() => ({
  getRequestAuth: vi.fn(),
  getCachedExplorePackagePage: vi.fn(),
  getInterestedExplorePackagePage: vi.fn(),
  getCachedExploreMaxPackagePrice: vi.fn(),
  getCachedPackageInterestCounts: vi.fn(),
  getCachedPublicServiceItems: vi.fn(),
  getServiceListingsByType: vi.fn(),
}))

vi.mock('@/lib/auth/request-session', () => ({ getRequestAuth }))
vi.mock('@/lib/explore/cachedPublicPackageData', () => ({
  getCachedExplorePackagePage, getInterestedExplorePackagePage, getCachedExploreMaxPackagePrice, getCachedPackageInterestCounts,
}))
vi.mock('@/lib/explore/cachedPublicServiceData', () => ({ getCachedPublicServiceItems }))
vi.mock('@/actions/service-listing-discovery', () => ({ getServiceListingsByType }))
import { loadExploreListData } from './explorePageData'

function pkg(id: string, slug: string): Package {
  return {
    id, slug, title: `Trip ${slug}`, description: '', short_description: '',
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    is_featured: false, destination: null,
  } as Package
}

function makeSupabase({ interests = [] as string[], bookings = [] as Array<{ package_id: string; guests: number }> } = {}) {
  const from = vi.fn((table: string) => {
    const query: Record<string, (...args: unknown[]) => unknown> = {}
    query.select = () => query
    query.eq = () => query
    query.in = (column: unknown) => table === 'package_interests'
      ? Promise.resolve({ data: interests.map(package_id => ({ package_id })) })
      : column === 'package_id'
        ? query
        : Promise.resolve({ data: table === 'bookings' ? bookings : [] })
    return query
  })
  return { from }
}

describe('Explore trip loading stages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCachedExplorePackagePage.mockImplementation(async (filters: { search?: string }, page: number, pageSize: number) => ({
      packages: filters.search ? [] : page === 1 ? [pkg('p-1', 'Alpha'), pkg('p-2', 'Beta')] : [pkg('p-3', 'Gamma')],
      totalCount: filters.search ? 0 : 3, page, pageSize,
    }))
    getInterestedExplorePackagePage.mockResolvedValue({ packages: [pkg('p-2', 'Beta')], totalCount: 1, page: 1, pageSize: 20 })
    getCachedExploreMaxPackagePrice.mockResolvedValue(900000)
    getCachedPackageInterestCounts.mockResolvedValue([['p-1', 1], ['p-2', 8]])
    getCachedPublicServiceItems.mockResolvedValue([])
    getRequestAuth.mockResolvedValue({ user: null, supabase: makeSupabase() })
  })

  it('fetches page popularity once after a full-text miss falls back to the broad first page', async () => {
    const result = await loadExploreListData({ tab: 'trips', q: 'zzzzzzzz-not-a-match' })
    expect(result.searchFallback).toBe(true)
    expect(result.resultCount).toBe(3)
    expect(result.packages.map(row => row.id)).toEqual(['p-1', 'p-2'])
    expect(result.interestCounts).toEqual({ 'p-1': 1, 'p-2': 8 })
    expect(getCachedPackageInterestCounts).toHaveBeenCalledTimes(1)
    expect(getCachedPackageInterestCounts).toHaveBeenCalledWith(['p-1', 'p-2'])
    expect(getCachedExplorePackagePage).toHaveBeenCalledTimes(2)
    expect(getCachedExploreMaxPackagePrice).toHaveBeenCalledTimes(1)
  })

  it('keeps personal interest filters and booking visibility request-scoped', async () => {
    const supabase = makeSupabase({ interests: ['p-2'], bookings: [{ package_id: 'p-2', guests: 3 }] })
    getRequestAuth.mockResolvedValue({ user: { id: 'user-1' }, supabase })
    const result = await loadExploreListData({ tab: 'trips', interested: '1' })
    expect(result.packages.map(row => row.id)).toEqual(['p-2'])
    expect(result.interestedPackageIds).toEqual(['p-2'])
    expect(result.spotsBooked).toEqual({ 'p-2': 3 })
    expect(getCachedPackageInterestCounts).toHaveBeenCalledTimes(1)
    expect(getCachedPackageInterestCounts).toHaveBeenCalledWith(['p-2'])
    expect(getInterestedExplorePackagePage).toHaveBeenCalledWith(supabase, expect.objectContaining({}), 1, 20)
    expect(supabase.from).toHaveBeenCalledWith('bookings')
    expect(supabase.from).toHaveBeenCalledWith('package_interests')
  })

  it('loads only the requested trip page and reports exact totals/hasMore', async () => {
    const result = await loadExploreListData({ tab: 'trips', page: '2' })
    expect(result.packages.map(row => row.id)).toEqual(['p-3'])
    expect(result.page).toBe(2)
    expect(result.pageSize).toBe(20)
    expect(result.resultCount).toBe(3)
    expect(result.hasMore).toBe(false)
    expect(getCachedExplorePackagePage).toHaveBeenCalledWith(expect.objectContaining({}), 2, 20)
  })

  it('propagates service pages and exact count through item enrichment', async () => {
    const listing = { id: 'service-2', title: 'Rental 2', type: 'rentals', images: [] } as unknown as import('@/types').ServiceListing
    getServiceListingsByType.mockResolvedValue({ listings: [listing], total: 45, page: 2, limit: 20, totalPages: 3 })
    getCachedPublicServiceItems.mockResolvedValue([])
    const result = await loadExploreListData({ tab: 'rentals', page: '2' })
    expect(result.serviceListings.map(row => row.id)).toEqual(['service-2'])
    expect(result.resultCount).toBe(45)
    expect(result.pageSize).toBe(20)
    expect(result.hasMore).toBe(true)
    expect(getServiceListingsByType).toHaveBeenCalledWith('rentals', expect.any(Object), 2, 20)
  })
})