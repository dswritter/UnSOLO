import Link from 'next/link'
import type { ReactNode } from 'react'
import { BadgeCheck, CalendarDays, ChartBar, Clock3, MapPin, MessageCircleQuestionMark, Venus, Wallet } from 'lucide-react'
import type { Post, TripLite, UserLite } from '@/lib/tribe/models'
import { cn } from '@/lib/utils'
import { ProgressiveImage } from './ProgressiveImage'
import { ReactionBar } from './ReactionBar'
import { PollOptions } from './PollCard'
import { MiniArc, SeatRing, segsFromSeats, type RingSeg } from './SeatRing'
import { ago, dateRange, initials, nights, rupees } from './format'

export function Avatar({ user, size = 36, className }: { user: UserLite; size?: number; className?: string }) {
  return (
    <span className={cn('fc-av', className)} style={{ width: size, height: size, fontSize: Math.max(10, size * 0.34) }} aria-hidden>
      {user.avatarUrl
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={user.avatarUrl} alt="" loading="lazy" decoding="async" />
        : initials(user.name)}
    </span>
  )
}

/** Author row: face, name + verified tick, a sub line, and optional trailing content (tag, menu). */
export function AuthorRow({ user, sub, extra, trailing, size = 36 }: { user: UserLite; sub: ReactNode; extra?: ReactNode; trailing?: ReactNode; size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <Link href={`/profile/${user.username}`} tabIndex={-1} aria-hidden className="shrink-0"><Avatar user={user} size={size} /></Link>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <Link href={`/profile/${user.username}`} className="truncate text-[14.5px] font-bold hover:underline">{user.name}</Link>
          {user.isIdVerified && <BadgeCheck className="h-4 w-4 shrink-0 fill-[color:var(--pc-pine)] text-[color:var(--pc-raised)]" aria-label="ID verified" />}
          {extra}
        </div>
        <div className="truncate text-[12.5px] text-[color:var(--pc-ink3)]">{sub}</div>
      </div>
      {trailing}
    </div>
  )
}

/** Plan seats → ring segments, with faces only for co-travellers (initials for other signed-in viewers). */
export function planRing(post: Post, signedIn: boolean) {
  const { segs, waiting } = segsFromSeats(post.seats, { hostIsBadge: false })
  const coTraveller = post.viewer.isAuthor || post.viewer.membership === 'approved'
  const shown: RingSeg[] = coTraveller ? segs : segs.map((s) => (s.user && s.state === 'taken' ? { ...s, user: { ...s.user, avatarUrl: null } } : s))
  const taken = segs.filter((s) => s.state !== 'open').length
  return { segs: shown, waiting, taken, showDots: signedIn, women: post.audience === 'women' }
}

export function PlanFacts({ post, className }: { post: Post; className?: string }) {
  const n = nights(post.startsOn, post.endsOn)
  return (
    <div className={cn('fc-facts', className)}>
      {post.startsOn && <span><CalendarDays aria-hidden />{dateRange(post.startsOn, post.endsOn)}</span>}
      {n ? <span><Clock3 aria-hidden />{n} {n === 1 ? 'night' : 'nights'}</span> : null}
      {post.estCostText && <span><Wallet aria-hidden />{post.estCostText.replace(/^Est\.\s*/i, '~')}</span>}
      {post.place && <span><MapPin aria-hidden />{post.place.name}</span>}
    </div>
  )
}

export function WomenTag() {
  return <span className="pc-tag pc-tag-women shrink-0"><Venus className="h-3 w-3" aria-hidden />Women only</span>
}

/** The plan's primary action as shown on cards (detail pages render their own bottom bar). */
function PlanCardAction({ post, signedIn }: { post: Post; signedIn: boolean }) {
  const first = post.author.name.split(' ')[0]
  if (post.viewer.isAuthor) return <Link href={`/tribe/p/${post.id}`} className="pc-btn pc-btn-sm pc-btn-quiet self-start">Your plan · manage</Link>
  if (post.viewer.membership === 'requested') {
    return <Link href={`/tribe/p/${post.id}`} className="pc-btn pc-btn-sm pc-btn-quiet self-start"><Clock3 className="h-4 w-4" aria-hidden />Requested · waiting</Link>
  }
  if (post.viewer.membership === 'approved') return <Link href={`/tribe/p/${post.id}`} className="pc-btn pc-btn-sm pc-btn-outline self-start">You’re in · open plan</Link>
  const reason = post.viewer.joinBlockedReason
  if (reason === 'full') return <span className="pc-btn pc-btn-sm pc-btn-quiet self-start" aria-disabled="true">Plan is full</span>
  if (reason === 'closed') return <span className="pc-btn pc-btn-sm pc-btn-quiet self-start" aria-disabled="true">Plan closed</span>
  return (
    <Link href={signedIn ? `/tribe/p/${post.id}?join=1` : `/login?redirectTo=${encodeURIComponent(`/tribe/p/${post.id}?join=1`)}`}
      className="pc-btn pc-btn-sm self-start" aria-label={`Request to join ${first}'s plan`}>
      Request to join
    </Link>
  )
}

