'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActionAuth } from '@/lib/auth/action-auth'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import type {
  ServiceEventScheduleEntry,
  ServiceListingType,
  ServiceListingMetadata,
} from '@/types'

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
  // Activities: adding/removing event dates / slots is operational — reopening
  // a lapsed schedule shouldn't drag the listing back through admin review.
  'event_schedule',
])

const TIME_RE = /^\d{2}:\d{2}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Validate + normalise an `event_schedule` payload. Returns null for empty,
 * which the column treats as "ongoing / non-date-specific". Drops malformed
 * entries silently rather than throwing, so a single bad row from the UI
 * doesn't block a save.
 */
function sanitizeEventSchedule(raw: unknown): ServiceEventScheduleEntry[] | null {
  if (!Array.isArray(raw)) return null
  const seenDates = new Set<string>()
  const entries: ServiceEventScheduleEntry[] = []

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const date = (item as { date?: unknown }).date
    if (typeof date !== 'string' || !DATE_RE.test(date)) continue
    if (seenDates.has(date)) continue
    seenDates.add(date)

    const rawSlots = (item as { slots?: unknown }).slots
    if (rawSlots == null) {
      entries.push({ date, slots: null })
      continue
    }
    if (!Array.isArray(rawSlots)) {
      entries.push({ date, slots: null })
      continue
    }
    const slots: { start: string; end: string }[] = []
    for (const s of rawSlots) {
      if (!s || typeof s !== 'object') continue
      const start = (s as { start?: unknown }).start
      const end = (s as { end?: unknown }).end
      if (typeof start !== 'string' || !TIME_RE.test(start)) continue
      if (typeof end !== 'string' || !TIME_RE.test(end)) continue
      if (start >= end) continue // end must be strictly after start
      slots.push({ start, end })
    }
    slots.sort((a, b) => a.start.localeCompare(b.start))
    entries.push({ date, slots: slots.length > 0 ? slots : null })
  }

  entries.sort((a, b) => a.date.localeCompare(b.date))
  return entries.length > 0 ? entries : null
}

