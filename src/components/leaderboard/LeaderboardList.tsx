'use client'

import { useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Trophy, Star, MapPin, Search } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import Link from 'next/link'
import { LeaderboardRankBadge } from '@/components/leaderboard/RankDisplay'

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

interface LeaderboardListProps {
  entries: LeaderEntry[]
  currentUserId?: string
}

export function LeaderboardList({ entries, currentUserId }: LeaderboardListProps) {
  const [search, setSearch] = useState('')

  const filtered = search.trim()
    ? entries.filter(e => {
        const q = search.toLowerCase()
        return (
          (e.profile?.full_name || '').toLowerCase().includes(q) ||
          (e.profile?.username || '').toLowerCase().includes(q) ||
          (e.profile?.location || '').toLowerCase().includes(q)
        )
      })
    : entries

  return (
    <>
      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search by name or username..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 text-sm bg-card border border-border rounded-xl focus:outline-none focus:border-primary transition-colors"
        />
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <Trophy className="h-12 w-12 text-primary/20 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">
            {search ? `No travelers matching "${search}"` : 'No scores yet. Be the first to complete a trip!'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((entry) => {
            // Use original rank (position in full list), not filtered position
            const originalRank = entries.indexOf(entry) + 1
            const name = entry.profile?.full_name || entry.profile?.username || 'Traveler'
            const isMe = currentUserId === entry.user_id

            return (
              <Link key={entry.user_id} href={`/profile/${entry.profile?.username}`}>
                <div
                  className={`flex items-center gap-4 p-4 rounded-xl border transition-colors cursor-pointer ${
                    isMe
                      ? 'bg-primary/10 border-primary/30'
                      : 'bg-card border-border hover:border-primary/20'
                  }`}
                >
                  {/* Rank */}
                  <div className="w-10 text-center flex-shrink-0">
                    <LeaderboardRankBadge rank={originalRank} />
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
    </>
  )
}
