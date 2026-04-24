export const revalidate = 300 // 5 minutes

import { createClient } from '@/lib/supabase/server'
import type { Package, ServiceListing, ServiceListingType } from '@/types'

export type ServiceListingWithItems = ServiceListing & {
  items: Array<{
    id: string
    name: string
    price_paise: number
    images: string[]
    unit: string | null
  }>
}
import { packageDurationShortLabel, tripDepartureDateKey } from '@/lib/package-trip-calendar'
import { fuzzyMatch } from '@/lib/utils'
import { getServiceListingsByType } from '@/actions/service-listing-discovery'
import { ExploreClient } from '@/components/explore/ExploreClient'

function packageRecencyMs(pkg: Package): number {
  const u = pkg.updated_at
  const t = u && u.length > 0 ? new Date(u).getTime() : new Date(pkg.created_at).getTime()
  return Number.isFinite(t) ? t : 0
}

function sortExplorePackages(
  packages: Package[],
  bookedGuests: Map<string, number>,
  interestCount: Map<string, number>,
): Package[] {
  return [...packages].sort((a, b) => {
    if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1
    const popA = (bookedGuests.get(a.id) || 0) + (interestCount.get(a.id) || 0)
    const popB = (bookedGuests.get(b.id) || 0) + (interestCount.get(b.id) || 0)
    if (popB !== popA) return popB - popA
    const rec = packageRecencyMs(b) - packageRecencyMs(a)
    if (rec !== 0) return rec
    return a.slug.localeCompare(b.slug)
  })
}

async function fetchPopularityMaps(
  supabase: Awaited<ReturnType<typeof createClient>>,
  packageIds: string[],
): Promise<{ bookedGuests: Map<string, number>; interestCount: Map<string, number> }> {
  const bookedGuests = new Map<string, number>()
  const interestCount = new Map<string, number>()
  if (packageIds.length === 0) return { bookedGuests, interestCount }

  const { data: bookings } = await supabase
    .from('bookings')
    .select('package_id, guests')
    .in('package_id', packageIds)
    .in('status', ['confirmed', 'completed'])

  for (const b of bookings || []) {
    const pid = b.package_id as string
    const g = typeof b.guests === 'number' && b.guests > 0 ? b.guests : 1
    bookedGuests.set(pid, (bookedGuests.get(pid) || 0) + g)
  }

  const { data: interests } = await supabase
    .from('package_interests')
    .select('package_id')
    .in('package_id', packageIds)

  for (const row of interests || []) {
    const pid = row.package_id as string
    interestCount.set(pid, (interestCount.get(pid) || 0) + 1)
  }

  return { bookedGuests, interestCount }
}

async function getMaxPackagePrice(supabase: Awaited<ReturnType<typeof createClient>>): Promise<number> {
  const { data } = await supabase
    .from('packages')
    .select('price_paise')
    .eq('is_active', true)
    .order('price_paise', { ascending: false })
    .limit(1)
    .single()

  if (!data?.price_paise) return 2000000 // fallback to 2 lakhs
  return data.price_paise
}

