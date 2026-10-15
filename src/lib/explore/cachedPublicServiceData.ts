import { unstable_cache } from 'next/cache'
import { createPublicClient } from '@/lib/supabase/public-client'
import { createServiceRoleClient } from '@/lib/supabase/server'
import type { ServiceListing, ServiceListingType } from '@/types'
import { escapeIlikePattern, tokenizeLocationQuery } from '@/lib/utils'

export type PublicServiceFilters = {
  destination_id?: string
  min_price?: number
  max_price?: number
  amenities?: string[]
  tags?: string[]
  difficulty?: string
  search?: string
}

export const getCachedPublicServiceListings = unstable_cache(async (
  type: ServiceListingType,
  filters: PublicServiceFilters,
  page: number,
  limit: number,
) => {
  const client = createPublicClient()
  let query = client.from('service_listings')
    .select('*, destination:destinations(id, name, slug)', { count: 'exact' })
    .eq('type', type).eq('is_active', true)
    .or('status.eq.approved,and(status.eq.pending,first_approved_at.not.is.null)')

  if (filters.destination_id) query = query.contains('destination_ids', [filters.destination_id])
  if (filters.min_price) query = query.gte('price_paise', filters.min_price * 100)
  if (filters.max_price) query = query.lte('price_paise', filters.max_price * 100)
  if (filters.search) {
    const orParts = tokenizeLocationQuery(filters.search).flatMap(term => {
      const escaped = escapeIlikePattern(term)
      return [`title.ilike.%${escaped}%`, `description.ilike.%${escaped}%`, `location.ilike.%${escaped}%`]
    })
    if (orParts.length) query = query.or(orParts.join(','))
  }
  if (filters.amenities?.length) query = query.contains('amenities', filters.amenities)
  if (filters.tags?.length) query = query.contains('tags', filters.tags)
  // difficulty is stored in metadata and has never been server-filtered here.
  // Retain it in the key so changing the current semantics cannot alias entries.
  const offset = (page - 1) * limit
  const { data, error, count } = await query
    .order('is_featured', { ascending: false })
    .order('average_rating', { ascending: false })
    .order('review_count', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw error
  return { listings: (data || []) as ServiceListing[], total: count || 0, page, limit }
}, ['explore-public-service-listings-v1'], { revalidate: 30, tags: ['explore-public-service-listings'] })

export type PublicServiceItem = {
  id: string
  name: string
  price_paise: number
  images: string[]
  unit: string | null
  is_out_of_stock: boolean
  service_listing_id: string
}

export const getCachedPublicServiceItems = unstable_cache(async (listingIds: string[]): Promise<PublicServiceItem[]> => {
  if (!listingIds.length) return []
  // Callers pass only IDs from the public active-listing queries above. The
  // service-role read preserves existing support for first-approved listings
  // whose status is temporarily pending (the legacy item RLS policy omits them).
  const { data, error } = await createServiceRoleClient().from('service_listing_items')
    .select('id, name, price_paise, images, unit, is_out_of_stock, service_listing_id')
    .in('service_listing_id', listingIds).eq('is_active', true)
    .order('position_order', { ascending: true }).order('created_at', { ascending: true })
  if (error) throw error
  return (data || []).map(row => ({
    id: row.id,
    name: row.name,
    price_paise: row.price_paise,
    images: row.images || [],
    unit: row.unit,
    is_out_of_stock: Boolean(row.is_out_of_stock),
    service_listing_id: row.service_listing_id,
  }))
}, ['explore-public-service-items-v1'], { revalidate: 30, tags: ['explore-public-service-items'] })