import type { SupabaseClient } from '@supabase/supabase-js'
import { getLeaderboardRank } from '@/lib/leaderboard-rank'

export type LeaderboardEntryRow = {
  user_id: string
  trips_completed: number
  reviews_written: number
  destinations_count: number
  total_score: number
  profile: {
    username: string
    full_name: string | null
    avatar_url: string | null
    location: string | null
  } | null
}

export type MonthlyLeaderboardEntry = LeaderboardEntryRow & { monthly_trips: number }

export async function getLeaderboardSnapshot(supabase: SupabaseClient, userId: string | null) {
  const { data: leaderboard } = await supabase
    .from('leaderboard_scores')
    .select('*, profile:profiles(username, full_name, avatar_url, location)')
    .order('total_score', { ascending: false })
    .order('user_id', { ascending: true })
    .limit(100)

  const entries = (leaderboard || []) as LeaderboardEntryRow[]

  let myRank: number | null = null
  let myEntry: LeaderboardEntryRow | null = userId ? (entries.find(e => e.user_id === userId) ?? null) : null
  if (userId) {
    myRank = await getLeaderboardRank(supabase, userId)
    const inTop100 = entries.some(e => e.user_id === userId)
    if (!inTop100) {
      const { data: myScore } = await supabase
        .from('leaderboard_scores')
        .select('*, profile:profiles(username, full_name, avatar_url, location)')
        .eq('user_id', userId)
        .single()
      if (myScore) myEntry = myScore as LeaderboardEntryRow
    }
  }

  const inTop100 = userId ? entries.some(e => e.user_id === userId) : false
  const inTop50 = userId ? entries.slice(0, 50).some(e => e.user_id === userId) : false

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
    monthlyTripCount[(b as { user_id: string }).user_id] =
      (monthlyTripCount[(b as { user_id: string }).user_id] || 0) + 1
  }
  const monthlyEntries: MonthlyLeaderboardEntry[] = entries
    .filter(e => monthlyTripCount[e.user_id])
    .map(e => ({ ...e, monthly_trips: monthlyTripCount[e.user_id]! }))
    .sort((a, b) => b.monthly_trips - a.monthly_trips)
    .slice(0, 20)

  return { entries, myRank, myEntry, monthlyEntries, inTop100, inTop50, userId }
}
