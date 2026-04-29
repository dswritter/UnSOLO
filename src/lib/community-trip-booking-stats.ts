import type { SupabaseClient } from '@supabase/supabase-js'

/** Non-cancelled trip (package) bookings — community + standard packages with package_id. */
export async function fetchCommunityTripBookingCountsForPackages(
  supabase: SupabaseClient,
  packageIds: string[],
): Promise<Record<string, number>> {
  if (packageIds.length === 0) return {}

  const { data, error } = await supabase
    .from('bookings')
    .select('package_id')
    .eq('booking_type', 'trip')
    .in('package_id', packageIds)
    .neq('status', 'cancelled')

  if (error || !data) return {}

  const counts: Record<string, number> = {}
  for (const row of data) {
    const pid = row.package_id as string | null
    if (!pid) continue
    counts[pid] = (counts[pid] || 0) + 1
  }
  return counts
}
