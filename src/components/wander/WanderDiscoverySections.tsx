import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, BadgeCheck, ChevronRight, Crown, MapPin, Medal, Mountain, Quote, Star } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { WanderCarousel } from '@/components/wander/WanderCarousel'
import { WanderMyLeaderboardRank } from '@/components/wander/WanderDiscoveryClient'
import { getInitials } from '@/lib/utils'
import { wanderSearchHref } from '@/lib/routing/wanderLandingPath'
import { getCachedLeaderboardBoard } from '@/lib/leaderboard/leaderboardBoard'
import {
  getWanderRecentReviews,
  getWanderRegionTiles,
  getWanderTopHosts,
  getWanderVibeBuckets,
} from '@/lib/wander/wanderQueries'

const OPTIMIZED_IMAGE_HOSTS = [/\.supabase\.co$/, /^images\.unsplash\.com$/, /^lh3\.googleusercontent\.com$/, /^avatars\.githubusercontent\.com$/]

/** next/image only optimises allowlisted hosts; anything else (admin-pasted URLs) renders unoptimised. */
function canOptimize(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url)
    return protocol === 'https:' && OPTIMIZED_IMAGE_HOSTS.some(re => re.test(hostname))
  } catch {
    return false
  }
}

function CoverImage({ src, sizes }: { src: string | null; sizes: string }) {
  if (!src) {
    return <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/25 via-primary/10 to-transparent">
      <Mountain className="h-10 w-10 text-primary/40" />
    </div>
  }
  return <Image src={src} alt="" fill sizes={sizes} unoptimized={!canOptimize(src)}
    className="object-cover transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transition-none" />
}

function DiscoveryHeader({ eyebrow, title, subtitle, href, actionLabel = 'View all' }: {
  eyebrow?: string
  title: string
  subtitle?: string
  href?: string
  actionLabel?: string
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">{eyebrow}</p> : null}
        <h2 className="text-xl font-black tracking-tight md:text-2xl">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {href ? (
        <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline">
          {actionLabel} <ChevronRight className="h-4 w-4" />
        </Link>
      ) : null}
    </div>
  )
}

const sectionClass = 'mt-10 md:mt-14'
const tripsLabel = (n: number) => `${n} trip${n === 1 ? '' : 's'}`