async function getPackages(searchParams: Record<string, string>) {
  const supabase = await createClient()
  const tripSource = searchParams.tripSource

  let query = supabase
    .from('packages')
    .select('*, destination:destinations(*), host:profiles!packages_host_id_fkey(id, username, full_name, avatar_url, bio, host_rating, is_verified, total_hosted_trips)')
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

  // Safety cap: never stream more than 200 rows to the server render.
  // Client-side filters (fuzzy search, month, departure-expiry) operate on
  // this pre-filtered set. 200 is generous enough for real-world catalog
  // sizes. If you ever exceed 200 active packages, move text-search and
  // month-filter to server-side SQL to restore accurate pagination.
  query = query
    .order('is_featured', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200)

  const { data } = await query
  let packages = (data || []) as unknown as Package[]

  // Hide trips where every departure is past or host-marked full
  const todayStr = new Date().toISOString().split('T')[0]
  packages = packages.filter(pkg => {
    if (!pkg.departure_dates || pkg.departure_dates.length === 0) return true
    const closed = new Set((pkg.departure_dates_closed || []).map(tripDepartureDateKey))
    return pkg.departure_dates.some(d => {
      const k = tripDepartureDateKey(d)
      return k >= todayStr && !closed.has(k)
    })
  })

  // Text search with fuzzy matching for locations and exact match for titles
  if (searchParams.q) {
    const q = searchParams.q.toLowerCase()
    packages = packages.filter(pkg => {
      const dest = pkg.destination as { name?: string; state?: string } | null
      return (
        pkg.title.toLowerCase().includes(q) ||
        (pkg.short_description || '').toLowerCase().includes(q) ||
        fuzzyMatch(dest?.name || '', searchParams.q) ||
        fuzzyMatch(dest?.state || '', searchParams.q)
      )
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

  // Filter by user's interested packages
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

  const ids = packages.map((p) => p.id)
  const { bookedGuests, interestCount } = await fetchPopularityMaps(supabase, ids)
  packages = sortExplorePackages(packages, bookedGuests, interestCount)

  return packages
}

async function getServiceListings(searchParams: Record<string, string>): Promise<ServiceListingWithItems[]> {
  // Map tab to service listing type
  const tabToType: Record<string, ServiceListingType> = {
    stays: 'stays',
    activities: 'activities',
    rentals: 'rentals',
    getting_around: 'getting_around',
  }

  // When searching, fetch from all types; otherwise, fetch only the active tab's type
  const hasSearch = !!searchParams.q
  const types: ServiceListingType[] = hasSearch
    ? ['stays', 'activities', 'rentals', 'getting_around']
    : [tabToType[searchParams.tab] || 'stays']

  const filters: Record<string, unknown> = {}

  // Apply filters based on type
  if (searchParams.q) {
    filters.search = searchParams.q
  }

  if (searchParams.minPrice) {
    filters.min_price = parseInt(searchParams.minPrice)
  }

  if (searchParams.maxPrice) {
    filters.max_price = parseInt(searchParams.maxPrice)
  }

  if (searchParams.amenities) {
    filters.amenities = Array.isArray(searchParams.amenities)
      ? searchParams.amenities
      : [searchParams.amenities]
  }

  if (searchParams.difficulty) {
    filters.difficulty = searchParams.difficulty
  }

  let listings: ServiceListing[] = []
  try {
    // Fetch from all relevant types
    const allListings: ServiceListing[] = []
    for (const type of types) {
      try {
        const typeFilters = { ...filters }
        // Only apply difficulty filter to activities
        if (type !== 'activities' && typeFilters.difficulty) {
          delete typeFilters.difficulty
        }
        const result = await getServiceListingsByType(type, typeFilters as any, 1, 12)
        allListings.push(...result.listings)
      } catch (error) {
        console.error(`Error fetching ${type} listings:`, error)
      }
    }
    listings = allListings
  } catch (error) {
    console.error('Error fetching service listings:', error)
    return []
  }

  if (listings.length === 0) return []

  // Batch-fetch items for all returned listings so cards can show a carousel
  // without extra round-trips. Fetch only the fields needed for the card.
  const supabase = await createClient()
  const ids = listings.map((l) => l.id)
  const { data: itemRows } = await supabase
    .from('service_listing_items')
    .select('id, name, price_paise, images, unit, service_listing_id')
    .in('service_listing_id', ids)
    .eq('is_active', true)
    .order('position_order', { ascending: true })
    .order('created_at', { ascending: true })

  // Group items by listing id
  const itemsByListing = new Map<string, Array<{ id: string; name: string; price_paise: number; images: string[]; unit: string | null }>>()
  for (const row of itemRows || []) {
    const lid = (row as { service_listing_id: string }).service_listing_id
    if (!itemsByListing.has(lid)) itemsByListing.set(lid, [])
    itemsByListing.get(lid)!.push({
      id: row.id,
      name: row.name,
      price_paise: row.price_paise,
      images: (row.images as string[]) || [],
      unit: row.unit as string | null,
    })
  }

  return listings.map((l) => ({
    ...l,
    items: itemsByListing.get(l.id) || [],
  }))
}

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const params = await searchParams
  const activeTab = (params.tab || 'trips') as 'trips' | 'stays' | 'activities' | 'rentals' | 'getting_around'
  const supabase = await createClient()

  let packages: Package[] = []
  let serviceListings: ServiceListingWithItems[] = []
  let resultCount = 0
  let interestedPackageIds: string[] = []
  let maxPackagePrice = 2000000
  let spotsBooked: Record<string, number> = {}
  let interestCounts: Record<string, number> = {}

  if (activeTab === 'trips') {
    packages = await getPackages(params)
    resultCount = packages.length
    maxPackagePrice = await getMaxPackagePrice(supabase)

    // Re-use the popularity data already fetched inside getPackages — but
    // getPackages doesn't expose it, so we do a lightweight second pass
    // using only confirmed/completed bookings (guest count = spots consumed).
    if (packages.length > 0) {
      const ids = packages.map(p => p.id)
      const { bookedGuests, interestCount } = await fetchPopularityMaps(supabase, ids)
      for (const [id, count] of bookedGuests) spotsBooked[id] = count
      for (const [id, count] of interestCount) interestCounts[id] = count
    }

    // Fetch user's interested packages
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: interests } = await supabase
        .from('package_interests')
        .select('package_id')
        .eq('user_id', user.id)
      interestedPackageIds = (interests || []).map(i => i.package_id)
    }
  } else {
    serviceListings = await getServiceListings(params)
    resultCount = serviceListings.length
  }

  return (
    <ExploreClient
      packages={packages}
      serviceListings={serviceListings}
      params={params}
      resultCount={resultCount}
      activeTab={activeTab}
      interestedPackageIds={interestedPackageIds}
      maxPackagePrice={maxPackagePrice}
      spotsBooked={spotsBooked}
      interestCounts={interestCounts}
    />
  )
}
