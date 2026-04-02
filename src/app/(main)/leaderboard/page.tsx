export const revalidate = 600 // 10 minutes

import { createClient } from '@/lib/supabase/server'
import { Trophy, Star, MapPin } from 'lucide-react'
import { LeaderboardList } from '@/components/leaderboard/LeaderboardList'

export default async function LeaderboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: leaderboard } = await supabase
    .from('leaderboard_scores')
    .select('*, profile:profiles(username, full_name, avatar_url, location)')
    .order('total_score', { ascending: false })
    .limit(100)

  const entries = (leaderboard || []) as {
    user_id: string
    trips_completed: number
    reviews_written: number
    destinations_count: number
    total_score: number
    profile: { username: string; full_name: string | null; avatar_url: string | null; location: string | null } | null
  }[]

  let myRank = -1
  if (user) {
    myRank = entries.findIndex((e) => e.user_id === user.id) + 1
  }

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
              <p className="text-xs text-muted-foreground">Top solo travelers in India</p>
            </div>
          </div>
          {/* Inline score guide */}
          <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Trophy className="h-3 w-3 text-primary" /> +25 Trip</span>
            <span className="flex items-center gap-1"><MapPin className="h-3 w-3 text-primary" /> +15 Dest</span>
            <span className="flex items-center gap-1"><Star className="h-3 w-3 text-primary" /> +10 Review</span>
          </div>
        </div>

        {/* My rank — compact */}
        {user && myRank > 0 && myRank > 10 && (
          <div className="mb-4 px-4 py-2 rounded-lg border border-primary/30 bg-primary/5 flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Your Rank:</span>
            <span className="text-lg font-black text-primary">#{myRank}</span>
          </div>
        )}

        {/* Searchable leaderboard list */}
        <LeaderboardList entries={entries} currentUserId={user?.id} />
      </div>
    </div>
  )
}
