export const revalidate = 300 // 5 minutes

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getServiceListingDetail } from '@/actions/service-listing-discovery'
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

    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-6">
          {/* Back button */}
          <Link
            href="/explore"
            className="text-sm text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1"
          >
            ← Back to Explore
          </Link>

          <ListingDetailClient listing={listing} />
        </div>
      </div>
    )
  } catch (error) {
    console.error('Error loading service listing:', error)
    notFound()
  }
}
