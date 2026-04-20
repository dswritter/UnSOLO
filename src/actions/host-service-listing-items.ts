'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import type { ServiceListingItem } from '@/types'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Item fields that are safe to tweak on an approved listing without
 * dragging the listing back into re-review. Mirror of
 * HOST_SERVICE_OPERATIONAL_FIELDS on the master listing — keep small so we
 * don't let hosts slip substantive changes (price, images, name) past
 * moderation silently.
 */
const OPERATIONAL_ITEM_FIELDS = new Set<string>([
  'quantity_available',
  'max_per_booking',
  'is_active',
  'position_order',
])

/**
 * After any item insert/update/delete, recompute the parent listing's
 * `images` column from the first item that actually has photos. Keeps the
 * public hero in sync when a host rearranges items or adds pictures to a
 * later item. Runs silently — failures don't block the caller.
 */
/**
 * Keeps the master listing row in sync with its items after any CRUD:
 * - images  → hero images from first item that has photos
 * - price_paise → minimum price across all active items (so explore cards
 *   always reflect the cheapest option rather than showing a stale master value
 *   that was set under the old single-price flow)
 */
async function refreshListingHeroImages(
  supabase: SupabaseServerClient,
  listingId: string,
) {
  const { data: allItems } = await supabase
    .from('service_listing_items')
    .select('images, price_paise, is_active, position_order, created_at')
    .eq('service_listing_id', listingId)
    .order('position_order', { ascending: true })
    .order('created_at', { ascending: true })

  const items = allItems || []
  const activeItems = items.filter((r: { is_active: boolean | null }) => r.is_active !== false)

  // Hero: first item (active preferred) that has at least one image
  const firstWithImages = (activeItems.length > 0 ? activeItems : items).find(
    (r: { images: string[] | null }) => Array.isArray(r.images) && r.images.length > 0,
  ) as { images: string[] } | undefined
  const hero = firstWithImages?.images.slice(0, 5) ?? []

  // Min price: lowest price_paise across active items, fallback to all items
  const pricePool = (activeItems.length > 0 ? activeItems : items) as { price_paise: number }[]
  const prices = pricePool.map(i => i.price_paise).filter(p => typeof p === 'number' && p > 0)
  const minPrice = prices.length > 0 ? Math.min(...prices) : null

  await supabase
    .from('service_listings')
    .update({
      images: hero.length > 0 ? hero : null,
      ...(minPrice !== null ? { price_paise: minPrice } : {}),
    })
    .eq('id', listingId)
}

/**
 * Fan out an admin notification after an item change bounced the parent
 * listing back to `pending`. Uses the service role so we can write to
 * admin user rows the host doesn't own. No-op if the service key is
 * absent (local/dev without secrets).
 */
async function notifyAdminsOfItemResubmission(opts: {
  hostId: string
  listingTitle: string
}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return
  const svc = createServiceClient(url, serviceKey)
  const { data: host } = await svc
    .from('profiles')
    .select('full_name, username')
    .eq('id', opts.hostId)
    .single()
  const hostName = host?.full_name || host?.username || 'A host'
  const { data: admins } = await svc.from('profiles').select('id').in('role', ['admin'])
  if (!admins || admins.length === 0) return
  await Promise.all(
    admins.map(a =>
      svc.from('notifications').insert({
        user_id: a.id,
        type: 'booking',
        title: 'Service Listing Resubmitted for Review',
        body: `${hostName} changed items on "${opts.listingTitle}" — re-review needed.`,
        link: '/admin/service-listings',
      }),
    ),
  )
}

/**
 * If the parent listing is currently 'approved', flip it back to 'pending'
 * and notify admins. Returns true when a flip happened so the caller can
 * surface a "sent for review" toast on the host's next save.
 */
async function maybeBounceListingToPending(
  supabase: SupabaseServerClient,
  listingId: string,
): Promise<boolean> {
  const { data: listing } = await supabase
    .from('service_listings')
    .select('id, title, host_id, status')
    .eq('id', listingId)
    .single()
  if (!listing || listing.status !== 'approved') return false

  const { error } = await supabase
    .from('service_listings')
    .update({ status: 'pending' })
    .eq('id', listingId)
  if (error) return false

  await notifyAdminsOfItemResubmission({
    hostId: listing.host_id,
    listingTitle: listing.title,
  })
  return true
}

async function requireHostOfListing(listingId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' as const }

  const { data: listing } = await supabase
    .from('service_listings')
    .select('id, host_id')
    .eq('id', listingId)
    .single()

  if (!listing) return { error: 'Listing not found' as const }
  if (listing.host_id !== user.id) return { error: 'Unauthorized' as const }

  return { supabase, user, listing }
}

