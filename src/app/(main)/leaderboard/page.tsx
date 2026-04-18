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
  if (user) {
    myRank = await getLeaderboardRank(supabase, user.id)
  }

  const inTop100 = user ? entries.some((e) => e.user_id === user.id) : false

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

        {/* Your global rank when you are outside the top-100 list */}
        {user && myRank != null && !inTop100 && (
          <div className="mb-4 px-4 py-2 rounded-lg border border-primary/30 bg-primary/5 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Your rank (global):</span>
              <span className="text-lg font-black text-primary">#{myRank}</span>
            </div>
            <span className="text-[10px] text-muted-foreground">Only the top 100 are listed below.</span>
          </div>
        )}

        {/* Searchable leaderboard list */}
        <LeaderboardList entries={entries} currentUserId={user?.id} />
      </div>
    </div>
  )
}
