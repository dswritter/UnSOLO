import type { CSSProperties } from 'react'
import Link from 'next/link'
import { CreditCard, MapPin, Smile, Star } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { WanderStatsGrid } from '@/components/wander/WanderStatsGrid'
import { getInitials } from '@/lib/utils'
import { getWanderRatingHero, getWanderStats, type WanderHeroCopy } from '@/lib/wander/wanderQueries'

const PROOF_CARD_CLASS = 'w-full rounded-xl border border-foreground/18 bg-background/40 p-2.5 shadow-[0_12px_48px_rgba(0,0,0,0.4)] backdrop-blur-[44px] backdrop-saturate-150 flex flex-col justify-between gap-2.5 ring-1 ring-foreground/12 [aspect-ratio:1/1.12] min-h-[9.5rem] sm:min-h-[10rem]'

export function WanderHeroProofSkeleton() {
  return <div className={`${PROOF_CARD_CLASS} animate-pulse`} aria-label="Loading traveler ratings" aria-busy="true">
    <div className="h-8 w-20 rounded-lg bg-foreground/10" />
    <div className="space-y-1"><div className="h-3 w-20 rounded bg-foreground/10" /><div className="h-3 w-16 rounded bg-foreground/10" /></div>
    <div className="flex gap-1">{[0, 1, 2, 3, 4].map(i => <div key={i} className="h-7 w-7 rounded-full bg-foreground/10" />)}</div>
  </div>
}

export async function WanderHeroRatingProofServer() {
  const [rating, stats] = await Promise.all([getWanderRatingHero(), getWanderStats()])
  const trustLine = stats.soloTravelers >= 1000
    ? `${Math.floor(stats.soloTravelers / 1000)}K+`
    : stats.soloTravelers > 0 ? `${stats.soloTravelers}+` : '10K+'
  return <div className={PROOF_CARD_CLASS}>
    <div className="flex items-start gap-1.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/25">
        <Star className="h-4 w-4 fill-primary text-primary" aria-hidden="true" />
      </div>
      <div className="min-w-0"><p className="text-xl font-black leading-none tabular-nums text-foreground">
        {rating.overall.toFixed(1)}<span className="text-xs font-semibold text-foreground/50">/5</span>
      </p></div>
    </div>
    <p className="text-[11px] font-bold leading-tight text-foreground sm:text-xs">
      <span className="block">Trusted by {trustLine}</span><span className="block">solo travelers</span>
    </p>
    <div className="flex items-center gap-1.5"><div className="flex -space-x-2">
      {rating.recentRaters.slice(0, 5).map(rater => <Link key={rater.userId} href={`/profile/${rater.username}`}
        className="relative inline-block rounded-full ring-2 ring-background/90 transition-all hover:z-10 hover:ring-primary/60 motion-reduce:transition-none"
        title={rater.full_name || rater.username}>
        <Avatar className="h-6 w-6 border-2 border-background sm:h-7 sm:w-7">
          <AvatarImage src={rater.avatar_url || ''} alt="" />
          <AvatarFallback className="bg-primary/20 text-[9px] font-bold text-primary">{getInitials(rater.full_name || rater.username)}</AvatarFallback>
        </Avatar>
      </Link>)}
    </div></div>
  </div>
}

export function WanderStatsGridSkeleton() {
  return <div aria-label="Loading travel stats" aria-busy="true" className="wander-frost-panel flex min-h-[5.25rem] w-full items-center gap-5 p-3">
    {[0, 1, 2].map(i => <div key={i} className="h-8 flex-1 animate-pulse rounded bg-foreground/10" />)}
  </div>
}

export async function WanderHeroStatsServer() {
  return <WanderStatsGrid stats={await getWanderStats()} />
}

export function WanderMobileStatsSkeleton() {
  return <div aria-label="Loading travel stats" aria-busy="true" className="flex min-w-0 flex-1 items-center gap-1.5">
    {[0, 1, 2].map(i => <div key={i} className="h-9 min-w-0 flex-1 animate-pulse rounded bg-foreground/10" />)}
  </div>
}

export async function WanderMobileStatsServer({ heroCopy }: { heroCopy: WanderHeroCopy }) {
  const stats = await getWanderStats()
  const statsSize = heroCopy.mobileFontMode === 'custom'
    ? heroCopy.mobileTypography.statsSize
    : heroCopy.desktopTypography.statsSize
  const valueStyle: CSSProperties | undefined = statsSize ? { fontSize: statsSize } : undefined
  const items = [
    { Icon: MapPin, value: `${stats.destinations}+`, label: 'Destinations' },
    { Icon: CreditCard, value: `${stats.bookings}+`, label: 'Bookings' },
    { Icon: Smile, value: `${stats.happyPercent}%`, label: 'Happy users' },
  ]
  return <div className="flex min-w-0 flex-1 items-center gap-1.5">
    {items.map(({ Icon, value, label }) => <div key={label} className="flex min-w-0 flex-1 items-center gap-1.5">
      <Icon className="h-5 w-5 shrink-0 text-primary" strokeWidth={1.85} aria-hidden="true" />
      <div className="min-w-0"><p className="text-base font-black leading-none tabular-nums text-foreground" style={valueStyle}>{value}</p>
        <p className="mt-0.5 truncate text-[10px] font-semibold leading-tight text-foreground/65">{label}</p></div>
    </div>)}
  </div>
}