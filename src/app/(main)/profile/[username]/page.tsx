export const revalidate = 30 // 30 seconds

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TravelStats } from '@/components/profile/TravelStats'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MapPin, Star, Trophy, BookOpen, Instagram, Globe, CheckCircle, Lock, MessageCircle, Phone } from 'lucide-react'
import { getInitials, formatDate } from '@/lib/utils'
import Link from 'next/link'
import { ACHIEVEMENTS } from '@/types'
import type { Profile } from '@/types'
import { getFollowData } from '@/actions/profile'
import { ProfileActions, OwnProfileFollowCounts } from './ProfileActions'
import { PhoneRequestButton } from './PhoneRequestButton'

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
    { data: confirmedBookings },
  ] = await Promise.all([
    supabase.from('bookings').select('*', { count: 'exact', head: true })
      .eq('user_id', profile.id).in('status', ['confirmed', 'completed']),
    supabase.from('user_achievements').select('*').eq('user_id', profile.id),
    supabase.from('leaderboard_scores').select('*').eq('user_id', profile.id).single(),
    supabase.from('reviews').select('*, package:packages(title, slug, destination:destinations(name, state))').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(10),
    supabase.from('bookings').select('*, package:packages(title, slug, destination:destinations(name, state))').eq('user_id', profile.id).eq('status', 'completed').order('travel_date', { ascending: false }).limit(10),
    supabase.from('bookings').select('*, package:packages(title, slug, destination:destinations(name, state))').eq('user_id', profile.id).in('status', ['confirmed', 'completed']).order('travel_date', { ascending: false }).limit(20),
  ])

  const earnedKeys = new Set(achievements?.map((a) => a.achievement_key) || [])

  // Get follow data
  const followData = await getFollowData(profile.id)

  // Get phone visibility for other profiles
  let phoneVisible = false
  let phoneNumber: string | null = profile.phone_number || null
  let phoneRequestStatus: string | null = null
  if (!isOwnProfile && phoneNumber) {
    if (profile.phone_public === true) {
      phoneVisible = true
    } else if (user) {
      // Check if there's an approved phone request
      const { data: req } = await supabase
        .from('phone_requests')
        .select('status')
        .eq('requester_id', user.id)
        .eq('target_id', profile.id)
        .single()
      phoneRequestStatus = req?.status || null
      phoneVisible = req?.status === 'approved'
    }
  }

  // Extract user objects for modals
  const followerUsers = (followData.followers || []).map((f: Record<string, unknown>) => {
    const u = f.follower as { id: string; username: string; full_name: string | null; avatar_url: string | null } | null
    return u
  }).filter(Boolean) as { id: string; username: string; full_name: string | null; avatar_url: string | null }[]

  const followingUsers = (followData.following || []).map((f: Record<string, unknown>) => {
    const u = f.following as { id: string; username: string; full_name: string | null; avatar_url: string | null } | null
    return u
  }).filter(Boolean) as { id: string; username: string; full_name: string | null; avatar_url: string | null }[]

  // Get user status
  const statusText = profile.status_text || 'Still deciding my next trip'
  const statusVisibility = profile.status_visibility || 'public'
  const canSeeStatus = statusVisibility === 'public' || isOwnProfile || followData.isFollowing

  // Determine privacy
  const tripsPrivate = profile.trips_private && !isOwnProfile
  const statesPrivate = profile.states_private && !isOwnProfile

  // Compute unique states from bookings
  const uniqueStates = new Set<string>()
  ;(confirmedBookings || []).forEach((b) => {
    const dest = (b.package as { destination?: { state: string } } | null)?.destination
    if (dest?.state) uniqueStates.add(dest.state)
  })

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-10">
        {/* Profile Header */}
        <div className="bg-card border border-border rounded-2xl p-6 md:p-8 mb-6">
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            {profile.avatar_url ? (
              <a href={profile.avatar_url} target="_blank" rel="noopener noreferrer" title="View full photo">
                <Avatar className="h-24 w-24 border-2 border-primary/40 flex-shrink-0 cursor-pointer hover:ring-4 hover:ring-primary/20 transition-all">
                  <AvatarImage src={profile.avatar_url} />
                  <AvatarFallback className="bg-primary/20 text-primary text-2xl font-black">
                    {getInitials(profile.full_name || profile.username)}
                  </AvatarFallback>
                </Avatar>
              </a>
            ) : (
              <Avatar className="h-24 w-24 border-2 border-primary/40 flex-shrink-0">
                <AvatarFallback className="bg-primary/20 text-primary text-2xl font-black">
                  {getInitials(profile.full_name || profile.username)}
                </AvatarFallback>
              </Avatar>
            )}

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
                <div className="flex gap-2">
                  {isOwnProfile ? (
                    <Button variant="outline" size="sm" className="border-border" asChild>
                      <Link href="/profile">Edit Profile</Link>
                    </Button>
                  ) : (
                    <ProfileActions
                      profileId={profile.id}
                      isFollowing={followData.isFollowing}
                      isLoggedIn={!!user}
                      initialFollowersCount={followData.followersCount}
                      initialFollowingCount={followData.followingCount}
                      followers={followerUsers}
                      following={followingUsers}
                    />
                  )}
                </div>
              </div>

              {profile.bio && (
                <p className="text-sm text-muted-foreground mb-3 leading-relaxed">{profile.bio}</p>
              )}

              {/* Followers / Following (clickable modals) */}
              <OwnProfileFollowCounts
                followersCount={isOwnProfile ? followData.followersCount : -1}
                followingCount={followData.followingCount}
                followers={followerUsers}
                following={followingUsers}
                isOtherProfile={!isOwnProfile}
                profileId={profile.id}
                isFollowing={followData.isFollowing}
              />

              {/* Status */}
              {canSeeStatus && statusText && (
                <div className="mb-3 text-sm text-muted-foreground italic flex items-center gap-1.5">
                  <span className="text-primary">●</span> {statusText}
                  {statusVisibility === 'followers' && !isOwnProfile && (
                    <span className="text-[10px] text-zinc-500">(visible to followers)</span>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-3 text-sm text-muted-foreground mb-4">
                {profile.location && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(profile.location)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-primary transition-colors"
                    title="Open in Google Maps"
                  >
                    <MapPin className="h-3.5 w-3.5 text-primary" /> {profile.location}
                  </a>
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

              {/* Phone number */}
              {!isOwnProfile && phoneNumber && (
                <div className="flex items-center gap-2 text-sm mb-2">
                  <Phone className="h-3.5 w-3.5 text-primary" />
                  {phoneVisible ? (
                    <a href={`tel:${phoneNumber}`} className="hover:text-primary transition-colors">{phoneNumber}</a>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{phoneNumber.slice(0, 2)}****{phoneNumber.slice(-2)}</span>
                      <Lock className="h-3 w-3 text-zinc-500" />
                      {phoneRequestStatus === 'pending' ? (
                        <span className="text-[10px] text-yellow-400">Request pending</span>
                      ) : phoneRequestStatus !== 'approved' && user ? (
                        <PhoneRequestButton targetId={profile.id} />
                      ) : null}
                    </div>
                  )}
                </div>
              )}

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
              { icon: BookOpen, label: 'Trips', value: tripsCount || 0, private: tripsPrivate },
              { icon: MapPin, label: 'States', value: uniqueStates.size || leaderboardScore?.destinations_count || 0, private: statesPrivate },
              { icon: Star, label: 'Reviews', value: leaderboardScore?.reviews_written || 0, private: false },
              { icon: Trophy, label: 'Score', value: leaderboardScore?.total_score || 0, private: false },
            ].map(({ icon: Icon, label, value, private: isPrivate }) => (
              <div key={label} className="text-center">
                <Icon className="h-4 w-4 text-primary mx-auto mb-1" />
                <div className="text-xl font-black text-primary flex items-center justify-center gap-1">
                  {value}
                  {isPrivate && <Lock className="h-3 w-3 text-muted-foreground" />}
                </div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Followers/following are now shown in Instagram-style modals via ProfileActions/OwnProfileFollowCounts */}

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
            {/* Trips - clickable, with privacy */}
            {completedBookings && completedBookings.length > 0 && (
              <Card className="bg-card border-border">
                <CardContent className="p-5">
                  <h2 className="font-bold mb-4 flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" /> Travel History
                    {tripsPrivate && <Lock className="h-3 w-3 text-muted-foreground" />}
                  </h2>
                  {tripsPrivate ? (
                    <p className="text-sm text-muted-foreground">This user has made their travel history private.</p>
                  ) : (
                    <div className="space-y-3">
                      {completedBookings.map((booking) => {
                        const pkg = booking.package as { title: string; slug: string; destination?: { name: string; state: string } } | null
                        return (
                          <Link key={booking.id} href={`/packages/${pkg?.slug || ''}`} className="block">
                            <div className="flex items-center gap-3 py-2 border-b border-border last:border-0 hover:bg-secondary/20 rounded-md px-2 -mx-2 transition-colors">
                              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-lg flex-shrink-0">
                                🏔️
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">{pkg?.title || 'Trip'}</div>
                                <div className="text-xs text-muted-foreground">
                                  {pkg?.destination?.name}, {pkg?.destination?.state} · {formatDate(booking.travel_date)}
                                </div>
                              </div>
                              <Badge className="text-xs bg-green-500/20 text-green-400 border-green-500/30">Completed</Badge>
                            </div>
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* States visited */}
            {uniqueStates.size > 0 && (
              <Card className="bg-card border-border">
                <CardContent className="p-5">
                  <h2 className="font-bold mb-4 flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" /> States Explored
                    {statesPrivate && <Lock className="h-3 w-3 text-muted-foreground" />}
                  </h2>
                  {statesPrivate ? (
                    <p className="text-sm text-muted-foreground">This user has made their explored states private.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {Array.from(uniqueStates).map(state => (
                        <Badge key={state} className="bg-primary/10 text-primary border-primary/30">{state}</Badge>
                      ))}
                    </div>
                  )}
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
                    {reviews.map((review) => {
                      const pkg = review.package as { title: string; slug: string } | null
                      return (
                        <Link key={review.id} href={`/packages/${pkg?.slug || ''}`} className="block">
                          <div className="border-b border-border pb-4 last:border-0 hover:bg-secondary/20 rounded-md px-2 -mx-2 py-2 transition-colors">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium">{pkg?.title}</span>
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
                        </Link>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {(!completedBookings || completedBookings.length === 0) && (!reviews || reviews.length === 0) && (
              <Card className="bg-card border-border">
                <CardContent className="p-8 text-center">
                  <p className="text-muted-foreground text-sm">
                    {isOwnProfile ? 'Your travel story starts here. Explore destinations and book your next adventure!' : 'No trips completed yet.'}
                  </p>
                  {isOwnProfile && (
                    <Button className="mt-4 bg-primary text-black font-bold" asChild>
                      <Link href="/explore">Book Your Next Trip</Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Travel Stats — Points, Tiers, States, Achievements */}
        <TravelStats userId={profile.id} isOwnProfile={isOwnProfile} />
      </div>
    </div>
  )
}
