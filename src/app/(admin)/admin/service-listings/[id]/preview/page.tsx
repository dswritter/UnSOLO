import Link from 'next/link'
import { getServiceListingDetail } from '@/actions/admin-service-listings'
import { ListingDetailClient } from '@/components/listings/ListingDetailClient'
import type { ServiceListingItem } from '@/types'

export default async function AdminListingPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const listing = await getServiceListingDetail(id)
  const items = listing.items as ServiceListingItem[]

  return (
    <div className="min-h-screen bg-background">
      {/* Admin preview banner */}
      <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between">
        <span className="text-sm text-amber-700 font-medium">
          Admin preview — status: <span className="font-bold capitalize">{listing.status}</span>
          {listing.status === 'pending' && !listing.first_approved_at && ' (never approved — not visible to public yet)'}
        </span>
        <Link
          href={`/admin/service-listings/${id}`}
          className="text-sm text-amber-700 underline hover:text-amber-900"
        >
          ← Back to review
        </Link>
      </div>

      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-6">
        <ListingDetailClient
          listing={listing}
          items={items}
          host={listing.host ? {
            id: listing.host.id,
            username: listing.host.username,
            full_name: listing.host.full_name,
            avatar_url: listing.host.avatar_url,
            host_rating: null,
            is_verified: false,
          } : null}
        />
      </div>
    </div>
  )
}
