import type { createServiceRoleClient } from '@/lib/supabase/server'

type Svc = ReturnType<typeof createServiceRoleClient>

type CompletedTripRow = { id: string; package: { destination_id?: string | null } | null }

/**
 * Completed trips a user travelled on: bookings they made themselves plus
 * bookings where an approved companion claim links them as a co-traveller.
 */
export async function completedTripsForUser(svc: Svc, userId: string): Promise<CompletedTripRow[]> {
  const [ownRes, claimsRes] = await Promise.all([
    svc
      .from('bookings')
      .select('id, package:packages(destination_id)')
      .eq('user_id', userId)
      .eq('status', 'completed'),
    svc.from('trip_traveller_claims').select('booking_id').eq('claimant_id', userId).eq('status', 'approved'),
  ])

  const rows = new Map<string, CompletedTripRow>()
  for (const b of (ownRes.data ?? []) as unknown as CompletedTripRow[]) rows.set(b.id, b)

  const claimedIds = (claimsRes.data ?? []).map((c) => c.booking_id as string).filter((id) => !rows.has(id))
  if (claimedIds.length) {
    const { data } = await svc
      .from('bookings')
      .select('id, package:packages(destination_id)')
      .in('id', claimedIds)
      .eq('status', 'completed')
    for (const b of (data ?? []) as unknown as CompletedTripRow[]) rows.set(b.id, b)
  }
  return [...rows.values()]
}

/**
 * Recompute leaderboard trip inputs (total_score is generated) and award
 * trip-count achievements. Idempotent — safe to call from the completion cron,
 * on claim approval, or in a backfill.
 */
export async function refreshTravelStatsForUser(svc: Svc, userId: string) {
  const trips = await completedTripsForUser(svc, userId)
  const destinationIds = new Set(trips.map((t) => t.package?.destination_id).filter(Boolean))

  const { count: reviewCount } = await svc
    .from('reviews')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)

  await svc.from('leaderboard_scores').upsert(
    {
      user_id: userId,
      trips_completed: trips.length,
      destinations_count: destinationIds.size,
      reviews_written: reviewCount || 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )

  if (trips.length > 0) {
    await svc
      .from('user_achievements')
      .upsert({ user_id: userId, achievement_key: 'first_trip' }, { onConflict: 'user_id,achievement_key' })
  }

  return { tripsCompleted: trips.length, destinationsCount: destinationIds.size }
}

/** Refresh the booker and every approved companion on a booking. */
export async function refreshTravelStatsForBooking(svc: Svc, bookingId: string, bookerId: string) {
  const { data: claims } = await svc
    .from('trip_traveller_claims')
    .select('claimant_id')
    .eq('booking_id', bookingId)
    .eq('status', 'approved')
  const userIds = new Set<string>([bookerId, ...(claims ?? []).map((c) => c.claimant_id as string)])
  for (const id of userIds) await refreshTravelStatsForUser(svc, id)
}
