'use server'

import { createClient } from '@/lib/supabase/server'
import { createPublicClient } from '@/lib/supabase/public-client'
import type { ServiceListing, ServiceListingType } from '@/types'
import { escapeIlikePattern, tokenizeLocationQuery } from '@/lib/utils'

/** All approved service listings are eligible for explore (past activity dates included). */
export async function isServiceListingVisibleToPublic(
  _listing: Pick<ServiceListing, 'type' | 'event_schedule'>,
): Promise<boolean> {
  return true
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
    const terms = tokenizeLocationQuery(filters.search)
    const orParts: string[] = []
    for (const term of terms) {
      const e = escapeIlikePattern(term)
      orParts.push(
        `title.ilike.%${e}%,description.ilike.%${e}%,location.ilike.%${e}%`,
      )
    }
    if (orParts.length > 0) {
      query = query.or(orParts.join(','))
    }
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

  const listings = (data || []) as ServiceListing[]

  const adjustedTotal = count || 0

  return {
    listings,
    total: adjustedTotal,
    page,
    limit,
    totalPages: Math.ceil(adjustedTotal / limit),
  }
}

export async function getServiceListingDetail(slug: string) {
  // Cookieless: public content, cacheable via getCachedServiceListingDetail.
  const supabase = createPublicClient()

  const { data, error } = await supabase
    .from('service_listings')
    .select(`
      *,
      destination:destinations(id, name, slug),
      host:profiles(id, username, full_name, avatar_url, phone_number, phone_public, is_host, host_rating, is_verified)
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
      phone_number: string | null
      phone_public: boolean | null
      is_host: boolean | null
      host_rating: number | null
      is_verified: boolean
    }
  }
}

export async function searchServiceListings(
  query: string,
  type: ServiceListingType,
  limit: number = 10
) {
  const supabase = await createClient()

  const terms = tokenizeLocationQuery(query)
  const searchOr =
    terms.length > 0
      ? terms
          .map((term) => {
            const e = escapeIlikePattern(term)
            return `title.ilike.%${e}%,location.ilike.%${e}%`
          })
          .join(',')
      : ''

  let searchQuery = supabase
    .from('service_listings')
    .select('id, title, slug, location, images, price_paise, type, event_schedule')
    .eq('type', type)
    .eq('is_active', true)
    .or('status.eq.approved,and(status.eq.pending,first_approved_at.not.is.null)')

  if (searchOr) {
    searchQuery = searchQuery.or(searchOr)
  }

  const { data, error } = await searchQuery.limit(limit)

  if (error) throw error
  return (data || []) as Array<Pick<ServiceListing, 'id' | 'title' | 'slug' | 'location' | 'images' | 'price_paise' | 'type' | 'event_schedule'>>
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

  return {
    curated: (curated as ServiceListing[]),
    nearbyAuto: ((nearby || []) as ServiceListing[]),
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
  return ((data || []) as ServiceListing[])
}

/** Find related listings for a given listing (same type, location, or tags). Excludes the current listing. */
export async function getRelatedListings(
  currentListingId: string,
  currentListing: { type: ServiceListingType; destination_ids?: string[] | null; tags?: string[] | null },
  limit: number = 8
) {
  // Cookieless: public content, cacheable via getCachedRelatedListings.
  const supabase = createPublicClient()

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
      return (byDest as ServiceListing[]).slice(0, limit)
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
      return (byTag as ServiceListing[]).slice(0, limit)
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

  return ((data || []) as ServiceListing[]).slice(0, limit)
}
