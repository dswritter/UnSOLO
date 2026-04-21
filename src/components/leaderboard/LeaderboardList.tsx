'use client'

import { useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Trophy, Star, MapPin, Search, Calendar } from 'lucide-react'
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

type MonthlyEntry = LeaderEntry & { monthly_trips: number }

interface LeaderboardListProps {
  entries: LeaderEntry[]
  currentUserId?: string
  myRank?: number | null
  myEntry?: LeaderEntry | null
  monthlyEntries?: MonthlyEntry[]
}

function EntryRow({ entry, rank, isMe, score, scoreLabel = 'pts' }: { entry: LeaderEntry; rank: number; isMe: boolean; score: number | string; scoreLabel?: string }) {
  const name = entry.profile?.full_name || entry.profile?.username || 'Traveler'
  return (
    <Link href={`/profile/${entry.profile?.username}`}>
      <div
        className={`flex items-center gap-4 p-4 rounded-xl border transition-colors cursor-pointer ${
          isMe
            ? 'bg-primary/10 border-primary/30'
            : 'bg-card border-border hover:border-primary/20'
        }`}
      >
        <div className="w-10 text-center flex-shrink-0">
          <LeaderboardRankBadge rank={rank} />
        </div>
        <Avatar className="h-10 w-10 flex-shrink-0">
          <AvatarImage src={entry.profile?.avatar_url || ''} />
          <AvatarFallback className="bg-primary/20 text-primary text-sm font-bold">
            {getInitials(name)}
          </AvatarFallback>
        </Avatar>
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
        <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {entry.destinations_count}</span>
          <span className="flex items-center gap-1"><Trophy className="h-3 w-3" /> {entry.trips_completed}</span>
          <span className="flex items-center gap-1"><Star className="h-3 w-3" /> {entry.reviews_written}</span>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-primary font-black text-lg">{score}</div>
          <div className="text-xs text-muted-foreground">{scoreLabel}</div>
        </div>
      </div>
    </Link>
  )
}

export function LeaderboardList({ entries, currentUserId, myRank, myEntry, monthlyEntries = [] }: LeaderboardListProps) {
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'alltime' | 'monthly'>('alltime')

  const isMonthly = view === 'monthly'
  const displayEntries = isMonthly ? monthlyEntries : entries

  const filtered = search.trim()
    ? displayEntries.filter(e => {
        const q = search.toLowerCase()
        return (
          (e.profile?.full_name || '').toLowerCase().includes(q) ||
          (e.profile?.username || '').toLowerCase().includes(q) ||
          (e.profile?.location || '').toLowerCase().includes(q)
        )
      })
    : displayEntries

  return (
    <>
      {/* Filters row */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setView('alltime')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
            view === 'alltime' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:border-foreground/30'
          }`}
        >
          <Trophy className="h-3 w-3" /> All Time
        </button>
        <button
          onClick={() => setView('monthly')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
            view === 'monthly' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:border-foreground/30'
          }`}
        >
          <Calendar className="h-3 w-3" /> This Month
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
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
            {search ? `No travelers matching "${search}"` : isMonthly ? 'No trips completed this month yet.' : 'No scores yet. Be the first to complete a trip!'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {isMonthly
            ? (filtered as MonthlyEntry[]).map((entry, i) => (
                <EntryRow
                  key={entry.user_id}
                  entry={entry}
                  rank={i + 1}
                  isMe={currentUserId === entry.user_id}
                  score={entry.monthly_trips}
                  scoreLabel="trips"
                />
              ))
            : filtered.map((entry) => {
                const originalRank = entries.indexOf(entry) + 1
                return (
                  <EntryRow
                    key={entry.user_id}
                    entry={entry}
                    rank={originalRank}
                    isMe={currentUserId === entry.user_id}
                    score={entry.total_score}
                  />
                )
              })}
        </div>
      )}

      {/* Pinned rank at bottom — only for users outside top 100 in all-time view */}
      {!isMonthly && myRank != null && myEntry && (
        <div className="mt-6 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground mb-2">Your all-time rank</p>
          <EntryRow
            entry={myEntry}
            rank={myRank}
            isMe={true}
            score={myEntry.total_score}
          />
        </div>
      )}
    </>
  )
}
