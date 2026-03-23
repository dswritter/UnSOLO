'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { MapPin, Trophy, Star, Mountain, Award, Flame, Globe, Compass, Shield } from 'lucide-react'

// All Indian states
const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Delhi', 'Jammu & Kashmir', 'Ladakh', 'Puducherry',
  'Chandigarh', 'Andaman & Nicobar', 'Lakshadweep',
]

// Badge tiers
const BADGE_TIERS = [
  { name: 'Newcomer', minScore: 0, icon: Compass, color: 'text-zinc-400' },
  { name: 'Explorer', minScore: 50, icon: MapPin, color: 'text-green-400' },
  { name: 'Adventurer', minScore: 150, icon: Mountain, color: 'text-blue-400' },
  { name: 'Voyager', minScore: 300, icon: Globe, color: 'text-purple-400' },
  { name: 'Trailblazer', minScore: 500, icon: Flame, color: 'text-orange-400' },
  { name: 'Legend', minScore: 1000, icon: Shield, color: 'text-primary' },
]

// Achievement definitions
const ACHIEVEMENTS = [
  { key: 'first_trip', name: 'First Steps', description: 'Completed your first trip', icon: '🎒' },
  { key: 'trailblazer', name: 'Trailblazer', description: 'Booked a challenging trip', icon: '🏔️' },
  { key: '5_trips', name: 'Frequent Traveler', description: 'Completed 5 trips', icon: '✈️' },
  { key: '10_states', name: 'State Hopper', description: 'Visited 10 different states', icon: '🗺️' },
  { key: '5_reviews', name: 'Storyteller', description: 'Wrote 5 reviews', icon: '📝' },
  { key: 'referral_king', name: 'Referral King', description: 'Referred 5 friends', icon: '👑' },
]

interface TravelStatsProps {
  userId: string
  isOwnProfile: boolean
}

