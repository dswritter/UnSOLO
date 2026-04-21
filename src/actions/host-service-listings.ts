'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import type { ServiceListingType, ServiceListingMetadata } from '@/types'

/**
 * Fan out a notification to every admin. Uses the service-role client so the
 * write bypasses RLS on `notifications` for users we don't own.
 */
async function notifyAdminsOfServiceListing(opts: {
  hostId: string
  listingTitle: string
  variant: 'submitted' | 'resubmitted'
}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return // silently no-op in environments without service key

  const svc = createServiceClient(url, serviceKey)
  const { data: host } = await svc
    .from('profiles')
    .select('full_name, username')
    .eq('id', opts.hostId)
    .single()
  const hostName = host?.full_name || host?.username || 'A host'

  const { data: admins } = await svc.from('profiles').select('id').in('role', ['admin'])
  if (!admins || admins.length === 0) return

  const title = opts.variant === 'resubmitted'
    ? 'Service Listing Resubmitted for Review'
    : 'New Service Listing for Review'
  const body = opts.variant === 'resubmitted'
    ? `${hostName} resubmitted "${opts.listingTitle}" after making changes.`
    : `${hostName} submitted "${opts.listingTitle}" for moderation.`

  await Promise.all(
    admins.map(a =>
      svc.from('notifications').insert({
        user_id: a.id,
        type: 'booking',
        title,
        body,
        link: '/admin/service-listings',
      }),
    ),
  )
}

type ServiceUnit = 'per_night' | 'per_person' | 'per_day' | 'per_hour' | 'per_week' | 'per_month'

/**
 * Master-level fields that are safe for a host to tweak on an approved listing
 * without forcing a full admin re-review. Mirrors HOST_TRIP_OPERATIONAL_FIELDS
 * in hosting.ts — changes here stay live; changes to anything else (title,
 * description, unit, destinations) bounce the listing back to `pending`.
 */
const HOST_SERVICE_OPERATIONAL_FIELDS = new Set<string>([
  'amenities',
  'tags',
  'location', // street address / specific location text
])

export type HostServiceItemDraft = {
  name: string
  description: string | null
  price_paise: number
  quantity_available: number
  max_per_booking: number
  images: string[]
  /** Rentals only: item-level pricing unit. Null on other types. */
  unit?: ServiceUnit | null
  /** Rentals only: item-level amenities. Null on other types. */
  amenities?: string[] | null
}

