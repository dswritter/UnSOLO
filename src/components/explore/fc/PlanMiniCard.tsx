import Link from 'next/link'
import { BadgeCheck, CalendarDays, Venus, Wallet } from 'lucide-react'
import type { Post } from '@/lib/tribe/models'
import { SeatRing, segsFromSeats } from '@/components/tribe/SeatRing'
import { dateRange, initials, nights } from '@/components/tribe/format'

/** Compact community-plan card (Explore aside / pager): organiser face in the middle of the plan ring. */
export function PlanMiniCard({ post: p, ringSize = 80 }: { post: Post; ringSize?: number }) {
  const { segs } = segsFromSeats(p.seats, { hostIsBadge: false })
  const taken = segs.filter((s) => s.state !== 'open').length
  const n = nights(p.startsOn, p.endsOn)
  const women = p.audience === 'women'
  return (
    <article className="pc-pencilled relative p-4">
      <Link href={`/tribe/p/${p.id}`} className="absolute inset-0 z-[1] rounded-[inherit]" aria-label={p.title ?? p.place?.name ?? 'Plan'} />
      <div className="flex items-center gap-2.5">
        <span className="pc-seat pc-seat-sm" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {p.author.avatarUrl ? <img src={p.author.avatarUrl} alt="" /> : initials(p.author.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1 text-[14px] font-bold">
            <span className="truncate">{p.author.name.split(' ')[0]}</span>
            {p.author.isIdVerified && <BadgeCheck className="h-4 w-4 shrink-0 text-[color:var(--pc-accent-ink)]" aria-label="ID verified" />}
          </span>
          <span className="block text-[12.5px] text-muted-foreground">Plan · looking for people</span>
        </span>
        {women && <span className="pc-tag pc-tag-women"><Venus className="h-3 w-3" aria-hidden />Women only</span>}
      </div>
      <h3 className="mt-2.5 line-clamp-2 text-[18px] leading-snug">{p.title ?? p.place?.name}</h3>
      <div className="mt-3 flex items-center gap-3.5">
        <SeatRing segs={segs} size={ringSize} variant="plan" women={women} photo={p.author.avatarUrl} showDots={false}
          center={p.author.avatarUrl ? undefined : { big: initials(p.author.name), fontSize: ringSize * 0.24 }} />
        <div className="min-w-0 flex-1 space-y-1.5 text-[13px]">
          {p.startsOn && <p className="flex items-center gap-1.5 font-semibold"><CalendarDays className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />{dateRange(p.startsOn, p.endsOn)}{n ? ` · ${n}N` : ''}</p>}
          {p.estCostText && <p className="flex items-center gap-1.5 text-muted-foreground"><Wallet className="h-3.5 w-3.5" aria-hidden /><span className="truncate">{p.estCostText.replace(/^Est\.\s*/i, '~')}</span></p>}
          <p className="fc-caption text-[13px]"><strong>{taken} going</strong> · {Math.max((p.spotsTotal ?? segs.length) - taken, 0)} spots</p>
          <span className="pc-btn pc-btn-sm pc-btn-outline mt-1">Request to join</span>
        </div>
      </div>
    </article>
  )
}