export async function WanderVibesSection() {
  const vibes = await getWanderVibeBuckets()
  if (vibes.length < 2) return null
  return (
    <section aria-label="Trips by vibe" className={sectionClass}>
      <DiscoveryHeader eyebrow="Pick your mood" title="Trips by vibe" subtitle="Jump straight to the kind of trip you're craving." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-6">
        {vibes.map(vibe => (
          <Link key={vibe.id} href={wanderSearchHref({ tab: 'trips', ...vibe.params })}
            className="group relative isolate flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-2xl border border-foreground/10 p-3 shadow-sm md:p-4">
            <CoverImage src={vibe.imageUrl} sizes="(min-width: 1280px) 16vw, (min-width: 768px) 33vw, 50vw" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
            <div className="relative text-white">
              <span className="mb-1.5 inline-flex rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-bold backdrop-blur">{tripsLabel(vibe.tripCount)}</span>
              <h3 className="text-base font-black leading-tight md:text-lg">{vibe.label}</h3>
              <p className="mt-0.5 line-clamp-2 text-xs text-white/80">{vibe.blurb}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

export async function WanderRegionsSection() {
  const regions = await getWanderRegionTiles()
  if (regions.length < 2) return null
  return (
    <section aria-label="Browse by region" className={sectionClass}>
      <DiscoveryHeader eyebrow="Where to next" title="Browse by region" href={wanderSearchHref({ tab: 'trips' })} actionLabel="All trips" />
      <div className="grid auto-rows-[9.5rem] grid-cols-2 gap-3 md:auto-rows-[12rem] md:grid-cols-4 md:gap-4">
        {regions.map((region, i) => (
          <Link key={region.key} href={wanderSearchHref({ tab: 'trips', q: region.query })}
            className={`group relative isolate flex flex-col justify-end overflow-hidden rounded-2xl border border-foreground/10 p-4 shadow-sm ${i === 0 ? 'col-span-2 row-span-2' : ''}`}>
            <CoverImage src={region.imageUrl} sizes={i === 0 ? '(min-width: 768px) 50vw, 100vw' : '(min-width: 768px) 25vw, 50vw'} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
            <div className="relative flex items-end justify-between gap-2 text-white">
              <div className="min-w-0">
                <h3 className={`${i === 0 ? 'text-2xl md:text-3xl' : 'text-base md:text-lg'} font-black leading-tight`}>{region.label}</h3>
                {region.caption ? <p className="truncate text-xs text-white/80 md:text-sm">{region.caption}</p> : null}
              </div>
              <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-bold backdrop-blur">{tripsLabel(region.tripCount)}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

export async function WanderHostsSection() {
  const hosts = await getWanderTopHosts()
  if (!hosts.length) return null
  return (
    <section aria-label="Meet the hosts" className={sectionClass}>
      <DiscoveryHeader eyebrow="The people behind the trips" title="Meet the hosts"
        href={wanderSearchHref({ tab: 'trips', tripSource: 'community' })} actionLabel="Host-led trips" />
      <WanderCarousel label="Hosts">
        {hosts.map(host => (
          <Link key={host.id} href={`/profile/${host.username}`}
            className="wander-frost-panel group flex w-[15.5rem] shrink-0 snap-start flex-col p-4 transition hover:border-primary/40 md:w-[17rem]">
            <div className="flex items-center gap-3">
              <Avatar className="h-14 w-14 border-2 border-primary/30">
                <AvatarImage src={host.avatarUrl || ''} alt="" />
                <AvatarFallback className="bg-primary/20 text-sm font-bold text-primary">{getInitials(host.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="flex items-center gap-1 truncate font-bold">
                  <span className="truncate">{host.name}</span>
                  {host.verified ? <BadgeCheck className="h-4 w-4 shrink-0 text-primary" aria-label="Verified host" /> : null}
                </p>
                {host.location ? <p className="flex items-center gap-1 truncate text-xs text-muted-foreground"><MapPin className="h-3 w-3 shrink-0" />{host.location}</p> : null}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-semibold">
              {host.rating ? <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-primary"><Star className="h-3 w-3 fill-current" />{host.rating.toFixed(1)}</span> : <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5">New host</span>}
              {host.tripsHosted > 0 ? <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5">{host.tripsHosted} hosted</span> : null}
              <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5">{host.liveListings} live</span>
            </div>
            <p className="mt-3 line-clamp-2 min-h-[2.5rem] text-sm text-muted-foreground">{host.bio || `Hosting trips on UnSOLO as @${host.username}.`}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary">View profile <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></span>
          </Link>
        ))}
      </WanderCarousel>
    </section>
  )
}

export async function WanderReviewsSection() {
  const reviews = await getWanderRecentReviews()
  if (!reviews.length) return null
  return (
    <section aria-label="Traveller reviews" className={sectionClass}>
      <DiscoveryHeader eyebrow="Straight from the trail" title="What travellers say" />
      <WanderCarousel label="Traveller reviews">
        {reviews.map(review => (
          <article key={review.id} className="wander-frost-panel flex w-[17.5rem] shrink-0 snap-start flex-col overflow-hidden md:w-[20rem]">
            <div className="group relative h-36 shrink-0 overflow-hidden">
              <CoverImage src={review.imageUrl} sizes="320px" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute bottom-2 left-3 flex gap-0.5 text-[#fcba03]" aria-label="5 out of 5 stars">
                {[0, 1, 2, 3, 4].map(i => <Star key={i} className="h-4 w-4 fill-current" />)}
              </div>
            </div>
            <div className="flex flex-1 flex-col p-4">
              <Quote className="h-5 w-5 text-primary/60" aria-hidden />
              {review.title ? <h3 className="mt-1 line-clamp-1 font-bold">{review.title}</h3> : null}
              <p className="mt-1 line-clamp-5 flex-1 text-sm text-foreground/80">{review.body}</p>
              <div className="mt-4 flex items-center gap-2.5 border-t border-foreground/10 pt-3">
                <Link href={`/profile/${review.reviewer.username}`} className="shrink-0">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={review.reviewer.avatarUrl || ''} alt="" />
                    <AvatarFallback className="bg-primary/20 text-[11px] font-bold text-primary">{getInitials(review.reviewer.name)}</AvatarFallback>
                  </Avatar>
                </Link>
                <div className="min-w-0 text-xs">
                  <Link href={`/profile/${review.reviewer.username}`} className="block truncate font-bold hover:underline">{review.reviewer.name}</Link>
                  {review.trip ? (
                    <Link href={`/packages/${review.trip.slug}`} className="block truncate text-muted-foreground hover:text-primary">{review.trip.title}</Link>
                  ) : null}
                </div>
              </div>
            </div>
          </article>
        ))}
      </WanderCarousel>
    </section>
  )
}

const PODIUM_STYLES = [
  { icon: Crown, ring: 'ring-[#fcba03]', badge: 'bg-[#fcba03] text-black' },
  { icon: Medal, ring: 'ring-slate-300', badge: 'bg-slate-300 text-black' },
  { icon: Medal, ring: 'ring-amber-700', badge: 'bg-amber-700 text-white' },
]

export async function WanderLeaderboardTeaser() {
  const { entries, monthlyEntries } = await getCachedLeaderboardBoard().catch(() => ({ entries: [], monthlyEntries: [] }))
  const isMonthly = monthlyEntries.length >= 3
  const top = (isMonthly ? monthlyEntries : entries).filter(e => e.profile?.username).slice(0, 3)
  if (!top.length) return null
  return (
    <section aria-label="Leaderboard" className={sectionClass}>
      <div className="wander-frost-panel p-5 md:p-7">
        <DiscoveryHeader eyebrow="Leaderboard" title={isMonthly ? 'Top travellers this month' : 'Top travellers on UnSOLO'}
          subtitle="Earn points for every trip, review and new destination." href="/leaderboard" actionLabel="Full board" />
        <div className="grid gap-4 md:grid-cols-[1fr_minmax(16rem,20rem)] md:items-center">
          <ol className="grid grid-cols-3 gap-2 md:gap-4">
            {top.map((entry, i) => {
              const style = PODIUM_STYLES[i]!
              const name = entry.profile?.full_name || entry.profile!.username
              const stat = isMonthly && 'monthly_trips' in entry
                ? `${(entry as { monthly_trips: number }).monthly_trips} trips this month`
                : `${entry.total_score.toLocaleString('en-IN')} pts`
              return (
                <li key={entry.user_id}>
                  <Link href={`/profile/${entry.profile!.username}`} className="group flex flex-col items-center rounded-2xl p-2 text-center transition hover:bg-foreground/[0.04]">
                    <span className="relative">
                      <Avatar className={`h-14 w-14 ring-2 ring-offset-2 ring-offset-background md:h-16 md:w-16 ${style.ring}`}>
                        <AvatarImage src={entry.profile?.avatar_url || ''} alt="" />
                        <AvatarFallback className="bg-primary/20 text-sm font-bold text-primary">{getInitials(name)}</AvatarFallback>
                      </Avatar>
                      <span className={`absolute -bottom-1.5 left-1/2 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full text-[11px] font-black ${style.badge}`}>{i + 1}</span>
                    </span>
                    <span className="mt-3 line-clamp-1 text-sm font-bold group-hover:text-primary">{name}</span>
                    <span className="text-[11px] text-muted-foreground">{stat}</span>
                  </Link>
                </li>
              )
            })}
          </ol>
          <WanderMyLeaderboardRank />
        </div>
      </div>
    </section>
  )
}

export function WanderDiscoverySkeleton({ variant }: { variant: 'grid' | 'row' | 'panel' }) {
  return (
    <div className={`${sectionClass} animate-pulse`} aria-hidden>
      <div className="mb-4 h-6 w-48 rounded-md bg-foreground/10" />
      {variant === 'grid' ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-6">
          {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="aspect-[4/5] rounded-2xl bg-foreground/[0.07]" />)}
        </div>
      ) : variant === 'row' ? (
        <div className="flex gap-3 overflow-hidden md:gap-4">
          {[0, 1, 2, 3].map(i => <div key={i} className="h-60 w-[17rem] shrink-0 rounded-2xl bg-foreground/[0.07]" />)}
        </div>
      ) : (
        <div className="h-44 rounded-2xl bg-foreground/[0.07]" />
      )}
    </div>
  )
}
