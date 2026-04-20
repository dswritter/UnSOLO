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

export async function createHostServiceListing(input: {
  title: string
  description: string | null
  short_description: string | null
  type: ServiceListingType
  price_paise: number
  unit: 'per_night' | 'per_person' | 'per_day' | 'per_hour' | 'per_week' | 'per_month'
  destination_ids: string[]
  location: string | null
  max_guests_per_booking?: number | null
  quantity_available?: number | null
  amenities: string[]
  tags: string[]
  metadata: ServiceListingMetadata | null
  host_id: string
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
        price_paise: input.price_paise,
        unit: input.unit,
        destination_id: primaryDestinationId,
        destination_ids: destinationIds,
        location: input.location,
        latitude: null,
        longitude: null,
        max_guests_per_booking: input.max_guests_per_booking || 1,
        quantity_available: input.quantity_available,
        amenities: input.amenities.length > 0 ? input.amenities : null,
        tags: input.tags.length > 0 ? input.tags : null,
        images: null, // Can be added later
        metadata: input.metadata,
        host_id: input.host_id,
        is_active: true,
        is_featured: false,
        status: 'pending', // Hosts' listings need admin approval
      })
      .select('id, slug')
      .single()

    if (insertError) {
      console.error('Database error:', insertError)
      return { error: 'Failed to create listing' }
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