export async function listServiceListingItems(listingId: string) {
  const ctx = await requireHostOfListing(listingId)
  if ('error' in ctx) return { error: ctx.error }

  const { data, error } = await ctx.supabase
    .from('service_listing_items')
    .select('*')
    .eq('service_listing_id', listingId)
    .order('position_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) return { error: 'Failed to load items' }
  return { items: (data || []) as ServiceListingItem[] }
}

type ItemUnit = 'per_night' | 'per_person' | 'per_day' | 'per_hour' | 'per_week' | 'per_month'

export async function createServiceListingItem(input: {
  service_listing_id: string
  name: string
  description?: string | null
  price_paise: number
  quantity_available: number
  max_per_booking: number
  images: string[]
  position_order?: number
  unit?: ItemUnit | null
  amenities?: string[] | null
}) {
  const ctx = await requireHostOfListing(input.service_listing_id)
  if ('error' in ctx) return { error: ctx.error }

  if (!input.name.trim()) return { error: 'Item name is required' }
  if (input.price_paise < 0) return { error: 'Price cannot be negative' }
  if (input.quantity_available < 0) return { error: 'Quantity cannot be negative' }
  if (input.max_per_booking < 1) return { error: 'Max per booking must be at least 1' }

  const { data, error } = await ctx.supabase
    .from('service_listing_items')
    .insert({
      service_listing_id: input.service_listing_id,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      price_paise: input.price_paise,
      quantity_available: input.quantity_available,
      max_per_booking: input.max_per_booking,
      images: input.images,
      position_order: input.position_order ?? 0,
      unit: input.unit ?? null,
      amenities: input.amenities ?? null,
    })
    .select('*')
    .single()

  if (error) {
    console.error('createServiceListingItem:', error)
    return { error: 'Failed to create item' }
  }

  // Refresh the master hero so newly-added photos show up publicly.
  // Re-review is triggered only when the host saves the Business Details
  // tab (updateHostServiceListing), not on individual item CRUD.
  await refreshListingHeroImages(ctx.supabase, input.service_listing_id)

  return {
    success: true,
    item: data as ServiceListingItem,
    statusChangedToPending: false,
  }
}

export async function updateServiceListingItem(
  itemId: string,
  patch: Partial<{
    name: string
    description: string | null
    price_paise: number
    quantity_available: number
    max_per_booking: number
    images: string[]
    position_order: number
    is_active: boolean
    unit: ItemUnit | null
    amenities: string[] | null
  }>,
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Verify ownership via join-like lookup.
  const { data: existing } = await supabase
    .from('service_listing_items')
    .select('id, service_listing_id, service_listings!inner(host_id)')
    .eq('id', itemId)
    .single()

  if (!existing) return { error: 'Item not found' }
  // @ts-expect-error supabase join shape
  if (existing.service_listings?.host_id !== user.id) {
    return { error: 'Unauthorized' }
  }

  if (patch.name !== undefined && !patch.name.trim()) {
    return { error: 'Item name is required' }
  }

  const { data, error } = await supabase
    .from('service_listing_items')
    .update({
      ...patch,
      name: patch.name?.trim(),
      description: patch.description === undefined ? undefined : patch.description?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId)
    .select('*')
    .single()

  if (error) {
    console.error('updateServiceListingItem:', error)
    return { error: 'Failed to update item' }
  }

  // Always refresh the master hero — an `images` edit here is the whole
  // reason the hero used to go stale. Cheap enough to run for any update.
  // Re-review is triggered only when the host saves Business Details
  // (updateHostServiceListing), not on individual item saves.
  const listingId = (existing as { service_listing_id: string }).service_listing_id
  await refreshListingHeroImages(supabase, listingId)

  return {
    success: true,
    item: data as ServiceListingItem,
    statusChangedToPending: false,
  }
}

export async function deleteServiceListingItem(itemId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: existing } = await supabase
    .from('service_listing_items')
    .select('id, service_listing_id, service_listings!inner(host_id)')
    .eq('id', itemId)
    .single()

  if (!existing) return { error: 'Item not found' }
  // @ts-expect-error supabase join shape
  if (existing.service_listings?.host_id !== user.id) {
    return { error: 'Unauthorized' }
  }

  const listingId = (existing as { service_listing_id: string }).service_listing_id

  const { error } = await supabase
    .from('service_listing_items')
    .delete()
    .eq('id', itemId)

  if (error) return { error: 'Failed to delete item' }

  // Refresh hero in case the deleted item was the cover image source.
  // Re-review is triggered only via Business Details save, not item deletes.
  await refreshListingHeroImages(supabase, listingId)

  return { success: true, statusChangedToPending: false }
}

// Public: for detail pages. RLS ensures only approved+active listings' active items are returned.
export async function getPublicServiceListingItems(listingId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('service_listing_items')
    .select('*')
    .eq('service_listing_id', listingId)
    .eq('is_active', true)
    .order('position_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) return []
  return (data || []) as ServiceListingItem[]
}
