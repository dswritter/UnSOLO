'use server'

import { createClient } from '@/lib/supabase/server'
import type { ServiceListing, ServiceListingType } from '@/types'

/**
 * Activities with an `event_schedule` are date-specific events. Once every
 * scheduled date is in the past, the listing is treated as expired and hidden
 * from public discovery until the host adds a new future date. Other
 * listings (or activities without a schedule) are always visible.
 */
function isListingVisibleToPublic(
  listing: Pick<ServiceListing, 'type' | 'event_schedule'>,
  todayIso: string,
): boolean {
  if (listing.type !== 'activities') return true
  const schedule = listing.event_schedule
  if (!schedule || schedule.length === 0) return true
  return schedule.some(entry => entry.date >= todayIso)
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function getServiceListingsByType(
  type: ServiceListingType,
  filters: {
    destination_id?: string
    min_price?: number
    max_price?: number
    amenities?: string[]
    tags?: string[]
    difficulty?: string
    search?: string
  } = {},
  page: number = 1,
  limit: number = 12
) {
  const supabase = await createClient()

  let query = supabase
    .from('service_listings')
    .select('*, destination:destinations(id, name, slug)', { count: 'exact' })
    .eq('type', type)
    .eq('is_active', true)
    .or('status.eq.approved,and(status.eq.pending,first_approved_at.not.is.null)')

  // Apply filters
  if (filters.destination_id) {
    query = query.contains('destination_ids', [filters.destination_id])
  }

  if (filters.min_price) {
    query = query.gte('price_paise', filters.min_price * 100)
  }

  if (filters.max_price) {
    query = query.lte('price_paise', filters.max_price * 100)
  }

  if (filters.search) {
    query = query.or(
      `title.ilike.%${filters.search}%,description.ilike.%${filters.search}%,location.ilike.%${filters.search}%`
    )
  }

  // Apply amenities filter (uses array contains)
  if (filters.amenities && filters.amenities.length > 0) {
    query = query.contains('amenities', filters.amenities)
  }

  // Apply tags filter
  if (filters.tags && filters.tags.length > 0) {
    query = query.contains('tags', filters.tags)
  }

  // Apply difficulty filter (type-specific, stored in metadata)
  if (filters.difficulty && type === 'activities') {
    // Filter by metadata.difficulty for activities
    // Note: This may require using @@ operator or filter in app
    // For now, we fetch and filter in-app
  }

  // Sort: Featured > Rating > Newest
  query = query
    .order('is_featured', { ascending: false })
    .order('average_rating', { ascending: false })
    .order('review_count', { ascending: false })
    .order('created_at', { ascending: false })

  // Paginate
  const offset = (page - 1) * limit
  query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query

  if (error) throw error

  const today = todayIso()
  const listings = ((data || []) as ServiceListing[])
    .filter(l => isListingVisibleToPublic(l, today))

  // `count` from the SQL query ignores the in-app event-dates filter. For
  // activities, adjust the total so pagination reflects what's actually visible.
  const adjustedTotal = type === 'activities'
    ? Math.max(0, (count || 0) - (((data || []).length) - listings.length))
    : (count || 0)

  return {
    listings,
    total: adjustedTotal,
    page,
    limit,
    totalPages: Math.ceil(adjustedTotal / limit),
  }
}

export async function getServiceListingDetail(slug: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('service_listings')
    .select(`
      *,
      destination:destinations(id, name, slug),
      host:profiles(id, username, full_name, avatar_url, host_rating, is_verified)
    `)
    .eq('slug', slug)
    .eq('is_active', true)
    .or('status.eq.approved,and(status.eq.pending,first_approved_at.not.is.null)')
    .single()

  if (error) throw error
  return data as ServiceListing & {
    destination?: { id: string; name: string; slug: string }
    host?: {
      id: string
      username: string
      full_name: string | null
      avatar_url: string | null
      host_rating: number | null
      is_verified: boolean
    }
  }
}

/** Public visibility check for a single fetched listing (use in detail pages). */
export async function isServiceListingVisibleToPublic(
  listing: Pick<ServiceListing, 'type' | 'event_schedule'>,
): Promise<boolean> {
  return isListingVisibleToPublic(listing, todayIso())
}

export async function searchServiceListings(
  query: string,
  type: ServiceListingType,
  limit: number = 10
) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('service_listings')
    .select('id, title, slug, location, images, price_paise, type, event_schedule')
    .eq('type', type)
    .eq('is_active', true)
    .or('status.eq.approved,and(status.eq.pending,first_approved_at.not.is.null)')
    .or(`title.ilike.%${query}%,location.ilike.%${query}%`)
    .limit(limit)

  if (error) throw error
  const today = todayIso()
  return ((data || []) as Array<Pick<ServiceListing, 'id' | 'title' | 'slug' | 'location' | 'images' | 'price_paise' | 'type' | 'event_schedule'>>)
    .filter(l => isListingVisibleToPublic({ type: l.type, event_schedule: l.event_schedule ?? null }, today))
}

// ── Related Services for Trip Details ──────────────────────────────────────

