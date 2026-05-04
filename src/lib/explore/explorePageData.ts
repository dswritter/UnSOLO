import { createClient } from '@/lib/supabase/server'
import { getRequestAuth } from '@/lib/auth/request-session'
import type { Package, ServiceListing, ServiceListingType } from '@/types'
import { packageDurationShortLabel, tripDepartureDateKey } from '@/lib/package-trip-calendar'
import { fuzzyMatch, tokenizeLocationQuery } from '@/lib/utils'
import { fetchPackagePopularityMaps, sortExplorePackages } from '@/lib/explore-package-popularity'
import { getServiceListingsByType } from '@/actions/service-listing-discovery'

export type ServiceListingWithItems = ServiceListing & {
  items: Array<{
    id: string
    name: string
    price_paise: number
    images: string[]
    unit: string | null
  }>
}

export async function getMaxPackagePrice(supabase: Awaited<ReturnType<typeof createClient>>): Promise<number> {
  const { data } = await supabase
    .from('packages')
    .select('price_paise')
    .eq('is_active', true)
    .order('price_paise', { ascending: false })
    .limit(1)
    .single()

  if (!data?.price_paise) return 2000000
  return data.price_paise
}

export async function getPackages(searchParams: Record<string, string>) {
  const supabase = await createClient()
  const tripSource = searchParams.tripSource

  let query = supabase
    .from('packages')
    .select(
      '*, destination:destinations(*), host:profiles!packages_host_id_fkey(id, username, full_name, avatar_url, bio, host_rating, is_verified, total_hosted_trips)',
    )
    .eq('is_active', true)

  if (tripSource === 'community') {
    query = query.not('host_id', 'is', null)
  } else if (tripSource === 'unsolo') {
    query = query.is('host_id', null)
  }

  if (searchParams.difficulty) {
    query = query.eq('difficulty', searchParams.difficulty)
  }
  if (searchParams.minBudget) {
    const minPaise = parseInt(searchParams.minBudget, 10) * 100
    if (!isNaN(minPaise)) {
      query = query.gte('price_paise', minPaise)
    }
  }
  if (searchParams.maxBudget) {
    const maxPaise = parseInt(searchParams.maxBudget, 10) * 100
    if (!isNaN(maxPaise)) {
      query = query.lte('price_paise', maxPaise)
    }
  }
  if (searchParams.maxDays) {
    query = query.lte('duration_days', parseInt(searchParams.maxDays))
  }
  if (searchParams.minDays) {
    query = query.gte('duration_days', parseInt(searchParams.minDays))
  }

  query = query
    .order('is_featured', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200)

  const { data } = await query
  let packages = (data || []) as unknown as Package[]

  const todayStr = new Date().toISOString().split('T')[0]
  packages = packages.filter(pkg => {
    if (!pkg.departure_dates || pkg.departure_dates.length === 0) return true
    const closed = new Set((pkg.departure_dates_closed || []).map(tripDepartureDateKey))
    return pkg.departure_dates.some(d => {
      const k = tripDepartureDateKey(d)
      return k >= todayStr && !closed.has(k)
    })
  })

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

  if (searchParams.interested) {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: interests } = await supabase
        .from('package_interests')
        .select('package_id')
        .eq('user_id', user.id)
      const interestedIds = new Set((interests || []).map(i => i.package_id))
      packages = packages.filter(pkg => interestedIds.has(pkg.id))
    }
  }

  const ids = packages.map(p => p.id)
  const { bookedGuests, interestCount } = await fetchPackagePopularityMaps(supabase, ids)
  packages = sortExplorePackages(packages, bookedGuests, interestCount)

  return packages
}

async function attachItemsToServiceListings(
  listings: ServiceListing[],
): Promise<ServiceListingWithItems[]> {
  if (listings.length === 0) return []
  const supabase = await createClient()
  const ids = listings.map(l => l.id)
  const { data: itemRows } = await supabase
    .from('service_listing_items')
    .select('id, name, price_paise, images, unit, is_out_of_stock, service_listing_id')
    .in('service_listing_id', ids)
    .eq('is_active', true)
    .order('position_order', { ascending: true })
    .order('created_at', { ascending: true })

  const itemsByListing = new Map<string, Array<{ id: string; name: string; price_paise: number; images: string[]; unit: string | null; is_out_of_stock: boolean }>>()
  for (const row of itemRows || []) {
    const lid = (row as { service_listing_id: string }).service_listing_id
    if (!itemsByListing.has(lid)) itemsByListing.set(lid, [])
    itemsByListing.get(lid)!.push({
      id: row.id,
      name: row.name,
      price_paise: row.price_paise,
      images: (row.images as string[]) || [],
      unit: row.unit as string | null,
      is_out_of_stock: Boolean((row as { is_out_of_stock?: boolean | null }).is_out_of_stock),
    })
  }

  return listings.map(l => ({
    ...l,
    items: itemsByListing.get(l.id) || [],
  }))
}

function buildServiceListingFilters(
  searchParams: Record<string, string>,
  includeTextSearch: boolean,
): Record<string, unknown> {
  const filters: Record<string, unknown> = {}
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
    const typeFilters = buildServiceListingFilters(searchParams, includeTextSearch) as Record<string, unknown>
    if (type !== 'activities' && typeFilters.difficulty) {
      delete typeFilters.difficulty
    }
    const result = await getServiceListingsByType(type, typeFilters as any, 1, limit)
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
  const supabase = await createClient()

  let packages: Package[] = []
  let serviceListings: ServiceListingWithItems[] = []
  let resultCount = 0
  let searchFallback = false
  let interestedPackageIds: string[] = []
  let maxPackagePrice = 2000000
  let spotsBooked: Record<string, number> = {}
  let interestCounts: Record<string, number> = {}

  if (activeTab === 'trips') {
    // Run packages + max-price + cached auth in parallel — they don't depend on each other.
    // (Previously these ran sequentially and getUser() always made a GoTrue round-trip,
    // which dominated mobile view-all latency.)
    const [pkgList, maxPrice, auth] = await Promise.all([
      getPackages(params),
      getMaxPackagePrice(supabase),
      getRequestAuth(),
    ])
    packages = pkgList
    maxPackagePrice = maxPrice

    if (params.q && packages.length === 0) {
      const rest = { ...params }
      delete rest.q
      const broad = await getPackages(rest)
      if (broad.length > 0) {
        packages = broad
        searchFallback = true
      }
    }
    resultCount = packages.length

    // Popularity + per-user interests can also be parallel.
    const ids = packages.map(p => p.id)
    const [popularity, userInterests] = await Promise.all([
      ids.length > 0
        ? fetchPackagePopularityMaps(supabase, ids)
        : Promise.resolve({ bookedGuests: new Map<string, number>(), interestCount: new Map<string, number>() }),
      auth.user
        ? supabase
            .from('package_interests')
            .select('package_id')
            .eq('user_id', auth.user.id)
        : Promise.resolve({ data: [] as Array<{ package_id: string }> | null }),
    ])
    for (const [id, count] of popularity.bookedGuests) spotsBooked[id] = count
    for (const [id, count] of popularity.interestCount) interestCounts[id] = count
    interestedPackageIds = (userInterests.data || []).map(i => i.package_id)
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
