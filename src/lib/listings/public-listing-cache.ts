import { unstable_cache } from 'next/cache'
import {
  getServiceListingDetail,
  getRelatedListings,
} from '@/actions/service-listing-discovery'
import { getPublicServiceListingItems } from '@/actions/host-service-listing-items'
import { SERVICE_LISTINGS_TAG } from '@/lib/cache-tags'
import type { ServiceListingType } from '@/types'

/**
 * Cached public service-listing detail reads. The underlying queries are
 * cookieless (public content), so they are safe to memoize. All share the
 * `SERVICE_LISTINGS_TAG` tag, busted on-demand when a listing or its items are
 * edited/approved, with a 300s time-based safety net (matches the page's
 * previously-declared `revalidate = 300`).
 */
export const getCachedServiceListingDetail = unstable_cache(
  (slug: string) => getServiceListingDetail(slug),
  ['public-service-listing-detail'],
  { tags: [SERVICE_LISTINGS_TAG], revalidate: 300 },
)

export const getCachedPublicServiceListingItems = unstable_cache(
  (listingId: string) => getPublicServiceListingItems(listingId),
  ['public-service-listing-items'],
  { tags: [SERVICE_LISTINGS_TAG], revalidate: 300 },
)

export const getCachedRelatedListings = unstable_cache(
  (
    currentListingId: string,
    currentListing: { type: ServiceListingType; destination_ids?: string[] | null; tags?: string[] | null },
    limit?: number,
  ) => getRelatedListings(currentListingId, currentListing, limit),
  ['public-related-listings'],
  { tags: [SERVICE_LISTINGS_TAG], revalidate: 300 },
)
