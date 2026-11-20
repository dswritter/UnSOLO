import Link from 'next/link'
import { CalendarDays, MapPin, ShieldCheck } from 'lucide-react'
import type { Post, TripLite, UserLite } from '@/lib/tribe/models'
import { cn } from '@/lib/utils'
import { SeatRow } from './SeatRow'
import { ProgressiveImage } from './ProgressiveImage'
import { ReactionBar } from './ReactionBar'
import { ago, dateRange, initials, nights, rupees } from './format'

export function Avatar({ user, size = 36 }: { user: UserLite; size?: number }) {
  return (
    <span className="pc-seat shrink-0" style={{ ['--s' as string]: `${size}px` }} aria-hidden>
      {user.avatarUrl
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={user.avatarUrl} alt="" loading="lazy" decoding="async" />
        : initials(user.name)}
    </span>
  )
}

function Byline({ post }: { post: Post }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar user={post.author} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link href={`/profile/${post.author.username}`} className="truncate font-semibold hover:underline">{post.author.name}</Link>
          {post.author.isIdVerified && <ShieldCheck className="h-4 w-4 shrink-0 text-[color:var(--pc-green)]" aria-label="ID verified" />}
          {post.kind === 'plan' && <span className="pc-tag pc-tag-organiser">Organiser</span>}
        </div>
        <div className="text-[13px] text-muted-foreground">
          {post.kind === 'plan' ? 'Plan' : post.kind === 'story' ? 'Story' : 'Ask'} · {ago(post.createdAt)}
          {post.place ? ` · ${post.place.name}` : ''}
        </div>
      </div>
    </div>
  )
}

/** Community plan: pencilled (dashed), never priced, outline "Ask to join". */
export function PlanCard({ post, signedIn, demo }: { post: Post; signedIn: boolean; demo?: boolean }) {
  const open = (post.spotsTotal ?? 0) - post.memberCount
  const n = nights(post.startsOn, post.endsOn)
  return (
    <article className="pc-pencilled p-4 sm:p-5">
      <p className="pc-kicker mb-3">Community plan · not a booking{post.audience === 'women' ? ' · women only' : post.audience === 'verified' ? ' · verified only' : ''}</p>
      <Byline post={post} />
      <Link href={`/tribe/p/${post.id}`} className="mt-3 block">
        <h3 className="text-[22px] leading-tight">{post.title ?? post.place?.name}</h3>
        <dl className="mt-3 grid grid-cols-3 gap-0 border-y border-dashed border-[color:var(--pc-rule2)] py-2.5 text-sm">
          <div><dt className="text-xs text-muted-foreground">Where</dt><dd className="truncate font-medium"><MapPin className="mr-1 inline h-3.5 w-3.5" aria-hidden />{post.place?.name}</dd></div>
          <div><dt className="text-xs text-muted-foreground">When</dt><dd className="font-medium"><CalendarDays className="mr-1 inline h-3.5 w-3.5" aria-hidden />{dateRange(post.startsOn, post.endsOn)}{n ? <span className="pc-mono text-muted-foreground"> · {n}N</span> : null}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Spots</dt><dd className="pc-mono font-semibold">{Math.max(open, 0)} of {post.spotsTotal}</dd></div>
        </dl>
        <p className="mt-3 line-clamp-3 text-[15px] leading-relaxed text-foreground/90">{post.body}</p>
        {post.estCostText && <p className="mt-2 text-sm text-muted-foreground">{post.estCostText}</p>}
      </Link>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <SeatRow seats={post.seats} size="sm" />
        {post.viewer.membership === 'requested' ? (
          <span className="pc-kicker">Request sent · waiting for {post.author.name.split(' ')[0]}</span>
        ) : post.viewer.membership === 'approved' && !post.viewer.isAuthor ? (
          <span className="pc-kicker">You&apos;re in</span>
        ) : !post.viewer.isAuthor ? (
          <Link href={`/tribe/p/${post.id}?join=1`} className="pc-btn pc-btn-outline pc-btn-sm" aria-disabled={!post.viewer.canJoin && signedIn}>
            {post.viewer.joinBlockedReason === 'full' ? 'Plan is full' : 'Ask to join'}
          </Link>
        ) : null}
      </div>
      <div className="mt-4 border-t border-dashed border-[color:var(--pc-rule2)] pt-3">
        <ReactionBar post={post} signedIn={signedIn} demo={demo} compact />
      </div>
    </article>
  )
}