export function TravelStats({ userId, isOwnProfile }: TravelStatsProps) {
  const [stats, setStats] = useState<{
    score: number
    tripsCompleted: number
    reviewsWritten: number
    destinationsCount: number
    visitedStates: string[]
    destinations: { name: string; state: string; count: number }[]
    achievements: string[]
  } | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()

      // Get leaderboard score
      const { data: scores } = await supabase
        .from('leaderboard_scores')
        .select('*')
        .eq('user_id', userId)
        .single()

      // Get visited destinations with states
      const { data: bookings } = await supabase
        .from('bookings')
        .select('package:packages(destination:destinations(name, state))')
        .eq('user_id', userId)
        .in('status', ['confirmed', 'completed'])

      const destMap = new Map<string, { name: string; state: string; count: number }>()
      const stateSet = new Set<string>()

      for (const b of bookings || []) {
        const dest = (b.package as unknown as { destination: { name: string; state: string } })?.destination
        if (dest) {
          stateSet.add(dest.state)
          const key = `${dest.name}-${dest.state}`
          const existing = destMap.get(key)
          if (existing) {
            existing.count++
          } else {
            destMap.set(key, { name: dest.name, state: dest.state, count: 1 })
          }
        }
      }

      // Get achievements
      const { data: achievementData } = await supabase
        .from('user_achievements')
        .select('achievement_key')
        .eq('user_id', userId)

      setStats({
        score: scores?.total_score || 0,
        tripsCompleted: scores?.trips_completed || 0,
        reviewsWritten: scores?.reviews_written || 0,
        destinationsCount: scores?.destinations_count || 0,
        visitedStates: Array.from(stateSet),
        destinations: Array.from(destMap.values()).sort((a, b) => b.count - a.count),
        achievements: (achievementData || []).map(a => a.achievement_key),
      })
    }

    load()
  }, [userId])

  if (!stats) return null

  // Current tier
  const currentTier = [...BADGE_TIERS].reverse().find(t => stats.score >= t.minScore) || BADGE_TIERS[0]
  const nextTier = BADGE_TIERS.find(t => t.minScore > stats.score)
  const TierIcon = currentTier.icon
  const progressToNext = nextTier
    ? ((stats.score - currentTier.minScore) / (nextTier.minScore - currentTier.minScore)) * 100
    : 100

  return (
    <div className="space-y-4">
      {/* Points & Tier */}
      <Card className="border-border bg-card overflow-hidden">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center ${currentTier.color}`}>
                <TierIcon className="h-6 w-6" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Current Tier</div>
                <div className={`text-lg font-black ${currentTier.color}`}>{currentTier.name}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-black text-primary">{stats.score}</div>
              <div className="text-xs text-muted-foreground">Total Points</div>
            </div>
          </div>

          {/* Progress bar */}
          {nextTier && (
            <div>
              <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                <span>{currentTier.name}</span>
                <span>{nextTier.name} ({nextTier.minScore} pts)</span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, progressToNext)}%` }}
                />
              </div>
              <div className="text-[10px] text-muted-foreground mt-1 text-center">
                {nextTier.minScore - stats.score} pts to {nextTier.name}
              </div>
            </div>
          )}

          {/* Score breakdown */}
          <div className="grid grid-cols-3 gap-3 mt-4 text-center">
            <div className="bg-secondary/30 rounded-lg py-2">
              <Trophy className="h-3.5 w-3.5 text-primary mx-auto mb-0.5" />
              <div className="text-sm font-bold">{stats.tripsCompleted}</div>
              <div className="text-[10px] text-muted-foreground">Trips</div>
            </div>
            <div className="bg-secondary/30 rounded-lg py-2">
              <MapPin className="h-3.5 w-3.5 text-primary mx-auto mb-0.5" />
              <div className="text-sm font-bold">{stats.destinationsCount}</div>
              <div className="text-[10px] text-muted-foreground">Destinations</div>
            </div>
            <div className="bg-secondary/30 rounded-lg py-2">
              <Star className="h-3.5 w-3.5 text-primary mx-auto mb-0.5" />
              <div className="text-sm font-bold">{stats.reviewsWritten}</div>
              <div className="text-[10px] text-muted-foreground">Reviews</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Badges & Achievements */}
      {stats.achievements.length > 0 && (
        <Card className="border-border bg-card">
          <CardContent className="p-5">
            <h3 className="text-sm font-bold flex items-center gap-2 mb-3">
              <Award className="h-4 w-4 text-primary" /> Badges & Achievements
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {ACHIEVEMENTS.map(a => {
                const earned = stats.achievements.includes(a.key)
                return (
                  <div
                    key={a.key}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border ${
                      earned
                        ? 'border-primary/30 bg-primary/5'
                        : 'border-border/50 bg-secondary/20 opacity-40'
                    }`}
                  >
                    <span className="text-lg">{a.icon}</span>
                    <div>
                      <div className={`text-xs font-medium ${earned ? 'text-foreground' : 'text-muted-foreground'}`}>{a.name}</div>
                      <div className="text-[10px] text-muted-foreground">{a.description}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* States Unlocked */}
      <Card className="border-border bg-card">
        <CardContent className="p-5">
          <h3 className="text-sm font-bold flex items-center gap-2 mb-3">
            <Globe className="h-4 w-4 text-primary" /> States Unlocked
            <span className="text-xs text-muted-foreground font-normal ml-auto">
              {stats.visitedStates.length}/{INDIAN_STATES.length}
            </span>
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {INDIAN_STATES.map(state => {
              const visited = stats.visitedStates.includes(state)
              return (
                <span
                  key={state}
                  className={`px-2 py-1 rounded-md text-[10px] font-medium border transition-colors ${
                    visited
                      ? 'bg-primary/15 text-primary border-primary/30'
                      : 'bg-secondary/20 text-muted-foreground/40 border-border/30'
                  }`}
                >
                  {state}
                </span>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Places Covered */}
      {stats.destinations.length > 0 && (
        <Card className="border-border bg-card">
          <CardContent className="p-5">
            <h3 className="text-sm font-bold flex items-center gap-2 mb-3">
              <MapPin className="h-4 w-4 text-primary" /> Places Covered
            </h3>
            <div className="space-y-2">
              {stats.destinations.map((d, i) => (
                <div key={i} className="flex items-center justify-between bg-secondary/20 rounded-lg px-3 py-2">
                  <div>
                    <span className="text-sm font-medium">{d.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">{d.state}</span>
                  </div>
                  {d.count > 1 && (
                    <span className="text-[10px] text-primary font-medium">{d.count}x visited</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