export async function createHostServiceListing(input: {
  title: string
  description: string | null
  short_description: string | null
  type: ServiceListingType
  unit: ServiceUnit
  destination_ids: string[]
  location: string | null
  amenities: string[]
  tags: string[]
  metadata: ServiceListingMetadata | null
  host_id: string
  items: HostServiceItemDraft[]
}) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // Verify user is authenticated
    if (!user) {
      return { error: 'Not authenticated' }
    }

    // Verify host_id matches current user
    if (input.host_id !== user.id) {
      return { error: 'Unauthorized' }
    }

    // Validate destinations: must have at least one, and all must exist.
    const destinationIds = Array.from(new Set(input.destination_ids.filter(Boolean)))
    if (destinationIds.length === 0) {
      return { error: 'Please pick at least one location' }
    }

    const { data: dests } = await supabase
      .from('destinations')
      .select('id')
      .in('id', destinationIds)

    if (!dests || dests.length !== destinationIds.length) {
      return { error: 'One or more locations could not be found' }
    }
    const primaryDestinationId = destinationIds[0]

    // Validate items: need at least one.
    const items = input.items.filter(i => i.name.trim().length > 0)
    if (items.length === 0) {
      return { error: 'Please add at least one item to your listing' }
    }
    if (items.length > 100) {
      return { error: 'A listing can hold at most 100 items' }
    }
    for (const item of items) {
      if (item.images.length > 5) {
        return { error: `"${item.name}": max 5 photos per item` }
      }
      if (item.price_paise < 0 || item.quantity_available < 0 || item.max_per_booking < 1) {
        return { error: `"${item.name}" has invalid price, quantity, or max` }
      }
    }

    // Derive master-level price/images from items: min price for discovery
    // sort, and the first item that actually has photos (not strictly
    // items[0]) so the hero never ends up empty when a host leaves the
    // lead item's photos blank but uploads images on subsequent items.
    const minPricePaise = Math.min(...items.map(i => i.price_paise))
    const firstItemWithImages = items.find(i => i.images.length > 0)
    const heroImages = firstItemWithImages?.images.slice(0, 5) ?? []

    // Rentals: each item owns its unit. Master unit gets the cheapest
    // item's unit so "from ₹X / unit" discovery cards stay coherent.
    // Master amenities stays null — item cards render their own.
    let effectiveMasterUnit: ServiceUnit = input.unit
    let effectiveMasterAmenities: string[] = input.amenities
    if (input.type === 'rentals') {
      const cheapest = items.reduce((a, b) => (a.price_paise <= b.price_paise ? a : b))
      if (cheapest.unit) effectiveMasterUnit = cheapest.unit
      effectiveMasterAmenities = []
      for (const item of items) {
        if (!item.unit) {
          return { error: `"${item.name}": please pick a pricing unit` }
        }
      }
    }

    // Generate slug from title
    const slug = input.title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      + '-' + Date.now()

    // Create the listing
    const { data, error: insertError } = await supabase
      .from('service_listings')
      .insert({
        title: input.title,
        slug,
        description: input.description,
        short_description: input.short_description,
        type: input.type,
        price_paise: minPricePaise,
        unit: effectiveMasterUnit,
        destination_id: primaryDestinationId,
        destination_ids: destinationIds,
        location: input.location,
        latitude: null,
        longitude: null,
        max_guests_per_booking: null,
        quantity_available: null,
        amenities: effectiveMasterAmenities.length > 0 ? effectiveMasterAmenities : null,
        tags: input.tags.length > 0 ? input.tags : null,
        images: heroImages.length > 0 ? heroImages : null,
        metadata: input.metadata,
        host_id: input.host_id,
        is_active: true,
        is_featured: false,
        status: 'pending',
      })
      .select('id, slug')
      .single()

    if (insertError) {
      console.error('Database error:', insertError)
      return { error: 'Failed to create listing' }
    }

    // Batch-insert items with stable ordering.
    const { error: itemsError } = await supabase
      .from('service_listing_items')
      .insert(items.map((item, idx) => ({
        service_listing_id: data.id,
        name: item.name.trim(),
        description: item.description?.trim() || null,
        price_paise: item.price_paise,
        quantity_available: item.quantity_available,
        max_per_booking: item.max_per_booking,
        images: item.images,
        position_order: idx,
        // Rentals carry per-item unit/amenities; other types leave these null.
        unit: input.type === 'rentals' ? (item.unit ?? null) : null,
        amenities: input.type === 'rentals' ? (item.amenities ?? []) : null,
      })))

    if (itemsError) {
      console.error('Items insert error:', itemsError)
      // Roll back the parent so the host can retry cleanly.
      await supabase.from('service_listings').delete().eq('id', data.id)
      return { error: 'Failed to save items. Please try again.' }
    }

    await notifyAdminsOfServiceListing({
      hostId: input.host_id,
      listingTitle: input.title,
      variant: 'submitted',
    })

    return { success: true, data }
  } catch (error) {
    console.error('Error creating service listing:', error)
    return { error: 'An unexpected error occurred' }
  }
}

/**
 * Re-submit a rejected service listing for another round of admin review.
 * Mirrors `resubmitTrip` — flips status back to pending and re-notifies admins.
 * Hosts can only resubmit their own rejected listings.
 */
export async function resubmitServiceListing(listingId: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const { data: listing, error: fetchError } = await supabase
      .from('service_listings')
      .select('id, title, host_id, status')
      .eq('id', listingId)
      .single()

    if (fetchError || !listing) return { error: 'Listing not found' }
    if (listing.host_id !== user.id) return { error: 'Unauthorized' }
    if (listing.status !== 'rejected') {
      return { error: 'Only rejected listings can be resubmitted' }
    }

    const { error: updateError } = await supabase
      .from('service_listings')
      .update({ status: 'pending' })
      .eq('id', listingId)

    if (updateError) return { error: 'Failed to resubmit listing' }

    await notifyAdminsOfServiceListing({
      hostId: user.id,
      listingTitle: listing.title,
      variant: 'resubmitted',
    })

    return { success: true }
  } catch (error) {
    console.error('Error resubmitting service listing:', error)
    return { error: 'An unexpected error occurred' }
  }
}

