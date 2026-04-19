export const revalidate = 300 // 5 minutes

import { createClient } from '@/lib/supabase/server'
import type { Package, ServiceListing, ServiceListingType } from '@/types'
import { packageDurationShortLabel, tripDepartureDateKey } from '@/lib/package-trip-calendar'
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
    query = query.gte('price_paise', parseInt(searchParams.minBudget) * 100)
  }
  if (searchParams.maxBudget) {
    query = query.lte('price_paise', parseInt(searchParams.maxBudget) * 100)
  }
  if (searchParams.maxDays) {
    query = query.lte('duration_days', parseInt(searchParams.maxDays))
  }
  if (searchParams.minDays) {
    query = query.gte('duration_days', parseInt(searchParams.minDays))
  }

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

  // Text search
  if (searchParams.q) {
    const q = searchParams.q.toLowerCase()
    packages = packages.filter(pkg => {
      const dest = pkg.destination as { name?: string; state?: string } | null
      return (
        pkg.title.toLowerCase().includes(q) ||
        (pkg.short_description || '').toLowerCase().includes(q) ||
        (dest?.name || '').toLowerCase().includes(q) ||
        (dest?.state || '').toLowerCase().includes(q)
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

async function getServiceListings(searchParams: Record<string, string>) {
  // Map tab to service listing type
  const tabToType: Record<string, ServiceListingType> = {
    stays: 'stays',
    activities: 'activities',
    rentals: 'rentals',
    getting_around: 'getting_around',
  }

  const type = tabToType[searchParams.tab] || 'stays'
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

  if (searchParams.difficulty && type === 'activities') {
    filters.difficulty = searchParams.difficulty
  }

  try {
    const result = await getServiceListingsByType(type, filters as any, 1, 12)
    return result.listings
  } catch (error) {
    console.error('Error fetching service listings:', error)
    return []
  }
}

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const params = await searchParams
  const activeTab = (params.tab || 'trips') as 'trips' | 'stays' | 'activities' | 'rentals' | 'getting_around'

  let packages: Package[] = []
  let serviceListings: ServiceListing[] = []
  let resultCount = 0
  let interestedPackageIds: string[] = []

  if (activeTab === 'trips') {
    packages = await getPackages(params)
    resultCount = packages.length

    // Fetch user's interested packages
    const supabase = await createClient()
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
    />
  )
}
