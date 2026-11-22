import { getApiContext } from '@/lib/api/context'
import { ok, route } from '@/lib/api/http'
import { getLeaderboardRank } from '@/lib/leaderboard-rank'
import { getCachedLeaderboardBoard } from '@/lib/leaderboard/leaderboardBoard'
import type { LeaderboardEntryRow } from '@/lib/leaderboard/leaderboardSnapshot'

type Entry = LeaderboardEntryRow & { monthly_trips?: number }

const shape = (e: Entry, rank: number | null) => ({
  rank,
  user: { id: e.user_id, username: e.profile?.username ?? '', name: e.profile?.full_name || e.profile?.username || 'Traveller', avatarUrl: e.profile?.avatar_url ?? null, isPhoneVerified: false, isIdVerified: false, isHost: false },
  location: e.profile?.location ?? null,
  points: e.total_score, trips: e.trips_completed, reviews: e.reviews_written, states: e.destinations_count,
  monthlyTrips: e.monthly_trips ?? null,
})

/**
 * GET /leaderboard: the all-time top 100, this month's top 20, and your standing. Same board and
 * order as the web; rank = position on the board (ties ordered as the web orders them), so your
 * "You're #N" always matches your row.
 */
export const GET = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const { entries, monthlyEntries } = await getCachedLeaderboardBoard()
  const all = entries.map((e, i) => shape(e, i + 1))
  let me = null
  if (ctx.user) {
    const mine = all.find((e) => e.user.id === ctx.user!.id)
    // Off the top 100: 1 + people with more points.
    me = { rank: mine?.rank ?? await getLeaderboardRank(ctx.db, ctx.user.id), entry: mine ?? null }
  }
  return ok({ entries: all, monthly: monthlyEntries.map((e, i) => shape(e, i + 1)), me }, { cache: ctx.user ? 'private' : 'public', req })
})
