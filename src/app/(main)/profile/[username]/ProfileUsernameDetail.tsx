import { Suspense } from 'react'
import Link from 'next/link'
import { CalendarDays, CheckCircle, Globe, Instagram, Lock, MapPin, Phone } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ProfileAvatarWithStatusMenu } from '@/components/profile/ProfileAvatarWithStatusMenu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getInitials } from '@/lib/utils'
import type { Profile } from '@/types'
import { getFollowData } from '@/actions/profile'
import { getStatusStoriesForProfile } from '@/actions/statusStories'
import { ProfileStatusRail } from '@/components/status/ProfileStatusRail'
import { APP_URL } from '@/lib/constants'
import { firstName, joinedLabel } from '@/lib/profile/publicProfileSummary'
import { ProfileActions, OwnProfileFollowCounts } from './ProfileActions'
import { FollowersCountProvider } from './FollowersCountContext'
import { PhoneRequestButton } from './PhoneRequestButton'
import {
  loadAchievementKeys, loadHostedListings, loadLeaderboard, loadReviews, loadTravelActivity, loadViewerPlaces,
} from './profileData'
import {
  ProfileActivity, ProfileActivitySkeleton, ProfileHighlights, ProfileHighlightsSkeleton,
  ProfileShareFallback, ProfileShareSlot, ProfileSidebar, ProfileSidebarSkeleton, type ProfileSectionContext,
} from './ProfileSections'
import { ProfileConnections, ProfileEndSeparator } from './ProfileConnectionsSection'
import { loadHostConnections, loadViewerRelation } from './profileConnections'

type ProfileRow = Profile & {
  status_text?: string | null
  status_visibility?: string | null
  trips_private?: boolean | null
  states_private?: boolean | null
}