/**
 * Edit the master / business fields of a service listing owned by the current
 * host. Items are managed separately via host-service-listing-items actions.
 * An edit on an approved listing resets its status to `pending` so admins
 * re-review the changes.
 */
export async function updateHostServiceListing(
  listingId: string,
  patch: {
    title?: string
    description?: string | null
    short_description?: string | null
    unit?: ServiceUnit
    destination_ids?: string[]
    location?: string | null
    amenities?: string[]
    tags?: string[]
    metadata?: ServiceListingMetadata | null
  },
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const { data: existing, error: fetchError } = await supabase
      .from('service_listings')
      .select('id, host_id, title, status')
      .eq('id', listingId)
      .single()

    if (fetchError || !existing) return { error: 'Listing not found' }
    if (existing.host_id !== user.id) return { error: 'Unauthorized' }

    const update: Record<string, unknown> = {}
    if (patch.title !== undefined) update.title = patch.title.trim()
    if (patch.description !== undefined) update.description = patch.description
    if (patch.short_description !== undefined) update.short_description = patch.short_description
    if (patch.unit !== undefined) update.unit = patch.unit
    if (patch.location !== undefined) update.location = patch.location
    if (patch.amenities !== undefined) update.amenities = patch.amenities.length > 0 ? patch.amenities : null
    if (patch.tags !== undefined) update.tags = patch.tags.length > 0 ? patch.tags : null
    if (patch.metadata !== undefined) update.metadata = patch.metadata

    if (patch.destination_ids !== undefined) {
      const ids = Array.from(new Set(patch.destination_ids.filter(Boolean)))
      if (ids.length === 0) return { error: 'Please pick at least one location' }
      const { data: dests } = await supabase.from('destinations').select('id').in('id', ids)
      if (!dests || dests.length !== ids.length) {
        return { error: 'One or more locations could not be found' }
      }
      update.destination_ids = ids
      update.destination_id = ids[0]
    }

    // Approved listings bounce back to pending only when a *substantive* field
    // changed. Tags / amenities / address-text edits stay live so travelers
    // can keep booking while the host polishes details.
    const substantiveChange = Object.keys(update).some(k => !HOST_SERVICE_OPERATIONAL_FIELDS.has(k))
    const wasApproved = existing.status === 'approved' && substantiveChange
    if (wasApproved) {
      update.status = 'pending'
    }

    if (Object.keys(update).length === 0) {
      return { success: true }
    }

    const { error: updateError } = await supabase
      .from('service_listings')
      .update(update)
      .eq('id', listingId)

    if (updateError) {
      console.error('updateHostServiceListing:', updateError)
      return { error: 'Failed to save changes' }
    }

    if (wasApproved) {
      await notifyAdminsOfServiceListing({
        hostId: user.id,
        listingTitle: (patch.title?.trim() || existing.title) as string,
        variant: 'resubmitted',
      })
    }

    // Let callers distinguish "saved quietly" from "saved and back in
    // admin queue" so hosts see an appropriate confirmation toast.
    return { success: true, statusChangedToPending: wasApproved }
  } catch (error) {
    console.error('Error updating service listing:', error)
    return { error: 'An unexpected error occurred' }
  }
}

export async function toggleHostServiceListingActive(listingId: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const { data: listing, error: fetchError } = await supabase
      .from('service_listings')
      .select('id, host_id, is_active')
      .eq('id', listingId)
      .single()

    if (fetchError || !listing) return { error: 'Listing not found' }
    if (listing.host_id !== user.id) return { error: 'Unauthorized' }

    const { error: updateError } = await supabase
      .from('service_listings')
      .update({ is_active: !listing.is_active })
      .eq('id', listingId)

    if (updateError) return { error: 'Failed to update listing' }
    return { success: true, isActive: !listing.is_active }
  } catch (error) {
    console.error('toggleHostServiceListingActive:', error)
    return { error: 'An unexpected error occurred' }
  }
}
