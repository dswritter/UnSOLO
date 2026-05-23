import { getDestinations } from '@/actions/admin'
import { getAdminServiceListings } from '@/actions/admin-service-listings'
import { ServiceListingsClient } from './ServiceListingsClient'

export default async function AdminServiceListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string }>
}) {
  const sp = await searchParams

  // Surface the actual error inline instead of throwing. error.tsx at
  // `(admin)/admin/error.tsx` only catches errors in the React tree below it
  // — server-action exceptions during this RSC's render were producing a
  // framework-level 500 ("This page couldn't load") for non-admin staff,
  // hiding the real cause. Catching here keeps the admin chrome and shows
  // the message + stack in-page so we can actually see what's wrong.
  let serviceListings: Awaited<ReturnType<typeof getAdminServiceListings>> = []
  let destinations: Awaited<ReturnType<typeof getDestinations>> = []
  const errors: string[] = []

  const [listingsResult, destinationsResult] = await Promise.allSettled([
    getAdminServiceListings(),
    getDestinations(),
  ])
  if (listingsResult.status === 'fulfilled') {
    serviceListings = listingsResult.value
  } else {
    const e = listingsResult.reason
    console.error('[/admin/service-listings] getAdminServiceListings failed:', e)
    errors.push(`getAdminServiceListings: ${e instanceof Error ? e.message : String(e)}`)
  }
  if (destinationsResult.status === 'fulfilled') {
    destinations = destinationsResult.value
  } else {
    const e = destinationsResult.reason
    console.error('[/admin/service-listings] getDestinations failed:', e)
    errors.push(`getDestinations: ${e instanceof Error ? e.message : String(e)}`)
  }

  if (errors.length > 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Manage Service Listings</h1>
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-5 text-sm text-rose-100">
          <p className="font-semibold text-base mb-2">Couldn&apos;t load this page</p>
          <ul className="list-disc pl-5 space-y-1 font-mono text-[12px]">
            {errors.map((msg, i) => (
              <li key={i} className="whitespace-pre-wrap break-all">{msg}</li>
            ))}
          </ul>
          <p className="mt-3 text-white/55 text-xs">
            Full stack trace in Vercel Function logs. If this persists, share the message above with engineering.
          </p>
        </div>
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
