import { getDestinations } from '@/actions/admin'
import { ServiceListingForm } from '../ServiceListingForm'

export default async function CreateServiceListingPage() {
  const destinations = await getDestinations()

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Create Service Listing</h1>
      <ServiceListingForm destinations={destinations} />
    </div>
  )
}
