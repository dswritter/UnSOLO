export const revalidate = 300 // 5 minutes

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getServiceListingDetail, getRelatedListings } from '@/actions/service-listing-discovery'
import { getPublicServiceListingItems } from '@/actions/host-service-listing-items'
import { ListingDetailClient } from '@/components/listings/ListingDetailClient'
import type { ServiceListingType } from '@/types'

export default async function ServiceListingDetailPage({
  params,
}: {
  params: Promise<{ type: string; slug: string }>
}) {
  const { type: typeParam, slug } = await params

  // Validate type
  const validTypes: ServiceListingType[] = ['stays', 'activities', 'rentals', 'getting_around']
  if (!validTypes.includes(typeParam as ServiceListingType)) {
    notFound()
  }

  const type = typeParam as ServiceListingType

  try {
    const listing = await getServiceListingDetail(slug)

    if (!listing || listing.type !== type) {
      notFound()
    }

    // `service_listing_items` may not exist yet if migration 049 hasn't been
    // applied. The action swallows the error and returns [] in that case.
    const [items, relatedListings] = await Promise.all([
      getPublicServiceListingItems(listing.id),
      getRelatedListings(listing.id, {
        type: listing.type,
        destination_ids: listing.destination_ids,
        tags: listing.tags,
      }, 6),
    ])

    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-6">
          {listing.status === 'pending' && listing.first_approved_at && (
            <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              Recent host edits are under review — booking stays open.
            </div>
          )}

          <ListingDetailClient listing={listing} items={items} host={listing.host ?? null} relatedListings={relatedListings} />
        </div>
      </div>
    )
  } catch (error) {
    console.error('Error loading service listing:', error)
    notFound()
  }
}
