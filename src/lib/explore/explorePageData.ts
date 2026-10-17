import { getRequestAuth } from '@/lib/auth/request-session'
import type { Package, ServiceListing, ServiceListingType } from '@/types'
import { getServiceListingsByType, type ServiceListingSearchFilters } from '@/actions/service-listing-discovery'
import { getCachedExploreMaxPackagePrice, getCachedExplorePackagePage, getCachedPackageInterestCounts, getInterestedExplorePackagePage, type PublicPackageFilters } from '@/lib/explore/cachedPublicPackageData'
import { getCachedPublicServiceItems } from '@/lib/explore/cachedPublicServiceData'

export const EXPLORE_TRIP_PAGE_SIZE = 20
export const EXPLORE_SERVICE_PAGE_SIZE = 20

export type ServiceListingWithItems = ServiceListing & {
  items: Array<{
    id: string
    name: string
    price_paise: number
    images: string[]
    unit: string | null
  }>
}

function buildPackageFilters(searchParams: Record<string, string>): PublicPackageFilters {
  return {
    search: searchParams.q?.slice(0, 160),
    tripSource: searchParams.tripSource,
    difficulty: searchParams.difficulty,
    minBudget: searchParams.minBudget,
    maxBudget: searchParams.maxBudget,
    maxDays: searchParams.maxDays,
    minDays: searchParams.minDays,
    month: searchParams.month,
  }
}

async function attachItemsToServiceListings(
  listings: ServiceListing[],
): Promise<ServiceListingWithItems[]> {
  if (listings.length === 0) return []
  const ids = listings.map(l => l.id)
  const itemRows = await getCachedPublicServiceItems(ids)

  const itemsByListing = new Map<string, Array<{ id: string; name: string; price_paise: number; images: string[]; unit: string | null; is_out_of_stock: boolean }>>()
  for (const row of itemRows) {
    const lid = row.service_listing_id
    if (!itemsByListing.has(lid)) itemsByListing.set(lid, [])
    itemsByListing.get(lid)!.push(row)
  }

  return listings.map(l => ({
    ...l,
    items: itemsByListing.get(l.id) || [],
  }))
}

function buildServiceListingFilters(
  searchParams: Record<string, string>,
  includeTextSearch: boolean,
): ServiceListingSearchFilters {
  const filters: ServiceListingSearchFilters = {}
  if (includeTextSearch && searchParams.q) {
    filters.search = searchParams.q.slice(0, 160)
  }
  if (searchParams.minPrice) {
    filters.min_price = parseInt(searchParams.minPrice, 10)
  }
  if (searchParams.maxPrice) {
    filters.max_price = parseInt(searchParams.maxPrice, 10)
  }
  if (searchParams.amenities) {
    filters.amenities = Array.isArray(searchParams.amenities)
      ? searchParams.amenities
      : [searchParams.amenities]
  }
  if (searchParams.difficulty) {
    filters.difficulty = searchParams.difficulty
  }
  return filters
}

export async function getServiceListings(
  searchParams: Record<string, string>,
  page = 1,
): Promise<{ listings: ServiceListingWithItems[]; searchFallback: boolean; totalCount: number }> {
  const tabToType: Record<string, ServiceListingType> = {
    stays: 'stays',
    activities: 'activities',
    rentals: 'rentals',
    getting_around: 'getting_around',
  }

  const type = tabToType[searchParams.tab || 'stays'] || 'stays'
  const hasSearch = !!searchParams.q

  const runForType = async (includeTextSearch: boolean, currentPage: number) => {
    const typeFilters = buildServiceListingFilters(searchParams, includeTextSearch)
    if (type !== 'activities' && typeFilters.difficulty) {
      delete typeFilters.difficulty
    }
    return getServiceListingsByType(type, typeFilters, currentPage, EXPLORE_SERVICE_PAGE_SIZE)
  }

  let listings: ServiceListing[] = []
  let totalCount = 0
  let searchFallback = false

  try {
    if (hasSearch) {
      const strict = await runForType(true, page)
      listings = strict.listings
      totalCount = strict.total
      if (strict.total === 0) {
        const broad = await runForType(false, page)
        if (broad.total > 0) {
          listings = broad.listings
          totalCount = broad.total
          searchFallback = true
        }
      }
    } else {
      const result = await runForType(true, page)
      listings = result.listings
      totalCount = result.total
    }
  } catch (error) {
    console.error('Error fetching service listings:', error)
    return { listings: [], searchFallback: false, totalCount: 0 }
  }

  if (listings.length === 0) return { listings: [], searchFallback, totalCount }
  return { listings: await attachItemsToServiceListings(listings), searchFallback, totalCount }
}

