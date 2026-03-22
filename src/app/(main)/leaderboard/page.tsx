import { createClient } from '@/lib/supabase/server'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Trophy, Medal, Star, MapPin, Users, MessageCircle } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import Link from 'next/link'

type LeaderEntry = {
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

export default async function LeaderboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: leaderboard } = await supabase
    .from('leaderboard_scores')
    .select('*, profile:profiles(username, full_name, avatar_url, location)')
    .order('total_score', { ascending: false })
    .limit(100)

  const entries = (leaderboard || []) as LeaderEntry[]

  let myRank = -1
  if (user) {
    myRank = entries.findIndex((e) => e.user_id === user.id) + 1
  }

  return (
    <div className="min-h-screen bg-black">
      <div className="mx-auto max-w-4xl px-4 py-10">
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
            <MapPin className="h-4 w-4 text-primary mx-auto mb-1" />
            <div className="font-bold">+15 pts</div>
            <div className="text-xs text-muted-foreground">New Destination</div>
          </div>
          <div className="text-center text-sm">
            <Trophy className="h-4 w-4 text-primary mx-auto mb-1" />
            <div className="font-bold">+10 pts</div>
            <div className="text-xs text-muted-foreground">Completed Trip</div>
          </div>
          <div className="text-center text-sm">
            <Star className="h-4 w-4 text-primary mx-auto mb-1" />
            <div className="font-bold">+5 pts</div>
            <div className="text-xs text-muted-foreground">Review Written</div>
          </div>
        </div>

        {/* My rank (if logged in and not in top 100) */}
        {user && myRank > 0 && myRank > 10 && (
          <div className="mb-6 p-4 rounded-xl border border-primary/30 bg-primary/5">
            <p className="text-sm text-muted-foreground">Your Rank</p>
            <p className="text-2xl font-black text-primary">#{myRank}</p>
          </div>
        )}

        {/* Leaderboard */}
        {entries.length === 0 ? (
          <div className="text-center py-16">
            <Trophy className="h-16 w-16 text-primary/20 mx-auto mb-4" />
            <p className="text-muted-foreground">No scores yet. Be the first to complete a trip!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((entry, index) => {
              const rank = index + 1
              const name = entry.profile?.full_name || entry.profile?.username || 'Traveler'
              const isMe = user && entry.user_id === user.id

              return (
                <Link
                  key={entry.user_id}
                  href={`/profile/${entry.profile?.username}`}
                >
                  <div
                    className={`flex items-center gap-4 p-4 rounded-xl border transition-colors cursor-pointer ${
                      isMe
                        ? 'bg-primary/10 border-primary/30'
                        : 'bg-card border-border hover:border-primary/20'
                    }`}
                  >
                    {/* Rank */}
                    <div className="w-10 text-center flex-shrink-0">
                      {rank === 1 ? (
                        <span className="text-2xl">🥇</span>
                      ) : rank === 2 ? (
                        <span className="text-2xl">🥈</span>
                      ) : rank === 3 ? (
                        <span className="text-2xl">🥉</span>
                      ) : (
                        <span className="text-sm font-bold text-muted-foreground">#{rank}</span>
                      )}
                    </div>

                    {/* Avatar */}
                    <Avatar className="h-10 w-10 flex-shrink-0">
                      <AvatarImage src={entry.profile?.avatar_url || ''} />
                      <AvatarFallback className="bg-primary/20 text-primary text-sm font-bold">
                        {getInitials(name)}
                      </AvatarFallback>
                    </Avatar>

                    {/* Name */}
                    <div className="flex-1 min-w-0">
                      <div className="font-bold truncate flex items-center gap-2">
                        {name}
                        {isMe && <Badge className="text-xs bg-primary/20 text-primary border-primary/30">You</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        @{entry.profile?.username}
                        {entry.profile?.location && ` · ${entry.profile.location}`}
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {entry.destinations_count}
                      </span>
                      <span className="flex items-center gap-1">
                        <Trophy className="h-3 w-3" /> {entry.trips_completed}
                      </span>
                      <span className="flex items-center gap-1">
                        <Star className="h-3 w-3" /> {entry.reviews_written}
                      </span>
                    </div>

                    {/* Score */}
                    <div className="text-right flex-shrink-0">
                      <div className="text-primary font-black text-lg">{entry.total_score}</div>
                      <div className="text-xs text-muted-foreground">pts</div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
