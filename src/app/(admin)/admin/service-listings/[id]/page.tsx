import { getDestinations } from '@/actions/admin'
import { getServiceListingDetail } from '@/actions/admin-service-listings'
import { ServiceListingForm } from '../ServiceListingForm'

export default async function EditServiceListingPage({ params }: { params: { id: string } }) {
  const [listing, destinations] = await Promise.all([
    getServiceListingDetail(params.id),
    getDestinations(),
  ])

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Edit Service Listing</h1>
      <ServiceListingForm destinations={destinations} listing={listing} />
    </div>
  )
}