/** Community plan: pencilled card, organiser face in the middle of a loose circle of spots, Request to join. */
export function PlanCard({ post, signedIn, demo, ringSize = 112, compact }: { post: Post; signedIn: boolean; demo?: boolean; ringSize?: number; compact?: boolean }) {
  const r = planRing(post, signedIn)
  const total = r.segs.length
  return (
    <article className="pc-pencilled fc-post">
      <AuthorRow user={post.author} sub="Plan · looking for people" extra={<span className="shrink-0 text-[12.5px] text-[color:var(--pc-ink3)]">· {ago(post.createdAt)}</span>}
        trailing={r.women ? <WomenTag /> : post.audience === 'verified' ? <span className="pc-tag pc-tag-verified shrink-0">Verified only</span> : null} />
      <Link href={`/tribe/p/${post.id}`} className="block">
        <h3 className="fc-post-title">{post.title ?? post.place?.name}</h3>
        {!compact && <p className="fc-post-body line-clamp-3">{post.body}</p>}
      </Link>
      <div className="mt-3 flex items-center gap-3.5">
        <Link href={`/tribe/p/${post.id}`} tabIndex={-1} className="shrink-0">
          <SeatRing segs={r.segs} size={ringSize} variant="plan" women={r.women} photo={post.author.avatarUrl} showDots={r.showDots && ringSize >= 100}
            center={post.author.avatarUrl ? undefined : { big: initials(post.author.name), fontSize: ringSize * 0.24 }} />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <PlanFacts post={{ ...post, place: compact ? post.place : null }} />
          <p className="fc-caption text-[13px]">{total > 0 ? <><strong>{r.taken} going</strong> · {Math.max(total - r.taken, 0)} {total - r.taken === 1 ? 'spot' : 'spots'}</> : null}</p>
          <PlanCardAction post={post} signedIn={signedIn} />
        </div>
      </div>
      {!compact && <div className="mt-2"><ReactionBar post={post} signedIn={signedIn} demo={demo} compact /></div>}
    </article>
  )
}

/** "Next departure · 3 seats left · Take a seat" under a story about a hosted trip. */
export function TripLinkCard({ trip, className }: { trip: TripLite; className?: string }) {
  const total = trip.seatsTotal ?? 0
  const left = trip.seatsLeft
  return (
    <Link href={`/packages/${trip.slug}`} className={cn('fc-linkcard', className)}>
      {total > 0 && left != null ? <MiniArc total={total} taken={total - left} /> : null}
      <span className="min-w-0 flex-1">
        <b className="block truncate">{trip.nextDeparture ? `Next departure · ${dateRange(trip.nextDeparture, null)}` : trip.title}</b>
        <span className="fc-linkcard-sub line-clamp-2">
          {left != null ? (left === 0 ? 'Full · ' : `${left} ${left === 1 ? 'seat' : 'seats'} left · `) : ''}{rupees(trip.priceFromPaise)} · {trip.title}
        </span>
      </span>
      <span className="fc-linkcard-go">Take a seat →</span>
    </Link>
  )
}

