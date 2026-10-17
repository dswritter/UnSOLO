import Link from 'next/link'
import { BookOpen, Compass, Lock, MapPin, Mountain, Share2, Sparkles, Star, Trophy, UserRound, Check } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ProfileSectionTabs, type ProfileTab } from '@/components/profile/ProfileSectionTabs'
import { ProfileSharePosterButton } from '@/components/profile/ProfileSharePoster'
import { StatesExploredCard } from '@/components/profile/StatesExploredCard'
import { cn, formatDate, getInitials } from '@/lib/utils'
import { WANDER_HOME_SEARCH_HREF } from '@/lib/routing/wanderLandingPath'
import {
  badgeProgress, isSparseProfile, mutualPlaces, profileCompleteness, profileTierProgress, type CompletenessInput,
} from '@/lib/profile/publicProfileSummary'
import {
  loadAchievementKeys, loadHostedListings, loadLeaderboard, loadReviews, loadTravelActivity, loadViewerPlaces,
} from './profileData'

export type ProfileSectionContext = {
  profileId: string
  username: string
  displayName: string
  first: string
  avatarUrl: string | null
  isOwnProfile: boolean
  viewerUserId: string | null
  tripsPrivate: boolean
  statesPrivate: boolean
  completeness: CompletenessInput
}

const pulse = 'animate-pulse rounded-md bg-secondary/60'

async function loadCounts(ctx: ProfileSectionContext) {
  const [travel, board, hosted] = await Promise.all([
    loadTravelActivity(ctx.profileId), loadLeaderboard(ctx.profileId), loadHostedListings(ctx.profileId),
  ])
  const counts = {
    trips: travel.tripsCount,
    states: travel.states.length || board.destinationsCount,
    reviews: board.reviewsWritten,
    score: board.score,
    listings: hosted.length,
  }
  return { travel, board, hosted, counts }
}

