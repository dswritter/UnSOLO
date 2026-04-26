export const revalidate = 600 // 10 minutes

import { createClient } from '@/lib/supabase/server'
import { getLeaderboardSnapshot } from '@/lib/leaderboard/leaderboardSnapshot'
import { Trophy } from 'lucide-react'
import { LeaderboardList } from '@/components/leaderboard/LeaderboardList'

export default async function LeaderboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { entries, myRank, myEntry, monthlyEntries, inTop100 } = await getLeaderboardSnapshot(
    supabase,
    user?.id ?? null,
  )

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