export async function ProfileUsernameDetail({
  profile,
  viewerUserId,
  sharePosterFooterTagline,
  sharePosterShareTitle,
  sharePosterShareText,
}: {
  profile: ProfileRow
  viewerUserId: string | null
  sharePosterFooterTagline: string
  sharePosterShareTitle: string
  sharePosterShareText: string
}) {
  const isOwnProfile = viewerUserId === profile.id
  const displayName = profile.full_name || profile.username

  // Start the streamed sections' queries now so they overlap with the header's.
  void loadTravelActivity(profile.id)
  void loadLeaderboard(profile.id)
  void loadAchievementKeys(profile.id)
  void loadReviews(profile.id)
  void loadHostedListings(profile.id)
  if (viewerUserId && !isOwnProfile) {
    void loadViewerPlaces(viewerUserId)
    void loadViewerRelation(profile.id, viewerUserId).catch(() => null)
  }
  void loadHostConnections(profile.id, isOwnProfile).catch(() => null)

  const needsPhoneRequest = Boolean(!isOwnProfile && profile.phone_number && viewerUserId && profile.phone_public !== true)
  const [statusStories, followData, phoneRequestStatus] = await Promise.all([
    getStatusStoriesForProfile(profile.id, viewerUserId),
    getFollowData(profile.id, viewerUserId),
    needsPhoneRequest
      ? createClient().then(async (supabase) => {
          const { data } = await supabase
            .from('phone_requests')
            .select('status')
            .eq('requester_id', viewerUserId!)
            .eq('target_id', profile.id)
            .maybeSingle()
          return (data?.status as string | undefined) ?? null
        })
      : Promise.resolve(null),
  ])

  const phoneNumber = !isOwnProfile ? profile.phone_number || null : null
  const phoneVisible = Boolean(phoneNumber && (profile.phone_public === true || phoneRequestStatus === 'approved'))

  const statusText = profile.status_text || 'Still deciding my next trip'
  const statusVisibility = profile.status_visibility || 'public'
  const canSeeStatus = statusVisibility === 'public' || isOwnProfile || followData.isFollowing

  const ctx: ProfileSectionContext = {
    profileId: profile.id,
    username: profile.username,
    displayName,
    first: firstName(profile.full_name, profile.username),
    avatarUrl: profile.avatar_url,
    isOwnProfile,
    viewerUserId,
    tripsPrivate: Boolean(profile.trips_private && !isOwnProfile),
    statesPrivate: Boolean(profile.states_private && !isOwnProfile),
    completeness: profile,
  }
  const joined = joinedLabel(profile.created_at)
  const initials = getInitials(displayName)

  return (
    <div className="mx-auto w-full max-w-[min(100%,88rem)] px-4 py-6 sm:px-6 sm:py-10 lg:px-10 xl:px-12">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-10 lg:items-start lg:gap-8 xl:gap-10">
        <div className="min-w-0 space-y-6 lg:col-span-7">
          <section className="overflow-hidden rounded-2xl border border-border bg-card">
            <div
              aria-hidden
              className="h-24 bg-[radial-gradient(600px_200px_at_80%_0%,rgba(252,186,3,0.35),transparent_60%),linear-gradient(120deg,#1b2436,#3b4a6b_55%,#7a8fb5)] md:h-32"
            />
            <div className="px-5 pb-5 md:px-8 md:pb-7">
              <FollowersCountProvider initialCount={followData.followersCount}>
                <div className="relative -mt-12">
                <div className="w-fit">
                  <div className="rounded-full bg-card p-1">
                    {profile.avatar_url && viewerUserId ? (
                      <ProfileAvatarWithStatusMenu
                        src={profile.avatar_url}
                        fallback={initials}
                        hasActiveStatus={statusStories.length > 0}
                        statusStories={statusStories}
                        currentUserId={viewerUserId}
                      />
                    ) : (
                      <Avatar className="h-24 w-24 border-2 border-primary/40">
                        {profile.avatar_url ? <AvatarImage src={profile.avatar_url} alt="" /> : null}
                        <AvatarFallback className="bg-primary/15 text-2xl font-black text-primary">{initials}</AvatarFallback>
                      </Avatar>
                    )}
                  </div>
                </div>

                <div className="mt-3 min-w-0">
                  <h1 className="flex flex-wrap items-center gap-2 text-2xl font-black leading-tight">
                    <span className="break-words">{displayName}</span>
                    {profile.is_verified ? <CheckCircle className="h-5 w-5 fill-primary/20 text-primary" aria-label="Verified" /> : null}
                    {profile.is_host ? (
                      <Badge variant="outline" className="border-primary/40 text-[10px] font-semibold uppercase tracking-wide text-primary">Host</Badge>
                    ) : null}
                  </h1>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    <span>@{profile.username}</span>
                    {joined ? (
                      <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />{joined}</span>
                    ) : null}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2 sm:absolute sm:right-0 sm:top-14 sm:mt-0 sm:justify-end">
                    <Suspense fallback={<ProfileShareFallback />}>
                      <ProfileShareSlot
                        ctx={ctx}
                        footerTagline={sharePosterFooterTagline}
                        shareTitle={sharePosterShareTitle}
                        shareText={sharePosterShareText}
                        profileUrl={`${APP_URL.replace(/\/$/, '')}/profile/${profile.username}`}
                      />
                    </Suspense>
                    {isOwnProfile ? (
                      <Button variant="outline" size="sm" className="border-border" asChild>
                        <Link href="/profile">Edit profile</Link>
                      </Button>
                    ) : (
                      <ProfileActions profileId={profile.id} isFollowing={followData.isFollowing} isLoggedIn={!!viewerUserId} />
                    )}
                  </div>

                  {!isOwnProfile && followData.followsYou && !followData.isFollowing ? (
                    <p className="mt-2 inline-flex rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                      Follows you
                    </p>
                  ) : null}

                  {profile.bio ? (
                    <p className="mt-3 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-foreground/85">{profile.bio}</p>
                  ) : null}

                  <div className="mt-3">
                    <OwnProfileFollowCounts
                      profileId={profile.id}
                      followersCount={followData.followersCount}
                      followingCount={followData.followingCount}
                    />
                  </div>

                  {canSeeStatus && statusText ? (
                    <p className="mb-3 flex items-center gap-1.5 text-sm italic text-muted-foreground">
                      <span className="text-primary" aria-hidden="true">●</span> {statusText}
                      {statusVisibility === 'followers' && !isOwnProfile ? (
                        <span className="text-[10px] not-italic">(visible to followers)</span>
                      ) : null}
                    </p>
                  ) : null}

                  {(profile.location || profile.instagram_url || profile.website_url || phoneNumber) ? (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                      {profile.location ? (
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(profile.location)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 transition-colors hover:text-primary"
                          title="Open in Google Maps"
                        >
                          <MapPin className="h-3.5 w-3.5 text-primary" /> {profile.location}
                        </a>
                      ) : null}
                      {profile.instagram_url ? (
                        <a href={profile.instagram_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 transition-colors hover:text-foreground">
                          <Instagram className="h-3.5 w-3.5" /> Instagram
                        </a>
                      ) : null}
                      {profile.website_url ? (
                        <a href={profile.website_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 transition-colors hover:text-foreground">
                          <Globe className="h-3.5 w-3.5" /> Website
                        </a>
                      ) : null}
                      {phoneNumber ? (
                        <span className="flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5 text-primary" />
                          {phoneVisible ? (
                            <a href={`tel:${phoneNumber}`} className="transition-colors hover:text-primary">{phoneNumber}</a>
                          ) : (
                            <>
                              <span>{phoneNumber.slice(0, 2)}****{phoneNumber.slice(-2)}</span>
                              <Lock className="h-3 w-3" aria-hidden="true" />
                              {phoneRequestStatus === 'pending' ? (
                                <span className="text-[11px] text-amber-600 dark:text-amber-300">Request pending</span>
                              ) : viewerUserId ? (
                                <PhoneRequestButton targetId={profile.id} />
                              ) : null}
                            </>
                          )}
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  {profile.travel_style && profile.travel_style.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {profile.travel_style.map((style: string) => (
                        <Badge key={style} variant="outline" className="border-border text-xs capitalize">{style}</Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
                </div>
              </FollowersCountProvider>

              <div className="mt-5 border-t border-border pt-5">
                <Suspense fallback={<ProfileHighlightsSkeleton />}>
                  <ProfileHighlights ctx={ctx} />
                </Suspense>
              </div>
            </div>
          </section>

          {viewerUserId ? (
            <ProfileStatusRail isOwn={isOwnProfile} stories={statusStories} viewerId={viewerUserId} />
          ) : null}

          <Suspense fallback={<ProfileActivitySkeleton />}>
            <ProfileActivity ctx={ctx} />
          </Suspense>

          <Suspense fallback={null}>
            <ProfileConnections ctx={ctx} />
          </Suspense>
        </div>

        <aside className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-6 lg:col-span-3 lg:self-start">
          <Suspense fallback={<ProfileSidebarSkeleton />}>
            <ProfileSidebar ctx={ctx} />
          </Suspense>
        </aside>
      </div>
      <ProfileEndSeparator username={profile.username} />
    </div>
  )
}
