import Link from 'next/link'
import { BedDouble, MessageCircle, Mountain, Star, Users } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent } from '@/components/ui/card'
import { cn, getInitials } from '@/lib/utils'
import type { MiniProfile } from '@/lib/profile/connections'
import { loadHostConnections, loadViewerRelation } from './profileConnections'
import type { ProfileSectionContext } from './ProfileSections'

function displayName(p: MiniProfile) {
  return p.full_name || p.username
}

function PersonChip({ person, note }: { person: MiniProfile; note?: string }) {
  const name = displayName(person)
  return (
    <Link
      href={`/profile/${person.username}`}
      className="flex min-w-0 items-center gap-2.5 rounded-xl border border-border/70 p-2 pr-3 transition-colors hover:border-primary/40 hover:bg-secondary/30"
    >
      <Avatar className="h-8 w-8 shrink-0">
        {person.avatar_url ? <AvatarImage src={person.avatar_url} alt="" /> : null}
        <AvatarFallback className="bg-primary/15 text-[11px] font-bold text-primary">{getInitials(name)}</AvatarFallback>
      </Avatar>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium leading-tight">{name}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{note ?? `@${person.username}`}</span>
      </span>
    </Link>
  )
}

function Block({ title, meta, children }: { title: string; meta?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        {meta ? <span className="text-xs text-muted-foreground">{meta}</span> : null}
      </div>
      {children}
    </div>
  )
}

function Stars({ rating, className }: { rating: number; className?: string }) {
  return (
    <span className={cn('flex shrink-0 gap-0.5', className)} aria-label={`${rating} out of 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={cn('h-3 w-3', i < rating ? 'fill-primary text-primary' : 'text-muted-foreground/40')} aria-hidden="true" />
      ))}
    </span>
  )
}

/**
 * Who this person is connected to: mutual follows, shared groups and trips
 * (relative to the viewer) and, for hosts, the travellers they've hosted and
 * the reviews those travellers left.
 */
export async function ProfileConnections({ ctx }: { ctx: ProfileSectionContext }) {
  const showRelation = Boolean(ctx.viewerUserId && !ctx.isOwnProfile)
  const [relation, host] = await Promise.all([
    showRelation ? loadViewerRelation(ctx.profileId, ctx.viewerUserId!).catch(() => null) : Promise.resolve(null),
    loadHostConnections(ctx.profileId, ctx.isOwnProfile).catch(() => null),
  ])

  const blocks: React.ReactNode[] = []

  if (relation?.mutual.length) {
    blocks.push(
      <Block key="mutual" title="Mutual connections" meta={relation.mutualCount > relation.mutual.length ? `+${relation.mutualCount - relation.mutual.length} more` : null}>
        <div className="grid gap-2 sm:grid-cols-2">
          {relation.mutual.map(p => <PersonChip key={p.id} person={p} />)}
        </div>
      </Block>,
    )
  }

  if (relation?.shared.length) {
    blocks.push(
      <Block key="shared" title="Trips & stays in common">
        <ul className="grid gap-2 sm:grid-cols-2">
          {relation.shared.map(s => {
            const Icon = s.kind === 'trip' ? Mountain : BedDouble
            return (
              <li key={`${s.kind}-${s.id}`}>
                <Link href={s.href} className="flex items-center gap-3 rounded-xl border border-border/70 p-2.5 transition-colors hover:border-primary/40 hover:bg-secondary/30">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{s.title}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {s.hostedByProfile ? `Hosted by ${ctx.first} · you booked` : 'You both booked this'}
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </Block>,
    )
  }

  if (relation?.rooms.length) {
    blocks.push(
      <Block key="rooms" title="Groups you share">
        <div className="flex flex-wrap gap-2">
          {relation.rooms.map(r => (
            <Link
              key={r.id}
              href={`/community/${r.id}`}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary/40 hover:bg-secondary/30"
            >
              <MessageCircle className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
              <span className="truncate">{r.name}</span>
            </Link>
          ))}
        </div>
      </Block>,
    )
  }

  if (host?.travellers.length) {
    blocks.push(
      <Block
        key="travellers"
        title={ctx.isOwnProfile ? 'Travellers you hosted' : `Travellers ${ctx.first} hosted`}
        meta={host.travellerCount > host.travellers.length ? `${host.travellerCount} total` : null}
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {host.travellers.map(p => <PersonChip key={p.id} person={p} note="Booked" />)}
        </div>
      </Block>,
    )
  }

  if (host?.contacts.length) {
    blocks.push(
      <Block key="contacts" title="Reached out to you" meta="Only you can see this">
        <div className="grid gap-2 sm:grid-cols-2">
          {host.contacts.map(p => <PersonChip key={p.id} person={p} note="Messaged you" />)}
        </div>
      </Block>,
    )
  }

  if (host?.reviews.length) {
    blocks.push(
      <Block
        key="reviews"
        title="Reviews from travellers"
        meta={host.reviewAverage != null ? (
          <span className="inline-flex items-center gap-1 font-semibold text-foreground">
            <Star className="h-3.5 w-3.5 fill-primary text-primary" aria-hidden="true" />
            {host.reviewAverage.toFixed(1)}
            <span className="font-normal text-muted-foreground">· {host.reviewTotal}</span>
          </span>
        ) : null}
      >
        <ul className="divide-y divide-border/60">
          {host.reviews.map(r => {
            const reviewer = r.reviewer
            const name = reviewer ? displayName(reviewer) : 'Traveller'
            return (
              <li key={r.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                {reviewer ? (
                  <Link href={`/profile/${reviewer.username}`} className="shrink-0" aria-label={name}>
                    <Avatar className="h-8 w-8">
                      {reviewer.avatar_url ? <AvatarImage src={reviewer.avatar_url} alt="" /> : null}
                      <AvatarFallback className="bg-primary/15 text-[11px] font-bold text-primary">{getInitials(name)}</AvatarFallback>
                    </Avatar>
                  </Link>
                ) : (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary">
                    <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    {reviewer ? (
                      <Link href={`/profile/${reviewer.username}`} className="truncate text-sm font-medium hover:underline">{name}</Link>
                    ) : (
                      <span className="truncate text-sm font-medium">{name}</span>
                    )}
                    <Stars rating={r.rating} />
                  </div>
                  {r.subject ? (
                    r.href ? (
                      <Link href={r.href} className="block truncate text-[11px] text-muted-foreground hover:text-primary">{r.subject}</Link>
                    ) : (
                      <span className="block truncate text-[11px] text-muted-foreground">{r.subject}</span>
                    )
                  ) : null}
                  {r.body ? <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{r.body}</p> : null}
                </div>
              </li>
            )
          })}
        </ul>
      </Block>,
    )
  }

  if (blocks.length === 0) return null

  return (
    <Card className="bg-card border-border py-0">
      <CardContent className="p-5">
        <h2 className="mb-4 flex items-center gap-2 font-bold">
          <Users className="h-4 w-4 text-primary" /> Connections
        </h2>
        <div className="divide-y divide-border/60">{blocks}</div>
      </CardContent>
    </Card>
  )
}

/** Subtle closing rule so the page has a clear end. */
export function ProfileEndSeparator({ username }: { username: string }) {
  return (
    <div className="mt-10 flex items-center gap-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70" role="separator">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-border" />
      <span>End of @{username}&apos;s profile</span>
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-border" />
    </div>
  )
}