export async function getRelatedServicesForPackage(
  packageId: string,
  destinationId: string
) {
  const supabase = await createClient()

  // Get curated links for this package
  const { data: links } = await supabase
    .from('service_listing_package_links')
    .select('service_listing_id, link_type, position_order')
    .eq('package_id', packageId)
    .order('position_order', { ascending: true })

  const curatedLinks = links
    ?.filter((l) => l.link_type === 'curated')
    .map((l) => l.service_listing_id) || []

  // Fetch curated listings
  let curated: ServiceListing[] = []
  if (curatedLinks.length > 0) {
    const { data } = await supabase
      .from('service_listings')
      .select('*')
      .in('id', curatedLinks)
      .eq('is_active', true)
      .or('status.eq.approved,and(status.eq.pending,first_approved_at.not.is.null)')

    curated = (data || []) as ServiceListing[]
  }

  // Get nearby listings (auto-geo) by destination
  let nearbyQuery = supabase
    .from('service_listings')
    .select('*')
    .contains('destination_ids', [destinationId])
    .eq('is_active', true)
    .or('status.eq.approved,and(status.eq.pending,first_approved_at.not.is.null)')
    .order('is_featured', { ascending: false })
    .order('average_rating', { ascending: false })
    .limit(12)

  if (curatedLinks.length > 0) {
    nearbyQuery = nearbyQuery.not('id', 'in', `(${curatedLinks.join(',')})`)
  }

  const { data: nearby } = await nearbyQuery

  const today = todayIso()
  return {
    curated: (curated as ServiceListing[]).filter(l => isListingVisibleToPublic(l, today)),
    nearbyAuto: ((nearby || []) as ServiceListing[]).filter(l => isListingVisibleToPublic(l, today)),
    hasCuratedLinks: curatedLinks.length > 0,
  }
}

// ── Destination-based discovery ──────────────────────────────────────

export async function getServiceListingsByDestination(
  destinationId: string,
  type?: ServiceListingType
) {
  const supabase = await createClient()

  let query = supabase
    .from('service_listings')
    .select('*')
    .contains('destination_ids', [destinationId])
    .eq('is_active', true)
    .or('status.eq.approved,and(status.eq.pending,first_approved_at.not.is.null)')

  if (type) {
    query = query.eq('type', type)
  }

  query = query
    .order('is_featured', { ascending: false })
    .order('average_rating', { ascending: false })

  const { data, error } = await query

  if (error) throw error
  const today = todayIso()
  return ((data || []) as ServiceListing[]).filter(l => isListingVisibleToPublic(l, today))
}

/** Find related listings for a given listing (same type, location, or tags). Excludes the current listing. */
export async function getRelatedListings(
  currentListingId: string,
  currentListing: { type: ServiceListingType; destination_ids?: string[] | null; tags?: string[] | null },
  limit: number = 8
) {
  const supabase = await createClient()

  const destinationIds = currentListing.destination_ids?.filter(Boolean) || []

  let query = supabase
    .from('service_listings')
    .select('*')
    .eq('type', currentListing.type)
    .eq('is_active', true)
    .or('status.eq.approved,and(status.eq.pending,first_approved_at.not.is.null)')
    .neq('id', currentListingId)
    .limit(limit)

  // Prioritize by: same destination > same tags > same type
  let filterApplied = false

  if (destinationIds.length > 0) {
    // Get listings from same destination
    const { data: byDest } = await query
      .contains('destination_ids', destinationIds)
      .order('is_featured', { ascending: false })
      .order('average_rating', { ascending: false })

    if (byDest && byDest.length >= limit) {
      const today = todayIso()
      return (byDest as ServiceListing[]).filter(l => isListingVisibleToPublic(l, today)).slice(0, limit)
    }
    filterApplied = true
  }

  if (currentListing.tags && currentListing.tags.length > 0) {
    // Get listings with matching tags
    const { data: byTag } = await supabase
      .from('service_listings')
      .select('*')
      .eq('type', currentListing.type)
      .eq('is_active', true)
      .or('status.eq.approved,and(status.eq.pending,first_approved_at.not.is.null)')
      .neq('id', currentListingId)
      .contains('tags', currentListing.tags.filter(Boolean))
      .order('is_featured', { ascending: false })
      .order('average_rating', { ascending: false })
      .limit(limit)

    if (byTag && byTag.length >= limit / 2) {
      const today = todayIso()
      return (byTag as ServiceListing[]).filter(l => isListingVisibleToPublic(l, today)).slice(0, limit)
    }
  }

  // Fallback: same type, same destination or top-rated
  const { data } = await supabase
    .from('service_listings')
    .select('*')
    .eq('type', currentListing.type)
    .eq('is_active', true)
    .or('status.eq.approved,and(status.eq.pending,first_approved_at.not.is.null)')
    .neq('id', currentListingId)
    .order('is_featured', { ascending: false })
    .order('average_rating', { ascending: false })
    .limit(limit)

  const today = todayIso()
  return ((data || []) as ServiceListing[]).filter(l => isListingVisibleToPublic(l, today)).slice(0, limit)
}
