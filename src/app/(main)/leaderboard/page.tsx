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
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-10">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center mx-auto mb-4">
            <Trophy className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl md:text-4xl font-black">
            Travel <span className="text-primary">Leaderboard</span>
          </h1>
          <p className="text-muted-foreground mt-2">The most adventurous solo travelers in India</p>
        </div>

        {/* Score guide */}
        <div className="grid grid-cols-3 gap-4 mb-8 p-4 bg-card border border-border rounded-xl">
          <div className="text-center text-sm">
            <Trophy className="h-4 w-4 text-primary mx-auto mb-1" />
            <div className="font-bold">+25 pts</div>
            <div className="text-xs text-muted-foreground">Completed Trip</div>
          </div>
          <div className="text-center text-sm">
            <MapPin className="h-4 w-4 text-primary mx-auto mb-1" />
            <div className="font-bold">+15 pts</div>
            <div className="text-xs text-muted-foreground">New Destination</div>
          </div>
          <div className="text-center text-sm">
            <Star className="h-4 w-4 text-primary mx-auto mb-1" />
            <div className="font-bold">+10 pts</div>
            <div className="text-xs text-muted-foreground">Review Written</div>
          </div>
        </div>

        {/* My rank */}
        {user && myRank > 0 && myRank > 10 && (
          <div className="mb-6 p-4 rounded-xl border border-primary/30 bg-primary/5">
            <p className="text-sm text-muted-foreground">Your Rank</p>
            <p className="text-2xl font-black text-primary">#{myRank}</p>
          </div>
        )}

        {/* Searchable leaderboard list */}
        <LeaderboardList entries={entries} currentUserId={user?.id} />
      </div>
    </div>
  )
}
