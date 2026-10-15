import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Package } from '@/types'

const { getRequestAuth, getCachedExplorePackages, getCachedExploreMaxPackagePrice, getCachedPackageInterestCounts, getCachedPublicServiceItems, getServiceListingsByType } = vi.hoisted(() => ({
  getRequestAuth: vi.fn(),
  getCachedExplorePackages: vi.fn(),
  getCachedExploreMaxPackagePrice: vi.fn(),
  getCachedPackageInterestCounts: vi.fn(),
  getCachedPublicServiceItems: vi.fn(),
  getServiceListingsByType: vi.fn(),
}))

vi.mock('@/lib/auth/request-session', () => ({ getRequestAuth }))
vi.mock('@/lib/explore/cachedPublicPackageData', () => ({
  getCachedExplorePackages, getCachedExploreMaxPackagePrice, getCachedPackageInterestCounts,
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
    query.eq = () => Promise.resolve({ data: table === 'package_interests' ? interests.map(package_id => ({ package_id })) : [] })
    query.in = (column: unknown) => column === 'package_id'
      ? query
      : Promise.resolve({ data: table === 'bookings' ? bookings : [] })
    return query
  })
  return { from }
}

describe('Explore trip loading stages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCachedExplorePackages.mockResolvedValue([pkg('p-1', 'Alpha'), pkg('p-2', 'Beta')])
    getCachedExploreMaxPackagePrice.mockResolvedValue(900000)
    getCachedPackageInterestCounts.mockResolvedValue([['p-1', 1], ['p-2', 8]])
    getCachedPublicServiceItems.mockResolvedValue([])
    getRequestAuth.mockResolvedValue({ user: null, supabase: makeSupabase() })
  })

  it('fetches public popularity once after choosing strict or broad fallback results', async () => {
    const result = await loadExploreListData({ tab: 'trips', q: 'zzzzzzzz-not-a-match' })
    expect(result.searchFallback).toBe(true)
    expect(result.resultCount).toBe(2)
    expect(result.packages.map(row => row.id)).toEqual(['p-2', 'p-1'])
    expect(result.interestCounts).toEqual({ 'p-1': 1, 'p-2': 8 })
    expect(getCachedPackageInterestCounts).toHaveBeenCalledTimes(1)
    expect(getCachedPackageInterestCounts).toHaveBeenCalledWith(['p-1', 'p-2'])
    expect(getCachedExplorePackages).toHaveBeenCalledTimes(2)
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
    expect(supabase.from).toHaveBeenCalledWith('bookings')
    expect(supabase.from).toHaveBeenCalledWith('package_interests')
  })
})