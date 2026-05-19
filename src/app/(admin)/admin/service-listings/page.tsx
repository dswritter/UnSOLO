import { getDestinations } from '@/actions/admin'
import { getAdminServiceListings } from '@/actions/admin-service-listings'
import { ServiceListingsClient } from './ServiceListingsClient'

export default async function AdminServiceListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string }>
}) {
  const sp = await searchParams

  let serviceListings: Awaited<ReturnType<typeof getAdminServiceListings>> = []
  let destinations: Awaited<ReturnType<typeof getDestinations>> = []
  let diagError: string | null = null

  try {
    serviceListings = await getAdminServiceListings()
  } catch (e) {
    console.error('[service-listings] getAdminServiceListings failed:', e)
    diagError = `getAdminServiceListings: ${e instanceof Error ? e.message : String(e)}`
  }
  try {
    destinations = await getDestinations()
  } catch (e) {
    console.error('[service-listings] getDestinations failed:', e)
    diagError = (diagError ? diagError + ' | ' : '') + `getDestinations: ${e instanceof Error ? e.message : String(e)}`
  }

  if (diagError) {
    return (
      <div className="p-6 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-sm space-y-2">
        <p className="font-bold text-base">Debug: action error</p>
        <pre className="whitespace-pre-wrap break-all">{diagError}</pre>
        <p className="text-white/50 text-xs">Check Vercel function logs for full stack trace.</p>
      </div>
    )
  }

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
