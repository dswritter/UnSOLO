import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listServiceListingItems } from '@/actions/host-service-listing-items'
import type { ServiceListing } from '@/types'
import { ItemsManagerClient } from './ItemsManagerClient'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ServiceListingItemsPage({ params }: PageProps) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: listing } = await supabase
    .from('service_listings')
    .select('id, title, type, host_id, location, description, unit, price_paise')
    .eq('id', id)
    .single()

  if (!listing) notFound()
  if (listing.host_id !== user.id) redirect('/host')

  const result = await listServiceListingItems(id)
  const items = 'items' in result && result.items ? result.items : []

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-black mb-1">{listing.title}</h1>
          <p className="text-sm text-muted-foreground">
            Manage items under this listing. Each item has its own photos, price, quantity, and max per booking.
          </p>
        </div>

        <ItemsManagerClient
          listingId={id}
          listingUnit={(listing as Pick<ServiceListing, 'unit'>).unit}
          initialItems={items}
        />
      </div>
    </div>
  )
}
