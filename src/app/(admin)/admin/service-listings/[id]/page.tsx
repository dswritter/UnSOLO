import { getDestinations } from '@/actions/admin'
import { getServiceListingDetail } from '@/actions/admin-service-listings'
import { ServiceListingForm } from '../ServiceListingForm'
import { AdminListingReviewView } from '../AdminListingReviewView'

// Next.js 15: params is a Promise — must be awaited before use.
export default async function EditServiceListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [listing, destinations] = await Promise.all([
    getServiceListingDetail(id),
    getDestinations(),
  ])

  // Pending listings get the review UI; all other statuses use the edit form.
  if (listing.status === 'pending') {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold">Review Listing</h1>
        <AdminListingReviewView listing={listing} />
      </div>
    )
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Edit Service Listing</h1>
      <ServiceListingForm destinations={destinations} listing={listing} />
    </div>
  )
}
