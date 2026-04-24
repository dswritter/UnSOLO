export const revalidate = 300 // 5 minutes

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getServiceListingDetail, getRelatedListings, getServiceListingsByType } from '@/actions/service-listing-discovery'
import { getPublicServiceListingItems } from '@/actions/host-service-listing-items'
import { ListingDetailClient } from '@/components/listings/ListingDetailClient'
import type { ServiceListingType } from '@/types'
import { createClient } from '@/lib/supabase/server'

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
    const [items, relatedListings, hostListings] = await Promise.all([
      getPublicServiceListingItems(listing.id),
      getRelatedListings(listing.id, {
        type: listing.type,
        destination_ids: listing.destination_ids,
        tags: listing.tags,
      }, 6),
      listing.host_id ? (async () => {
        const supabase = await createClient()
        const { data } = await supabase
          .from('service_listings')
          .select('*')
          .eq('host_id', listing.host_id)
          .eq('is_active', true)
          .or('status.eq.approved,and(status.eq.pending,first_approved_at.not.is.null)')
          .neq('id', listing.id)
          .limit(6)
        return (data || []) as any[]
      })() : Promise.resolve([]),
    ])

    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-6">
          {listing.status === 'pending' && listing.first_approved_at && (
            <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              Recent host edits are under review — booking stays open.
            </div>
          )}

          <ListingDetailClient listing={listing} items={items} host={listing.host ?? null} relatedListings={relatedListings} hostListings={hostListings} />
        </div>
      </div>
    )
  } catch (error) {
    console.error('Error loading service listing:', error)
    notFound()
  }
}