/** True when the user is primary host or an accepted co-host on this listing. */
async function userCanEditServiceListing(
  supabase: Awaited<ReturnType<typeof createClient>>,
  listingId: string,
  userId: string,
): Promise<{ allowed: boolean; isPrimary: boolean } | null> {
  const { data: listing } = await supabase
    .from('service_listings')
    .select('host_id')
    .eq('id', listingId)
    .single()
  if (!listing) return null
  if (listing.host_id === userId) return { allowed: true, isPrimary: true }

  const { data: collab } = await supabase
    .from('service_listing_collaborators')
    .select('id')
    .eq('listing_id', listingId)
    .eq('user_id', userId)
    .eq('status', 'accepted')
    .maybeSingle()
  return { allowed: !!collab, isPrimary: false }
}

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
  latitude?: number | null
  longitude?: number | null
  amenities: string[]
  tags: string[]
  metadata: ServiceListingMetadata | null
  host_id: string
  items: HostServiceItemDraft[]
  /** Activities only — scheduled dates + optional slots. */
  event_schedule?: ServiceEventScheduleEntry[] | null
}) {
  try {
    const { supabase, user } = await getActionAuth()

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

    // Rentals & stays: each item owns its unit + amenities. Master unit gets
    // the cheapest item's unit so "from ₹X / unit" discovery cards stay coherent.
    // Master amenities stays null — item cards render their own.
    let effectiveMasterUnit: ServiceUnit = input.unit
    let effectiveMasterAmenities: string[] = input.amenities
    if (input.type === 'rentals' || input.type === 'stays') {
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
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
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
        event_schedule: input.type === 'activities'
          ? sanitizeEventSchedule(input.event_schedule)
          : null,
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
        // Rentals & stays carry per-item unit/amenities; other types leave these null.
        unit: input.type === 'rentals' || input.type === 'stays' ? (item.unit ?? null) : null,
        amenities: input.type === 'rentals' || input.type === 'stays' ? (item.amenities ?? []) : null,
      })))

    if (itemsError) {
      console.error('Items insert error:', itemsError)
      // Roll back the parent so the host can retry cleanly.
      await supabase.from('service_listings').delete().eq('id', data.id)
      const detail = itemsError.message || itemsError.code || 'unknown'
      return { error: `Failed to save items: ${detail}` }
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
 * Re-submit a rejected or archived service listing for another round of admin review.
 * Mirrors `resubmitTrip` — flips status back to pending and re-notifies admins.
 */
export async function resubmitServiceListing(listingId: string) {
  try {
    const { supabase, user } = await getActionAuth()
    if (!user) return { error: 'Not authenticated' }

    const { data: listing, error: fetchError } = await supabase
      .from('service_listings')
      .select('id, title, host_id, status, updated_at, last_host_resubmit_at')
      .eq('id', listingId)
      .single()

    if (fetchError || !listing) return { error: 'Listing not found' }
    if (listing.host_id !== user.id) return { error: 'Unauthorized' }
    if (listing.status !== 'rejected' && listing.status !== 'archived') {
      return { error: 'Only rejected or archived listings can be resubmitted for review' }
    }

    const lastRes = listing.last_host_resubmit_at as string | null
    if (lastRes) {
      const lr = new Date(lastRes).getTime()
      const lu = new Date(listing.updated_at as string).getTime()
      const { data: itemRows } = await supabase
        .from('service_listing_items')
        .select('updated_at, created_at')
        .eq('service_listing_id', listingId)
      let maxItemMs = 0
      for (const row of itemRows || []) {
        const r = row as { updated_at: string; created_at: string }
        maxItemMs = Math.max(
          maxItemMs,
          Math.max(new Date(r.updated_at).getTime(), new Date(r.created_at).getTime()),
        )
      }
      if (!(lu > lr || maxItemMs > lr)) {
        return {
          error:
            'Save changes to your listing or items before resubmitting — nothing changed since your last resubmit.',
        }
      }
    }

    const now = new Date().toISOString()
    const patch: { status: string; is_active?: boolean; last_host_resubmit_at: string; updated_at: string } = {
      status: 'pending',
      last_host_resubmit_at: now,
      updated_at: now,
    }
    if (listing.status === 'archived') {
      patch.is_active = true
    }

    const { error: updateError } = await supabase.from('service_listings').update(patch).eq('id', listingId)

    if (updateError) return { error: 'Failed to resubmit listing' }

    await notifyAdminsOfServiceListing({
      hostId: user.id,
      listingTitle: listing.title,
      variant: 'resubmitted',
    })

    revalidatePath('/admin/service-listings')
    revalidatePath('/host')
    revalidatePath(`/host/service-listings/${listingId}/edit`)

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
    latitude?: number | null
    longitude?: number | null
    amenities?: string[]
    tags?: string[]
    metadata?: ServiceListingMetadata | null
    /** Activities only — replaces the full event schedule (dates + slots). */
    event_schedule?: ServiceEventScheduleEntry[] | null
  },
) {
  try {
    const { supabase, user } = await getActionAuth()
    if (!user) return { error: 'Not authenticated' }

    const { data: existing, error: fetchError } = await supabase
      .from('service_listings')
      .select('id, host_id, title, status, type')
      .eq('id', listingId)
      .single()

    if (fetchError || !existing) return { error: 'Listing not found' }

    const access = await userCanEditServiceListing(supabase, listingId, user.id)
    if (!access?.allowed) return { error: 'Unauthorized' }

    const update: Record<string, unknown> = {}
    if (patch.title !== undefined) update.title = patch.title.trim()
    if (patch.description !== undefined) update.description = patch.description
    if (patch.short_description !== undefined) update.short_description = patch.short_description
    if (patch.unit !== undefined) update.unit = patch.unit
    if (patch.location !== undefined) update.location = patch.location
    if (patch.latitude !== undefined) update.latitude = patch.latitude
    if (patch.longitude !== undefined) update.longitude = patch.longitude
    if (patch.amenities !== undefined) update.amenities = patch.amenities.length > 0 ? patch.amenities : null
    if (patch.tags !== undefined) update.tags = patch.tags.length > 0 ? patch.tags : null
    if (patch.metadata !== undefined) update.metadata = patch.metadata
    if (patch.event_schedule !== undefined && existing.type === 'activities') {
      update.event_schedule = sanitizeEventSchedule(patch.event_schedule)
    }

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

    update.updated_at = new Date().toISOString()

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
    const { supabase, user } = await getActionAuth()
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

    if (updateError) {
      console.error('toggleHostServiceListingActive:', updateError)
      const detail = updateError.message || updateError.code || 'unknown'
      return { error: `Failed to update listing: ${detail}` }
    }
    return { success: true, isActive: !listing.is_active }
  } catch (error) {
    console.error('toggleHostServiceListingActive:', error)
    return { error: 'An unexpected error occurred' }
  }
}
