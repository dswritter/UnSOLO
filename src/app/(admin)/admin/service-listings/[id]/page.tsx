import Link from 'next/link'
import { getDestinations } from '@/actions/admin'
import { getServiceListingDetail } from '@/actions/admin-service-listings'
import { ServiceListingForm } from '../ServiceListingForm'
import { AdminListingReviewView } from '../AdminListingReviewView'
import { DeleteListingButton } from '../DeleteListingButton'

// Next.js 15: params is a Promise — must be awaited before use.
export default async function EditServiceListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [listing, destinations] = await Promise.all([
    getServiceListingDetail(id),
    getDestinations(),
  ])

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/60 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Edit Community Listing</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Admin can edit approved, pending, rejected, or archived listings here. Use the quick form below for master details,
            or open the full editor for item-level prices, photos, and date availability.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/host/service-listings/${listing.id}/edit`}
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Open full editor
          </Link>
          <Link
            href={`/admin/service-listings/${listing.id}/preview`}
            className="inline-flex items-center justify-center rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary/60"
          >
            Admin preview
          </Link>
          <DeleteListingButton id={listing.id} />
        </div>
      </div>

      {(listing.status === 'pending' || listing.status === 'rejected') && (
        <div>
          <h2 className="mb-4 text-xl font-bold">
            {listing.status === 'pending' ? 'Review Listing' : 'Moderation Context'}
          </h2>
          <AdminListingReviewView listing={listing} />
        </div>
      )}

      <div>
        <h2 className="mb-4 text-xl font-bold">Quick Listing Details</h2>
        <ServiceListingForm destinations={destinations} listing={listing} />
      </div>
    </div>
  )
}
