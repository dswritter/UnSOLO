import { getDestinations } from '@/actions/admin'
import { getAdminServiceListings } from '@/actions/admin-service-listings'
import { ServiceListingsClient } from './ServiceListingsClient'

export default async function AdminServiceListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string }>
}) {
  const sp = await searchParams
  const [serviceListings, destinations] = await Promise.all([
    getAdminServiceListings(),
    getDestinations(),
  ])

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Manage Service Listings</h1>
        <a
          href="/admin/service-listings/create"
          className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          + Create Listing
        </a>
      </div>
      <ServiceListingsClient
        serviceListings={serviceListings}
        destinations={destinations}
        initialStatusFilter={sp.status}
        initialTypeFilter={sp.type}
      />
    </div>
  )
}
