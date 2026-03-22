import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { MapPin, Star, Trophy, BookOpen, Instagram, Globe, CheckCircle, Lock } from 'lucide-react'
import { getInitials, formatDate } from '@/lib/utils'
import Link from 'next/link'
import { ACHIEVEMENTS } from '@/types'
import type { Profile } from '@/types'

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', username)
    .single()

  if (!profile) notFound()

  const isOwnProfile = user?.id === profile.id

  // Get stats
  const [
    { count: tripsCount },
    { data: achievements },
    { data: leaderboardScore },
    { data: reviews },
    { data: completedBookings },
  ] = await Promise.all([
    supabase.from('bookings').select('*', { count: 'exact', head: true })
      .eq('user_id', profile.id).eq('status', 'confirmed'),
    supabase.from('user_achievements').select('*').eq('user_id', profile.id),
    supabase.from('leaderboard_scores').select('*').eq('user_id', profile.id).single(),
    supabase.from('reviews').select('*, package:packages(title, destination:destinations(name, state))').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(5),
    supabase.from('bookings').select('*, package:packages(title, destination:destinations(name, state))').eq('user_id', profile.id).eq('status', 'completed').order('travel_date', { ascending: false }).limit(5),
  ])

  const earnedKeys = new Set(achievements?.map((a) => a.achievement_key) || [])

  return (
    <div className="min-h-screen bg-black">
      <div className="mx-auto max-w-4xl px-4 py-10">
        {/* Profile Header */}
        <div className="bg-card border border-border rounded-2xl p-6 md:p-8 mb-6">
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            <Avatar className="h-24 w-24 border-2 border-primary/40 flex-shrink-0">
              <AvatarImage src={profile.avatar_url || ''} />
              <AvatarFallback className="bg-primary/20 text-primary text-2xl font-black">
                {getInitials(profile.full_name || profile.username)}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                <div>
                  <h1 className="text-2xl font-black flex items-center gap-2">
                    {profile.full_name || profile.username}
                    {profile.is_verified && (
                      <CheckCircle className="h-5 w-5 text-primary fill-primary/20" />
                    )}
                  </h1>
                  <p className="text-muted-foreground">@{profile.username}</p>
                </div>
                {isOwnProfile && (
                  <Button variant="outline" size="sm" className="border-border" asChild>
                    <Link href="/profile">Edit Profile</Link>
                  </Button>
                )}
              </div>

              {profile.bio && (
                <p className="text-sm text-muted-foreground mb-3 leading-relaxed">{profile.bio}</p>
              )}

              <div className="flex flex-wrap gap-3 text-sm text-muted-foreground mb-4">
                {profile.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-primary" /> {profile.location}
                  </span>
                )}
                {profile.instagram_url && (
                  <a href={profile.instagram_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-white transition-colors">
                    <Instagram className="h-3.5 w-3.5" /> Instagram
                  </a>
                )}
                {profile.website_url && (
                  <a href={profile.website_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-white transition-colors">
                    <Globe className="h-3.5 w-3.5" /> Website
                  </a>
                )}
              </div>

              {/* Travel style tags */}
              {profile.travel_style && profile.travel_style.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {profile.travel_style.map((style: string) => (
                    <Badge key={style} variant="outline" className="text-xs border-border capitalize">
                      {style}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-3 mt-6 pt-6 border-t border-border">
            {[
              { icon: BookOpen, label: 'Trips', value: tripsCount || 0 },
              { icon: MapPin, label: 'States', value: leaderboardScore?.destinations_count || 0 },
              { icon: Star, label: 'Reviews', value: leaderboardScore?.reviews_written || 0 },
              { icon: Trophy, label: 'Score', value: leaderboardScore?.total_score || 0 },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="text-center">
                <Icon className="h-4 w-4 text-primary mx-auto mb-1" />
                <div className="text-xl font-black text-primary">{value}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Badges */}
          <div className="lg:col-span-1">
            <Card className="bg-card border-border">
              <CardContent className="p-5">
                <h2 className="font-bold mb-4 flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-primary" /> Badges
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {ACHIEVEMENTS.map((achievement) => {
                    const earned = earnedKeys.has(achievement.key)
                    return (
                      <div
                        key={achievement.key}
                        className={`p-3 rounded-xl border text-center transition-opacity ${
                          earned
                            ? 'border-primary/30 bg-primary/10'
                            : 'border-border bg-secondary/50 opacity-40'
                        }`}
                        title={achievement.description}
                      >
                        <div className="text-2xl mb-1">{earned ? achievement.icon : '🔒'}</div>
                        <div className="text-xs font-medium leading-tight">{achievement.name}</div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Travel history + reviews */}
          <div className="lg:col-span-2 space-y-6">
            {completedBookings && completedBookings.length > 0 && (
              <Card className="bg-card border-border">
                <CardContent className="p-5">
                  <h2 className="font-bold mb-4 flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" /> Travel History
                  </h2>
                  <div className="space-y-3">
                    {completedBookings.map((booking) => (
                      <div key={booking.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-lg flex-shrink-0">
                          🏔️
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {(booking.package as { title: string } | null)?.title || 'Trip'}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {(booking.package as { destination?: { name: string; state: string } } | null)?.destination?.name} · {formatDate(booking.travel_date)}
                          </div>
                        </div>
                        <Badge className="text-xs bg-green-500/20 text-green-400 border-green-500/30">Completed</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {reviews && reviews.length > 0 && (
              <Card className="bg-card border-border">
                <CardContent className="p-5">
                  <h2 className="font-bold mb-4 flex items-center gap-2">
                    <Star className="h-4 w-4 text-primary" /> Reviews
                  </h2>
                  <div className="space-y-4">
                    {reviews.map((review) => (
                      <div key={review.id} className="border-b border-border pb-4 last:border-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium">
                            {(review.package as { title: string } | null)?.title}
                          </span>
                          <div className="flex gap-0.5">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                className={`h-3 w-3 ${i < review.rating ? 'text-primary fill-primary' : 'text-muted-foreground'}`}
                              />
                            ))}
                          </div>
                        </div>
                        {review.body && (
                          <p className="text-xs text-muted-foreground line-clamp-2">{review.body}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {(!completedBookings || completedBookings.length === 0) && (!reviews || reviews.length === 0) && (
              <Card className="bg-card border-border">
                <CardContent className="p-8 text-center">
                  <p className="text-muted-foreground text-sm">
                    {isOwnProfile ? 'Complete your first trip to see your travel history here.' : 'No trips completed yet.'}
                  </p>
                  {isOwnProfile && (
                    <Button className="mt-4 bg-primary text-black font-bold" asChild>
                      <Link href="/explore">Find Your First Trip</Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
