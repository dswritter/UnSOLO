import { getRequestAuth } from '@/lib/auth/request-session'
import type { Package, ServiceListing, ServiceListingType } from '@/types'
import { packageDurationShortLabel, tripDepartureDateKey } from '@/lib/package-trip-calendar'
import { fuzzyMatch, tokenizeLocationQuery } from '@/lib/utils'
import { sortExplorePackages } from '@/lib/explore-package-popularity'
import { getServiceListingsByType, type ServiceListingSearchFilters } from '@/actions/service-listing-discovery'
import { getCachedExploreMaxPackagePrice, getCachedExplorePackages, getCachedPackageInterestCounts } from '@/lib/explore/cachedPublicPackageData'
import { getCachedPublicServiceItems } from '@/lib/explore/cachedPublicServiceData'

export type ServiceListingWithItems = ServiceListing & {
  items: Array<{
    id: string
    name: string
    price_paise: number
    images: string[]
    unit: string | null
  }>
}

export async function getPackages(searchParams: Record<string, string>) {
  let packages = await getCachedExplorePackages({
    tripSource: searchParams.tripSource,
    difficulty: searchParams.difficulty,
    minBudget: searchParams.minBudget,
    maxBudget: searchParams.maxBudget,
    maxDays: searchParams.maxDays,
    minDays: searchParams.minDays,
  })

  // Keep packages whose next bookable departure is in the past so the grid can
  // show "Last departure …" (see packageNextDepartureLine) and link to reviews.

  if (searchParams.q) {
    const fullQ = searchParams.q.toLowerCase().trim()
    const tokens = tokenizeLocationQuery(searchParams.q)
    packages = packages.filter(pkg => {
      const dest = pkg.destination as { name?: string; state?: string } | null
      const title = pkg.title.toLowerCase()
      const desc = (pkg.short_description || '').toLowerCase()
      if (title.includes(fullQ) || desc.includes(fullQ)) return true
      const dName = dest?.name || ''
      const dState = dest?.state || ''
      for (const t of tokens) {
        if (t.length < 2) continue
        const tl = t.toLowerCase()
        if (title.includes(tl) || desc.includes(tl)) return true
        if (dName.toLowerCase().includes(tl) || dState.toLowerCase().includes(tl)) return true
        if (fuzzyMatch(dName, t) || fuzzyMatch(dState, t)) return true
      }
      return false
    })
  }

  if (searchParams.month) {
    const targetMonth = parseInt(searchParams.month)
    packages = packages.filter(pkg => {
      if (!pkg.departure_dates || pkg.departure_dates.length === 0) return false
      const closed = new Set((pkg.departure_dates_closed || []).map(tripDepartureDateKey))
      return pkg.departure_dates.some(d => {
        if (closed.has(tripDepartureDateKey(d))) return false
        return new Date(d).getMonth() === targetMonth
      })
    })
  }

  return packages
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
    filters.search = searchParams.q
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
): Promise<{ listings: ServiceListingWithItems[]; searchFallback: boolean }> {
  const tabToType: Record<string, ServiceListingType> = {
    stays: 'stays',
    activities: 'activities',
    rentals: 'rentals',
    getting_around: 'getting_around',
  }

  const type = tabToType[searchParams.tab || 'stays'] || 'stays'
  const hasSearch = !!searchParams.q

  const runForType = async (includeTextSearch: boolean, limit: number) => {
    const typeFilters = buildServiceListingFilters(searchParams, includeTextSearch)
    if (type !== 'activities' && typeFilters.difficulty) {
      delete typeFilters.difficulty
    }
    const result = await getServiceListingsByType(type, typeFilters, 1, limit)
    return result.listings
  }

  let listings: ServiceListing[] = []
  let searchFallback = false

  try {
    if (hasSearch) {
      listings = await runForType(true, 12)
      if (listings.length === 0) {
        const broad = await runForType(false, 24)
        if (broad.length > 0) {
          listings = broad
          searchFallback = true
        }
      }
    } else {
      listings = await runForType(true, 12)
    }
  } catch (error) {
    console.error('Error fetching service listings:', error)
    return { listings: [], searchFallback: false }
  }

  if (listings.length === 0) return { listings: [], searchFallback: false }
  return { listings: await attachItemsToServiceListings(listings), searchFallback }
}

export type ExploreListPayload = {
  packages: Package[]
  serviceListings: ServiceListingWithItems[]
  resultCount: number
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
    const [pkgList, maxPrice, auth] = await Promise.all([
      getPackages(params),
      getCachedExploreMaxPackagePrice(),
      getRequestAuth(),
    ])
    packages = pkgList
    maxPackagePrice = maxPrice

    const userInterests = auth.user
      ? await auth.supabase.from('package_interests').select('package_id').eq('user_id', auth.user.id)
      : { data: [] as Array<{ package_id: string }> | null }
    interestedPackageIds = (userInterests.data || []).map(row => row.package_id)
    const interestedSet = new Set(interestedPackageIds)
    if (params.interested && auth.user) packages = packages.filter(pkg => interestedSet.has(pkg.id))

    if (params.q && packages.length === 0) {
      const rest = { ...params }
      delete rest.q
      const broad = await getPackages(rest)
      if (broad.length > 0) {
        packages = params.interested && auth.user
          ? broad.filter(pkg => interestedSet.has(pkg.id))
          : broad
        searchFallback = true
      }
    }
    resultCount = packages.length

    // Choose strict/fallback results first, then fetch and sort their aggregate
    // popularity once. Previously getPackages fetched it for every candidate.
    const ids = packages.map(p => p.id)
    const [interestCountRows, bookingRows] = await Promise.all([
      ids.length > 0
        ? getCachedPackageInterestCounts(ids)
        : Promise.resolve([] as [string, number][]),
      auth.user && ids.length > 0
        ? auth.supabase.from('bookings').select('package_id, guests').in('package_id', ids).in('status', ['confirmed', 'completed'])
        : Promise.resolve({ data: [] as Array<{ package_id: string; guests: number | null }> | null }),
    ])
    const interestCount = new Map(interestCountRows)
    const bookedGuests = new Map<string, number>()
    for (const booking of bookingRows.data || []) {
      const id = booking.package_id
      const guests = typeof booking.guests === 'number' && booking.guests > 0 ? booking.guests : 1
      bookedGuests.set(id, (bookedGuests.get(id) || 0) + guests)
    }
    packages = sortExplorePackages(packages, bookedGuests, interestCount)
    for (const [id, count] of bookedGuests) spotsBooked[id] = count
    for (const [id, count] of interestCount) interestCounts[id] = count
  } else {
    const svc = await getServiceListings(params)
    serviceListings = svc.listings
    searchFallback = svc.searchFallback
    resultCount = serviceListings.length
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
  }
}