/** Stats strip, or a welcome panel when there is nothing to count yet. */
export async function ProfileHighlights({ ctx }: { ctx: ProfileSectionContext }) {
  const [{ board, counts, travel }, viewerPlaces] = await Promise.all([
    loadCounts(ctx),
    ctx.viewerUserId && !ctx.isOwnProfile ? loadViewerPlaces(ctx.viewerUserId) : Promise.resolve(null),
  ])
  const mutual = viewerPlaces && !ctx.tripsPrivate ? mutualPlaces(travel.bookings, viewerPlaces) : []

  if (isSparseProfile(counts)) {
    return <GettingStarted ctx={ctx} />
  }

  const tier = profileTierProgress(counts.score)
  const items = [
    { icon: BookOpen, label: counts.trips === 1 ? 'Trip' : 'Trips', value: counts.trips, isPrivate: ctx.tripsPrivate },
    { icon: MapPin, label: counts.states === 1 ? 'State' : 'States', value: counts.states, isPrivate: ctx.statesPrivate },
    { icon: Star, label: counts.reviews === 1 ? 'Review' : 'Reviews', value: counts.reviews, isPrivate: false },
    { icon: Mountain, label: counts.listings === 1 ? 'Listing' : 'Listings', value: counts.listings, isPrivate: false },
    { icon: Trophy, label: 'Points', value: counts.score, isPrivate: false },
  ].filter(i => i.value > 0 || i.isPrivate)

  return (
    <div className="space-y-3">
      <dl
        className="grid divide-x divide-border/70 rounded-xl border border-border/70 bg-secondary/25"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map(({ icon: Icon, label, value, isPrivate }) => (
          <div key={label} className="flex flex-col items-center px-1 py-2.5 text-center sm:py-3">
            <dd className="flex h-6 items-center text-lg font-black tabular-nums text-foreground sm:text-xl">
              {isPrivate ? <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="Private" /> : value}
            </dd>
            <dt className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground sm:text-xs">
              <Icon className="hidden h-3.5 w-3.5 text-primary sm:block" aria-hidden="true" /> {label}
            </dt>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border/70 px-3 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className={cn('text-sm font-bold', tier.current.tone)}>{tier.current.name}</span>
          {tier.next ? (
            <div className="min-w-24 flex-1">
              <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, tier.percent)}%` }} />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{tier.pointsToNext} pts to {tier.next.name}</p>
            </div>
          ) : null}
        </div>
        {board.rank != null ? (
          <Link href="/leaderboard" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary">
            <Trophy className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            Rank <span className="text-sm font-black tabular-nums text-primary">#{board.rank}</span>
          </Link>
        ) : null}
      </div>

      {mutual.length > 0 ? (
        <p className="rounded-xl border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          🌏 You both travelled to{' '}
          <span className="font-medium text-foreground">
            {mutual.slice(0, 2).join(' & ')}{mutual.length > 2 ? ` +${mutual.length - 2} more` : ''}
          </span>
        </p>
      ) : null}
    </div>
  )
}

function GettingStarted({ ctx }: { ctx: ProfileSectionContext }) {
  if (!ctx.isOwnProfile) {
    return (
      <div className="flex items-center gap-4 rounded-2xl border border-dashed border-border bg-secondary/25 p-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Compass className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{ctx.first} is new to UnSOLO</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            No trips here yet. Say hi, or invite them along on your next adventure.
          </p>
        </div>
      </div>
    )
  }

  const progress = profileCompleteness(ctx.completeness)
  const pending = progress.steps.filter(s => !s.done)
  return (
    <div className="grid gap-4 rounded-2xl border border-primary/25 bg-primary/[0.06] p-4 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
          <p className="text-sm font-semibold text-foreground">Your travel story starts here</p>
        </div>
        {pending.length > 0 ? (
          <>
            <div>
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>Profile {progress.percent}% complete</span>
                <span>{progress.done}/{progress.total}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, progress.percent)}%` }} />
              </div>
            </div>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {progress.steps.map(step => (
                <li key={step.key} className={cn('flex items-center gap-2 text-xs', step.done ? 'text-muted-foreground line-through' : 'text-foreground')}>
                  <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', step.done ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>
                    {step.done ? <Check className="h-2.5 w-2.5" aria-hidden="true" /> : null}
                  </span>
                  {step.label}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Your profile is all set. Book a trip to start earning points and badges.</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2 sm:flex-col">
        <Button size="sm" className="font-semibold" asChild>
          <Link href={WANDER_HOME_SEARCH_HREF}>Explore trips</Link>
        </Button>
        {pending.length > 0 ? (
          <Button size="sm" variant="outline" className="border-border" asChild>
            <Link href="/profile"><UserRound className="mr-1 h-3.5 w-3.5" />Finish profile</Link>
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export function ProfileHighlightsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-hidden="true">
      {[0, 1, 2, 3].map(i => <div key={i} className={cn('h-16 rounded-xl', pulse)} />)}
    </div>
  )
}

/** Trips, reviews and hosted listings. Renders nothing when all are empty. */
export async function ProfileActivity({ ctx }: { ctx: ProfileSectionContext }) {
  const [travel, reviews, hosted] = await Promise.all([
    loadTravelActivity(ctx.profileId), loadReviews(ctx.profileId), loadHostedListings(ctx.profileId),
  ])

  const tabs: ProfileTab[] = []
  if (hosted.length > 0) {
    tabs.push({
      id: 'hosting', label: ctx.isOwnProfile ? 'My listings' : 'Hosting', count: hosted.length,
      content: (
        <Card className="bg-card border-border py-0">
          <CardContent className="grid gap-2 p-3 sm:grid-cols-2">
            {hosted.map(l => (
              <Link key={l.id} href={l.href} className="flex items-center gap-3 rounded-xl border border-border/70 p-3 transition-colors hover:border-primary/40 hover:bg-secondary/30">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
                  <Mountain className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{l.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{[l.kind, l.place].filter(Boolean).join(' · ')}</span>
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      ),
    })
  }
  if (travel.completed.length > 0) {
    tabs.push({
      id: 'trips', label: 'Trips', count: travel.completed.length,
      content: (
        <Card className="bg-card border-border py-0">
          <CardContent className="p-3">
            {ctx.tripsPrivate ? (
              <p className="flex items-center gap-2 p-2 text-sm text-muted-foreground"><Lock className="h-3.5 w-3.5" /> Travel history is private.</p>
            ) : (
              <ul className="divide-y divide-border">
                {travel.completed.map(b => (
                  <li key={b.id}>
                    <Link href={`/packages/${b.package?.slug || ''}`} className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-secondary/30">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
                        <Mountain className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{b.package?.title || 'Trip'}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[b.package?.destination?.name, b.package?.destination?.state].filter(Boolean).join(', ')} · {formatDate(b.travel_date)}
                        </span>
                      </span>
                      <Badge variant="outline" className="shrink-0 border-emerald-500/30 text-[10px] text-emerald-700 dark:text-emerald-400">Completed</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ),
    })
  }
  if (reviews.length > 0) {
    tabs.push({
      id: 'reviews', label: 'Reviews', count: reviews.length,
      content: (
        <Card className="bg-card border-border py-0">
          <CardContent className="p-3">
            <ul className="divide-y divide-border">
              {reviews.map(r => (
                <li key={r.id}>
                  <Link href={`/packages/${r.package?.slug || ''}`} className="block rounded-lg px-2 py-2.5 transition-colors hover:bg-secondary/30">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{r.package?.title || 'Trip'}</span>
                      <span className="flex shrink-0 gap-0.5" aria-label={`${r.rating} out of 5`}>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className={cn('h-3 w-3', i < r.rating ? 'fill-primary text-primary' : 'text-muted-foreground/50')} aria-hidden="true" />
                        ))}
                      </span>
                    </span>
                    {r.body ? <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{r.body}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ),
    })
  }

  return <ProfileSectionTabs tabs={tabs} />
}

export function ProfileActivitySkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <div className={cn('h-9 w-56 rounded-xl', pulse)} />
      <div className={cn('h-36 rounded-2xl', pulse)} />
    </div>
  )
}

/** Badges + explored states. */
export async function ProfileSidebar({ ctx }: { ctx: ProfileSectionContext }) {
  const [keys, travel] = await Promise.all([loadAchievementKeys(ctx.profileId), loadTravelActivity(ctx.profileId)])
  const badges = badgeProgress(keys)

  return (
    <>
      <Card className="bg-card border-border py-0">
        <CardContent className="p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-bold">
              <Trophy className="h-4 w-4 text-primary" /> Badges
            </h2>
            <span className="text-xs tabular-nums text-muted-foreground">{badges.earned.length} / {badges.total}</span>
          </div>

          {badges.earned.length > 0 ? (
            <div className="mb-4 grid grid-cols-2 gap-2">
              {badges.earned.map(a => (
                <div key={a.key} title={a.description} className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-center">
                  <div className="text-2xl" aria-hidden="true">{a.icon}</div>
                  <div className="mt-1 text-xs font-semibold leading-snug">{a.name}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mb-3 text-xs text-muted-foreground">
              {ctx.isOwnProfile ? 'Travel, review and connect to earn your first badge.' : 'No badges earned yet.'}
            </p>
          )}

          {badges.nextUp.length > 0 ? (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Next to unlock</p>
              <ul className="space-y-2">
                {badges.nextUp.map(a => (
                  <li key={a.key} className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-base grayscale opacity-70" aria-hidden="true">{a.icon}</span>
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-foreground">{a.name}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{a.description}</span>
                    </span>
                  </li>
                ))}
              </ul>
              {badges.locked.length > badges.nextUp.length ? (
                <p className="mt-2 text-[11px] text-muted-foreground">+{badges.locked.length - badges.nextUp.length} more to discover</p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
      <StatesExploredCard
        visitedStates={travel.states}
        statesPrivate={ctx.statesPrivate}
        emptyMessage={ctx.isOwnProfile ? 'Book a trip to start colouring the map.' : 'No states explored yet.'}
      />
    </>
  )
}

export function ProfileSidebarSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className={cn('h-56 rounded-2xl', pulse)} />
      <div className={cn('h-28 rounded-2xl', pulse)} />
    </div>
  )
}

export async function ProfileShareSlot({
  ctx, footerTagline, shareTitle, shareText, profileUrl,
}: {
  ctx: ProfileSectionContext
  footerTagline: string
  shareTitle: string
  shareText: string
  profileUrl: string
}) {
  const [{ travel, board, counts }, keys] = await Promise.all([loadCounts(ctx), loadAchievementKeys(ctx.profileId)])
  const trips = ctx.tripsPrivate ? [] : travel.completed.map(b => ({
    title: b.package?.title || 'Trip',
    place: [b.package?.destination?.name, b.package?.destination?.state].filter(Boolean).join(', ') || 'India',
    date: formatDate(b.travel_date),
  }))
  return (
    <ProfileSharePosterButton
      displayName={ctx.displayName}
      username={ctx.username}
      profileUrl={profileUrl}
      avatarUrl={ctx.avatarUrl}
      avatarInitials={getInitials(ctx.displayName)}
      trips={counts.trips}
      states={counts.states}
      reviews={counts.reviews}
      score={counts.score}
      leaderboardRank={board.rank}
      tripsStatHidden={ctx.tripsPrivate}
      statesStatHidden={ctx.statesPrivate}
      visitedStates={travel.states}
      statesMapHidden={ctx.statesPrivate}
      tripsHidden={ctx.tripsPrivate}
      tripsList={trips}
      footerTagline={footerTagline}
      shareTitleTemplate={shareTitle}
      shareTextTemplate={shareText}
      earnedAchievementKeys={keys}
    />
  )
}

export function ProfileShareFallback() {
  return (
    <Button variant="outline" size="sm" className="border-border" disabled>
      <Share2 className="mr-1 h-3.5 w-3.5" /> Share
    </Button>
  )
}
