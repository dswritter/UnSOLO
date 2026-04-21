export const revalidate = 600 // 10 minutes

import { createClient } from '@/lib/supabase/server'
import { getLeaderboardRank } from '@/lib/leaderboard-rank'
import { Trophy } from 'lucide-react'
import { LeaderboardList } from '@/components/leaderboard/LeaderboardList'

export default async function LeaderboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Top 100 only (stable tie-break for display order)
  const { data: leaderboard } = await supabase
    .from('leaderboard_scores')
    .select('*, profile:profiles(username, full_name, avatar_url, location)')
    .order('total_score', { ascending: false })
    .order('user_id', { ascending: true })
    .limit(100)

  const entries = (leaderboard || []) as {
    user_id: string
    trips_completed: number
    reviews_written: number
    destinations_count: number
    total_score: number
    profile: { username: string; full_name: string | null; avatar_url: string | null; location: string | null } | null
  }[]

  let myRank: number | null = null
  let myEntry: (typeof entries)[0] | null = null
  if (user) {
    myRank = await getLeaderboardRank(supabase, user.id)
    const inTop100 = entries.some((e) => e.user_id === user.id)
    if (!inTop100) {
      // Fetch the user's own score entry to show pinned at bottom
      const { data: myScore } = await supabase
        .from('leaderboard_scores')
        .select('*, profile:profiles(username, full_name, avatar_url, location)')
        .eq('user_id', user.id)
        .single()
      if (myScore) myEntry = myScore as (typeof entries)[0]
    }
  }

  const inTop100 = user ? entries.some((e) => e.user_id === user.id) : false

  // Monthly leaderboard: count trips completed this month per user
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
    monthlyTripCount[b.user_id] = (monthlyTripCount[b.user_id] || 0) + 1
  }
  const monthlyEntries = entries
    .filter(e => monthlyTripCount[e.user_id])
    .map(e => ({ ...e, monthly_trips: monthlyTripCount[e.user_id] }))
    .sort((a, b) => b.monthly_trips - a.monthly_trips)
    .slice(0, 20)

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-6">
        {/* Compact header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center">
              <Trophy className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-black leading-tight">
                Travel <span className="text-primary">Leaderboard</span>
              </h1>
              <p className="text-xs text-muted-foreground">Top 100 solo travelers in India</p>
            </div>
          </div>
          {/* Scoring guide — tooltip style */}
          <div className="hidden sm:flex items-center gap-1 text-[10px] text-muted-foreground/60 bg-secondary/50 px-2.5 py-1 rounded-full">
            <span>Earn:</span>
            <span className="font-medium">25pts/trip</span>
            <span>·</span>
            <span className="font-medium">15pts/dest</span>
            <span>·</span>
            <span className="font-medium">10pts/review</span>
          </div>
        </div>

        {/* Searchable leaderboard list */}
        <LeaderboardList
          entries={entries}
          currentUserId={user?.id}
          myRank={!inTop100 ? myRank : null}
          myEntry={myEntry}
          monthlyEntries={monthlyEntries}
        />
      </div>
    </div>
  )
}
