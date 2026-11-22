import type { SupabaseClient } from '@supabase/supabase-js'
import { todayIST } from '@/lib/tribe/models'
import { addDays, isTripDay, tripEndDate } from './tripDays'

type Row = Record<string, unknown>

export type CurrentTrip = { bookingId: string; packageId: string; title: string; slug: string; start: string; end: string; hostId: string | null }

/** Your bookings that are on today (start day through the day after it ends), newest first. */
export async function currentTrips(db: SupabaseClient, userId: string): Promise<CurrentTrip[]> {
  const today = todayIST()
  const { data } = await db.from('bookings').select('id, package_id, travel_date, status, package:packages(title, slug, duration_days, host_id)')
    .eq('user_id', userId).in('status', ['confirmed', 'completed', 'pending']).not('package_id', 'is', null)
    .gte('travel_date', addDays(today, -40)).lte('travel_date', today).order('travel_date', { ascending: false }).limit(10)
  return ((data ?? []) as Row[]).flatMap((b) => {
    const p = (b.package ?? {}) as Row
    const start = String(b.travel_date ?? '')
    const days = Number(p.duration_days ?? 1)
    if (!isTripDay(start, days, today)) return []
    return [{ bookingId: String(b.id), packageId: String(b.package_id), title: String(p.title ?? 'your trip'), slug: String(p.slug ?? ''), start, end: tripEndDate(start, days), hostId: (p.host_id as string | null) ?? null }]
  })
}