/** Story: photo first, then the words; a linked departure if it was an UnSOLO trip. */
export function StoryCard({ post, signedIn, demo, priority }: { post: Post; signedIn: boolean; demo?: boolean; priority?: boolean }) {
  const sub = ['Story', post.place?.name, ago(post.createdAt)].filter(Boolean).join(' · ')
  return (
    <article className="pc-card fc-story">
      <div className="px-4 pb-2.5 pt-3.5"><AuthorRow user={post.author} sub={sub} /></div>
      {post.media.length > 0 && (
        <Link href={`/tribe/p/${post.id}`} className="fc-story-media aspect-[4/3]" aria-label={post.title ?? `Story by ${post.author.name}`}>
          <ProgressiveImage media={post.media[0]} alt={post.title ?? 'Story photo'} className="h-full w-full" priority={priority} />
          {post.media.length > 1 && <span className="fc-story-count">1/{post.media.length}</span>}
        </Link>
      )}
      <div className="px-4 pb-2 pt-3">
        <Link href={`/tribe/p/${post.id}`} className="block">
          {post.title && <h3 className="text-[18px] leading-tight">{post.title}</h3>}
          <p className={cn('fc-post-body is-ink line-clamp-4', post.title && 'mt-1')}>{post.body}</p>
        </Link>
        {post.trip && <TripLinkCard trip={post.trip} className="mt-3" />}
        <div className="mt-1.5"><ReactionBar post={post} signedIn={signedIn} demo={demo} /></div>
      </div>
    </article>
  )
}

/** Question, or poll when the ask carries options. */
export function AskCard({ post, signedIn, demo }: { post: Post; signedIn: boolean; demo?: boolean }) {
  const isPoll = !!post.poll
  return (
    <article className="pc-card fc-post">
      <AuthorRow user={post.author} sub={`${isPoll ? 'Poll' : 'Question'} · ${ago(post.createdAt)}${post.place ? ` · ${post.place.name}` : ''}`}
        extra={<span className="pc-tag pc-tag-verified fc-tag-sm shrink-0">{isPoll ? <ChartBar className="h-3 w-3" aria-hidden /> : <MessageCircleQuestionMark className="h-3 w-3" aria-hidden />}{isPoll ? 'Poll' : 'Question'}</span>} />
      <Link href={`/tribe/p/${post.id}`} className="block"><h3 className="fc-post-title">{post.body}</h3></Link>
      {post.poll && <PollOptions post={post} signedIn={signedIn} demo={demo} />}
      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1"><ReactionBar post={post} signedIn={signedIn} demo={demo} showSave={false} /></div>
        {!isPoll && <Link href={`/tribe/p/${post.id}#comments`} className="pc-btn pc-btn-sm pc-btn-quiet shrink-0">Answer</Link>}
      </div>
    </article>
  )
}

/** Hosted departure row (feed "placed trip", caught-up list): photo, mini arc, price. */
export function TripStub({ trip, placed }: { trip: TripLite; placed?: boolean }) {
  const total = trip.seatsTotal ?? 0
  const left = trip.seatsLeft
  return (
    <Link href={`/packages/${trip.slug}`} className={cn('pc-card flex items-center gap-3 p-2.5 pr-4 transition-colors hover:border-[color:var(--pc-rule2)]', !placed && 'mt-0')}>
      <span className="fc-av h-14 w-14 rounded-2xl">
        {trip.image ? <ProgressiveImage media={trip.image} alt="" className="h-full w-full" /> : <MapPin className="h-5 w-5 text-[color:var(--pc-pine)]" aria-hidden />}
      </span>
      <span className="min-w-0 flex-1">
        {placed && <span className="pc-tag pc-tag-hosted fc-tag-sm mb-1">Hosted trip</span>}
        <b className="block truncate text-[15px]">{trip.title}</b>
        <span className="block truncate text-[13px] text-muted-foreground">
          {[trip.nextDeparture ? dateRange(trip.nextDeparture, null) : null, `${trip.durationDays}D`, trip.place?.name?.split(',')[0]].filter(Boolean).join(' · ')}
        </span>
      </span>
      {total > 0 && left != null && <MiniArc total={total} taken={total - left} />}
      <span className="shrink-0 text-right">
        <span className="pc-price block text-[17px]">{rupees(trip.priceFromPaise)}</span>
        {left != null && <span className="block text-[12px] text-muted-foreground">{left === 0 ? 'Full' : `${left} open`}</span>}
      </span>
    </Link>
  )
}

export function PostCard({ post, signedIn, demo, priority }: { post: Post; signedIn: boolean; demo?: boolean; priority?: boolean }) {
  if (post.kind === 'plan') return <PlanCard post={post} signedIn={signedIn} demo={demo} />
  if (post.kind === 'ask') return <AskCard post={post} signedIn={signedIn} demo={demo} />
  return <StoryCard post={post} signedIn={signedIn} demo={demo} priority={priority} />
}