export type ExploreListPayload = {
  packages: Package[]
  serviceListings: ServiceListingWithItems[]
  resultCount: number
  page: number
  pageSize: number
  hasMore: boolean
  /** True when we showed listings without the location/text match because the strict search returned nothing */
  searchFallback: boolean
  interestedPackageIds: string[]
  maxPackagePrice: number
  spotsBooked: Record<string, number>
  interestCounts: Record<string, number>
  activeTab: 'trips' | 'stays' | 'activities' | 'rentals' | 'getting_around'
}

export async function loadExploreListData(params: Record<string, string>): Promise<ExploreListPayload> {
  const activeTab = (params.tab || 'trips') as
    | 'trips'
    | 'stays'
    | 'activities'
    | 'rentals'
    | 'getting_around'
  const requestedPage = Math.max(1, Math.min(1000, Math.floor(Number.parseInt(params.page || '1', 10) || 1)))
  const pageSize = activeTab === 'trips' ? EXPLORE_TRIP_PAGE_SIZE : EXPLORE_SERVICE_PAGE_SIZE
  let packages: Package[] = []
  let serviceListings: ServiceListingWithItems[] = []
  let resultCount = 0
  let searchFallback = false
  let interestedPackageIds: string[] = []
  let maxPackagePrice = 2000000
  const spotsBooked: Record<string, number> = {}
  const interestCounts: Record<string, number> = {}

  if (activeTab === 'trips') {
    // Shared public listings/aggregates are cached. Per-user interests remain
    // request-scoped and are never put in the public cache.
    const [auth, maxPrice] = await Promise.all([
      getRequestAuth(),
      getCachedExploreMaxPackagePrice(),
    ])
    maxPackagePrice = maxPrice

    const packageFilters = buildPackageFilters(params)
    let packagePage = params.interested && auth.user
      ? await getInterestedExplorePackagePage(auth.supabase, packageFilters, requestedPage, pageSize)
      : await getCachedExplorePackagePage(packageFilters, requestedPage, pageSize)

    if (params.q && packagePage.totalCount === 0) {
      packagePage = params.interested && auth.user
        ? await getInterestedExplorePackagePage(auth.supabase, { ...packageFilters, search: undefined }, requestedPage, pageSize)
        : await getCachedExplorePackagePage({ ...packageFilters, search: undefined }, requestedPage, pageSize)
      if (packagePage.totalCount > 0) searchFallback = true
    }
    packages = packagePage.packages
    resultCount = packagePage.totalCount

    // Aggregate card badges only for the page being rendered.
    const ids = packages.map(p => p.id)
    const [interestCountRows, bookingRows, userInterests] = await Promise.all([
      ids.length > 0
        ? getCachedPackageInterestCounts(ids)
        : Promise.resolve([] as [string, number][]),
      auth.user && ids.length > 0
        ? auth.supabase.from('bookings').select('package_id, guests').in('package_id', ids).in('status', ['confirmed', 'completed'])
        : Promise.resolve({ data: [] as Array<{ package_id: string; guests: number | null }> | null }),
      auth.user && ids.length > 0
        ? auth.supabase.from('package_interests').select('package_id').eq('user_id', auth.user.id).in('package_id', ids)
        : Promise.resolve({ data: [] as Array<{ package_id: string }> | null }),
    ])
    interestedPackageIds = (userInterests.data || []).map(row => row.package_id)
    const interestCount = new Map(interestCountRows)
    const bookedGuests = new Map<string, number>()
    for (const booking of bookingRows.data || []) {
      const id = booking.package_id
      const guests = typeof booking.guests === 'number' && booking.guests > 0 ? booking.guests : 1
      bookedGuests.set(id, (bookedGuests.get(id) || 0) + guests)
    }
    for (const [id, count] of bookedGuests) spotsBooked[id] = count
    for (const [id, count] of interestCount) interestCounts[id] = count
  } else {
    const svc = await getServiceListings(params, requestedPage)
    serviceListings = svc.listings
    searchFallback = svc.searchFallback
    resultCount = svc.totalCount
  }

  return {
    packages,
    serviceListings,
    resultCount,
    searchFallback,
    interestedPackageIds,
    maxPackagePrice,
    spotsBooked,
    interestCounts,
    activeTab,
    page: requestedPage,
    pageSize,
    hasMore: requestedPage * pageSize < resultCount,
  }
}
