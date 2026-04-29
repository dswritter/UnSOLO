import type { SupabaseClient } from '@supabase/supabase-js'

/** Non-cancelled service bookings only (meaningful “booking” count for hosts/admins). */
export async function fetchServiceBookingCountsForListings(
  supabase: SupabaseClient,
  listingIds: string[],
): Promise<{ byListingId: Record<string, number>; byItemId: Record<string, number> }> {
  const empty = {
    byListingId: {} as Record<string, number>,
    byItemId: {} as Record<string, number>,
  }
  if (listingIds.length === 0) return empty

  const { data, error } = await supabase
    .from('bookings')
    .select('service_listing_id, service_listing_item_id')
    .eq('booking_type', 'service')
    .in('service_listing_id', listingIds)
    .neq('status', 'cancelled')

  if (error || !data) return empty

  const byListingId: Record<string, number> = {}
  const byItemId: Record<string, number> = {}

  for (const row of data) {
    const lid = row.service_listing_id as string | null
    if (!lid) continue
    byListingId[lid] = (byListingId[lid] || 0) + 1
    const iid = row.service_listing_item_id as string | null
    if (iid) byItemId[iid] = (byItemId[iid] || 0) + 1
  }

  return { byListingId, byItemId }
}
