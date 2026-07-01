import { unstable_cache } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/server'
import type { LeaderboardEntryRow, MonthlyLeaderboardEntry } from './leaderboardSnapshot'

/**
 * The shared, user-independent leaderboard board: the all-time top 100 and the
 * monthly top 20 (both derived from the same public top-100 rows). Computed with
 * a cookieless service-role client so the monthly trip counts are correct/global
 * — the previous per-viewer client saw only its own bookings (RLS), which made
 * the monthly list effectively empty for normal users. No new users are exposed:
 * monthly is still restricted to people already on the public top-100 board.
 *
 * Cached (revalidate 600) so the page can be statically served to everyone; the
 * viewer's own rank is layered on client-side via getMyLeaderboardStanding.
 */
async function computeLeaderboardBoard(): Promise<{
  entries: LeaderboardEntryRow[]
  monthlyEntries: MonthlyLeaderboardEntry[]
}> {
  const supabase = createServiceRoleClient()

  const { data: leaderboard } = await supabase
    .from('leaderboard_scores')
    .select('*, profile:profiles(username, full_name, avatar_url, location)')
    .order('total_score', { ascending: false })
    .order('user_id', { ascending: true })
    .limit(100)

  const entries = (leaderboard || []) as LeaderboardEntryRow[]

  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const { data: monthlyBookings } = await supabase
    .from('bookings')
    .select('user_id')
    .in('status', ['confirmed', 'completed'])
    .gte('created_at', monthStart.toISOString())

  const monthlyTripCount: Record<string, number> = {}
  for (const b of monthlyBookings || []) {
    const uid = (b as { user_id: string }).user_id
    monthlyTripCount[uid] = (monthlyTripCount[uid] || 0) + 1
  }
  const monthlyEntries: MonthlyLeaderboardEntry[] = entries
    .filter(e => monthlyTripCount[e.user_id])
    .map(e => ({ ...e, monthly_trips: monthlyTripCount[e.user_id]! }))
    .sort((a, b) => b.monthly_trips - a.monthly_trips)
    .slice(0, 20)

  return { entries, monthlyEntries }
}

export const getCachedLeaderboardBoard = unstable_cache(
  computeLeaderboardBoard,
  ['leaderboard-board'],
  { revalidate: 600 },
)
