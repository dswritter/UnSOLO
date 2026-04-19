'use server'

import { createClient } from '@/lib/supabase/server'
import type { ServiceListing, ServiceListingType } from '@/types'

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
    .eq('status', 'approved')

  // Apply filters
  if (filters.destination_id) {
    query = query.eq('destination_id', filters.destination_id)
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

  return {
    listings: (data || []) as ServiceListing[],
    total: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
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
    .eq('status', 'approved')
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

export async function searchServiceListings(
  query: string,
  type: ServiceListingType,
  limit: number = 10
) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('service_listings')
    .select('id, title, slug, location, images, price_paise, type')
    .eq('type', type)
    .eq('is_active', true)
    .eq('status', 'approved')
    .or(`title.ilike.%${query}%,location.ilike.%${query}%`)
    .limit(limit)

  if (error) throw error
  return data || []
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
      .eq('status', 'approved')

    curated = (data || []) as ServiceListing[]
  }

  // Get nearby listings (auto-geo) by destination
  const { data: nearby } = await supabase
    .from('service_listings')
    .select('*')
    .eq('destination_id', destinationId)
    .eq('is_active', true)
    .eq('status', 'approved')
    .not('id', 'in', `(${curatedLinks.join(',')})`) // Exclude already-curated
    .order('is_featured', { ascending: false })
    .order('average_rating', { ascending: false })
    .limit(12)

  return {
    curated: curated as ServiceListing[],
    nearbyAuto: (nearby || []) as ServiceListing[],
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
    .eq('destination_id', destinationId)
    .eq('is_active', true)
    .eq('status', 'approved')

  if (type) {
    query = query.eq('type', type)
  }

  query = query
    .order('is_featured', { ascending: false })
    .order('average_rating', { ascending: false })

  const { data, error } = await query

  if (error) throw error
  return data || []
}