export function StoryCard({ post, signedIn, demo, priority }: { post: Post; signedIn: boolean; demo?: boolean; priority?: boolean }) {
  return (
    <article className="pc-surface overflow-hidden">
      {post.media.length > 0 && (
        <Link href={`/tribe/p/${post.id}`} className={cn('grid gap-0.5', post.media.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
          {post.media.slice(0, 4).map((m, i) => (
            <ProgressiveImage key={i} media={m} alt={post.title ?? 'Story photo'} className={cn(post.media.length === 1 ? 'aspect-[4/3]' : 'aspect-square')} priority={priority && i === 0} />
          ))}
        </Link>
      )}
      <div className="p-4 sm:p-5">
        <Byline post={post} />
        <Link href={`/tribe/p/${post.id}`} className="mt-3 block">
          {post.title && <h3 className="text-xl leading-tight">{post.title}</h3>}
          <p className="mt-1.5 line-clamp-4 text-[15px] leading-relaxed text-foreground/90">{post.body}</p>
        </Link>
        {post.trip && <TripStub trip={post.trip} />}
        <div className="mt-4"><ReactionBar post={post} signedIn={signedIn} demo={demo} /></div>
      </div>
    </article>
  )
}

export function AskCard({ post, signedIn, demo }: { post: Post; signedIn: boolean; demo?: boolean }) {
  const total = post.poll?.options.reduce((s, o) => s + o.votes, 0) ?? 0
  return (
    <article className="pc-surface p-4 sm:p-5">
      <Byline post={post} />
      <Link href={`/tribe/p/${post.id}`} className="mt-3 block">
        <h3 className="text-xl leading-snug">{post.body}</h3>
      </Link>
      {post.poll && (
        <ul className="mt-3 space-y-2">
          {post.poll.options.map((o) => {
            const pct = total ? Math.round((o.votes / total) * 100) : 0
            return (
              <li key={o.id} className="relative overflow-hidden rounded-md border border-border">
                <span className="absolute inset-y-0 left-0 bg-[color:var(--pc-ink)]/10" style={{ width: `${pct}%` }} aria-hidden />
                <span className="relative flex items-center justify-between px-3 py-2.5 text-sm">
                  <span className={cn(post.poll?.myChoice === o.id && 'font-semibold')}>{o.label}</span>
                  <span className="pc-mono text-muted-foreground">{pct}%</span>
                </span>
              </li>
            )
          })}
          <li className="text-xs text-muted-foreground">{total} {total === 1 ? 'vote' : 'votes'} · answers from people who have been there</li>
        </ul>
      )}
      <div className="mt-4"><ReactionBar post={post} signedIn={signedIn} demo={demo} /></div>
    </article>
  )
}

/** Printed (solid) hosted-trip stub — priced, ink "Take a seat". */
export function TripStub({ trip, placed }: { trip: TripLite; placed?: boolean }) {
  return (
    <div className={cn('pc-printed mt-4 flex items-stretch gap-0 overflow-hidden', placed && 'mt-0')}>
      {trip.image && <ProgressiveImage media={trip.image} alt="" className="w-28 shrink-0 sm:w-36" />}
      <div className="min-w-0 flex-1 p-3">
        <span className="pc-tag pc-tag-hosted">Hosted trip · bookable</span>
        <Link href={`/packages/${trip.slug}`} className="mt-1.5 block truncate font-semibold hover:underline">{trip.title}</Link>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
          {trip.nextDeparture && <span>Next {dateRange(trip.nextDeparture, null)}</span>}
          {trip.seatsLeft != null && <span className="pc-mono">{trip.seatsLeft} seats left</span>}
          <span>{trip.durationDays}D</span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="pc-mono text-[15px] font-semibold">{rupees(trip.priceFromPaise)}</span>
          <Link href={`/packages/${trip.slug}`} className="pc-btn pc-btn-sm">Take a seat</Link>
        </div>
      </div>
    </div>
  )
}

export function PostCard({ post, signedIn, demo, priority }: { post: Post; signedIn: boolean; demo?: boolean; priority?: boolean }) {
  if (post.kind === 'plan') return <PlanCard post={post} signedIn={signedIn} demo={demo} />
  if (post.kind === 'ask') return <AskCard post={post} signedIn={signedIn} demo={demo} />
  return <StoryCard post={post} signedIn={signedIn} demo={demo} priority={priority} />
}
