import { redirect, notFound } from 'next/navigation'
import { checkIsHost } from '@/actions/hosting'
import { getDestinations } from '@/actions/admin'
import { listServiceListingItems } from '@/actions/host-service-listing-items'
import { createClient } from '@/lib/supabase/server'
import { HostServiceListingTabs } from '@/components/hosting/HostServiceListingTabs'
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

  const [destinations, itemsResult] = await Promise.all([
    getDestinations(),
    listServiceListingItems(id),
  ])
  const items = 'items' in itemsResult && itemsResult.items ? itemsResult.items : []

  const initialTab = tab ? TAB_INDEX[tab] : undefined

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-black mb-2">
            Edit <span className="text-primary">{listing.title}</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Business details, items, and photos can all be updated here. Changes to an approved
            listing reset its status to Pending so admins can re-review.
          </p>
        </div>

        <HostServiceListingTabs
          mode="edit"
          type={listing.type as ServiceListingType}
          destinations={destinations}
          userId={user.id}
          listing={listing as ServiceListing & { destination_ids?: string[] | null }}
          initialItems={items}
          initialTab={initialTab}
        />
    </div>
  )
}
