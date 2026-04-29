import { redirect, notFound } from 'next/navigation'
import { checkIsHost } from '@/actions/hosting'
import { getDestinations } from '@/actions/admin'
import { listServiceListingItems } from '@/actions/host-service-listing-items'
import { fetchServiceBookingCountsForListings } from '@/lib/service-listing-booking-stats'
import { hostMayResubmitServiceListing } from '@/lib/service-listing-resubmit'
import { createClient } from '@/lib/supabase/server'
import { HostServiceListingTabs } from '@/components/hosting/HostServiceListingTabs'
import { ResubmitServiceListingButton } from '@/app/(main)/host/ResubmitServiceListingButton'
import type { ServiceListing, ServiceListingType } from '@/types'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}

const TAB_INDEX: Record<string, number> = {
  business: 0,
  items: 1,
  review: 2,
}

export default async function EditServiceListingPage({ params, searchParams }: PageProps) {
  const { id } = await params
  const { tab } = await searchParams

  const hostStatus = await checkIsHost()
  if (!hostStatus.authenticated) redirect('/login')
  if (!hostStatus.isHost) redirect('/host/verify')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: listing } = await supabase
    .from('service_listings')
    .select('*')
    .eq('id', id)
    .single()

  if (!listing) notFound()
  if (listing.host_id !== user.id) redirect('/host')

  const [destinations, itemsResult, countsResult] = await Promise.all([
    getDestinations(),
    listServiceListingItems(id),
    fetchServiceBookingCountsForListings(supabase, [id]),
  ])
  const maxItemMs = items.reduce(
    (m, it) =>
      Math.max(m, Math.max(new Date(it.updated_at).getTime(), new Date(it.created_at).getTime())),
    0,
  )
  const L = listing as ServiceListing
  const allowServiceResubmit = hostMayResubmitServiceListing({
    last_host_resubmit_at: L.last_host_resubmit_at ?? null,
    listing_updated_at: L.updated_at,
    maxItemActivityMs: maxItemMs,
  })
  const listingBookingCount = countsResult.byListingId[id] ?? 0
  const bookingCountByItemId = countsResult.byItemId

  const initialTab = tab ? TAB_INDEX[tab] : undefined

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-black mb-2">
            Edit <span className="text-primary">{listing.title}</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Business details, items, and photos can all be updated here. Changes to an approved
            listing reset its status to Pending so admins can re-review.
          </p>
        </div>

        {(listing.status === 'rejected' || listing.status === 'archived') && (
          <div className="mb-6 rounded-xl border border-amber-400/45 bg-amber-500/15 px-4 py-3 text-sm text-white">
            <p className="font-semibold">
              {listing.status === 'rejected'
                ? 'This listing was not approved by the team.'
                : 'This listing has been archived.'}
            </p>
            <p className="mt-1 text-white/80">
              Update your business details or items below and <strong className="text-white">save your changes</strong>, then use{' '}
              <strong className="text-white">Resubmit</strong> to send the listing back to the admin queue. After you resubmit once,
              you need to edit and save again before you can resubmit another time — this helps avoid duplicate submissions.
            </p>
            <div className="mt-3">
              <ResubmitServiceListingButton listingId={listing.id} allowResubmit={allowServiceResubmit} />
            </div>
          </div>
        )}

        <HostServiceListingTabs
          mode="edit"
          type={listing.type as ServiceListingType}
          destinations={destinations}
          userId={user.id}
          listing={listing as ServiceListing & { destination_ids?: string[] | null }}
          initialItems={items}
          initialTab={initialTab}
          listingBookingCount={listingBookingCount}
          bookingCountByItemId={bookingCountByItemId}
        />
    </div>
  )
}
