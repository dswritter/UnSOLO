'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { getActionAuth } from '@/lib/auth/action-auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { SERVICE_LISTINGS_TAG } from '@/lib/cache-tags'
import { listingScheduleTodayISO } from '@/lib/utils'
import { countActiveBookings, tripIsRunning } from '@/lib/host-listing-delete'

type DeleteResult = { success: true; archived: boolean } | { error: string }

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Hosts delete their own trip unless it's running or has upcoming bookings; booking history means archive, not delete. */
export async function deleteMyHostedTrip(tripId: string): Promise<DeleteResult> {
  const { user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }
  const svc = createServiceRoleClient()
  const { data: trip } = await svc
    .from('packages')
    .select('id, host_id, slug, title, departure_dates, return_dates, duration_days')
    .eq('id', tripId)
    .maybeSingle()
  if (!trip || trip.host_id !== user.id) return { error: 'Trip not found' }

  const today = listingScheduleTodayISO()
  if (tripIsRunning(trip, today)) return { error: 'This trip is running right now. You can delete it after it ends.' }

  const { data: bookings } = await svc
    .from('bookings')
    .select('status, travel_date')
    .eq('package_id', tripId)
  const active = countActiveBookings(bookings ?? [], today, trip.duration_days)
  if (active > 0) return { error: `This trip has ${plural(active, 'upcoming booking')}. Cancel them before deleting.` }

  const archive = async (): Promise<DeleteResult> => {
    const { error } = await svc.from('packages').update({
      archived_at: new Date().toISOString(),
      is_active: false,
      slug: `${trip.slug || 'trip'}-archived-${Date.now().toString(36)}`,
    }).eq('id', tripId)
    return error ? { error: error.message } : { success: true, archived: true }
  }

  let result: DeleteResult
  if ((bookings ?? []).length > 0) {
    result = await archive()
  } else {
    const { error } = await svc.from('packages').delete().eq('id', tripId)
    result = !error ? { success: true, archived: false } : error.code === '23503' ? await archive() : { error: error.message }
  }
  if ('success' in result) {
    revalidatePath('/host')
    revalidatePath('/')
  }
  return result
}

export async function deleteMyServiceListing(listingId: string): Promise<DeleteResult> {
  const { user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }
  const svc = createServiceRoleClient()
  const { data: listing } = await svc
    .from('service_listings')
    .select('id, host_id, slug')
    .eq('id', listingId)
    .maybeSingle()
  if (!listing || listing.host_id !== user.id) return { error: 'Listing not found' }

  const today = listingScheduleTodayISO()
  const { data: bookings } = await svc
    .from('bookings')
    .select('status, travel_date, check_in_date, check_out_date')
    .eq('service_listing_id', listingId)
  const active = countActiveBookings(bookings ?? [], today)
  if (active > 0) return { error: `This listing has ${plural(active, 'current or upcoming booking')}. Cancel them before deleting.` }

  const archive = async (): Promise<DeleteResult> => {
    const { error } = await svc.from('service_listings').update({
      archived_at: new Date().toISOString(),
      is_active: false,
      status: 'archived',
      slug: `${listing.slug || 'listing'}-archived-${Date.now().toString(36)}`,
    }).eq('id', listingId)
    return error ? { error: error.message } : { success: true, archived: true }
  }

  let result: DeleteResult
  if ((bookings ?? []).length > 0) {
    result = await archive()
  } else {
    const { error } = await svc.from('service_listings').delete().eq('id', listingId)
    result = !error ? { success: true, archived: false } : error.code === '23503' ? await archive() : { error: error.message }
  }
  if ('success' in result) {
    revalidatePath('/host')
    revalidatePath('/')
    revalidateTag(SERVICE_LISTINGS_TAG, 'max')
  }
  return result
}
