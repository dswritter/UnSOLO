import Link from 'next/link'
import { Armchair, BadgeCheck, CalendarDays } from 'lucide-react'
import type { TripLite } from '@/lib/tribe/models'
import { cn } from '@/lib/utils'
import { MiniArc, SeatRing, segsFromCounts } from '@/components/tribe/SeatRing'
import { rupees } from '@/components/tribe/format'

function dayParts(iso: string | null) {
  if (!iso) return null
  const d = new Date(`${iso}T00:00:00Z`)
  return {
    dd: d.toLocaleDateString('en-IN', { day: '2-digit', timeZone: 'UTC' }),
    mon: d.toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' }),
    dow: d.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' }),
  }
}

const tripImage = (t: TripLite) => t.image?.thumbUrl ?? t.image?.url ?? null

function seatLine(t: TripLite) {
  const n = t.seatsTotal ?? 0
  const left = t.seatsLeft ?? n
  const k = n - left
  if (n === 0) return null
  if (k <= 0) return <><strong>Be first in the circle</strong></>
  if (left <= 0) return <><strong>Full</strong> · {n}/{n}</>
  return <><strong>{k} going</strong> · {left} of {n} open</>
}

/**
 * Photo-first departure card: the trip photo leads, the seat ring overlaps its bottom edge with the
 * open-seat count in the middle. Whole card is one link; "Take a seat" is the visual CTA.
 */
export function TripRingCard({ trip: t, ringSize = 88, className, priority }: { trip: TripLite; ringSize?: number; className?: string; priority?: boolean }) {
  const n = t.seatsTotal ?? 0
  const left = t.seatsLeft ?? n
  const full = n > 0 && left <= 0
  const d = dayParts(t.nextDeparture)
  const img = tripImage(t)
  return (
    <article className={cn('fc-tcard group relative', className)}>
      <Link href={`/packages/${t.slug}`} className="absolute inset-0 z-[1] rounded-[inherit]" aria-label={`${t.title}${d ? `, leaves ${d.dow} ${d.dd} ${d.mon}` : ''}`} />
      <div className="fc-tcard-photo">
        {img
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={img} alt="" loading={priority ? 'eager' : 'lazy'} decoding="async" />
          : <span className="fc-tcard-wash" aria-hidden>{t.place?.name ?? t.title}</span>}
        {d && <span className="fc-datechip"><b>{d.dd}</b><span>{d.mon}</span></span>}
        {full && <span className="fc-fullchip">Full circle</span>}
      </div>
      <div className="fc-tcard-main">
        {n > 0 && (
          <SeatRing segs={segsFromCounts(n, left)} size={ringSize} showDots={false}
            center={full ? { big: `${n}/${n}`, small: 'full', fontSize: ringSize * 0.22 } : { big: String(left), small: left === 1 ? 'seat left' : 'seats left', fontSize: ringSize * 0.27, icon: <Armchair /> }} className="fc-tcard-ring" />
        )}
        <div className="min-w-0 flex-1 pt-11">
          <h3 className="truncate text-[19px] leading-tight">{t.title}</h3>
          <p className="truncate text-[13.5px] text-muted-foreground">{t.durationDays}D/{Math.max(t.durationDays - 1, 0)}N · {t.place?.name ?? 'India'}</p>
        </div>
      </div>
      <div className="px-4 pb-4 pt-2.5">
        <div className="flex items-center justify-between gap-2">
          {t.host
            ? <span className="pc-tag pc-tag-verified min-w-0"><BadgeCheck className="h-3.5 w-3.5 shrink-0" aria-hidden /><span className="truncate">{t.host.name}</span></span>
            : <span className="pc-tag pc-tag-hosted">UnSOLO trip</span>}
          <span className="fc-caption shrink-0 text-[13px]">{seatLine(t)}</span>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="pc-price">{rupees(t.priceFromPaise)}<small>/person</small></span>
          <span className="pc-btn pc-btn-sm pc-btn-quiet">{full ? 'Notify me' : 'Take a seat'}</span>
        </div>
      </div>
    </article>
  )
}

/** "This month" list row: thumbnail, title + date, mini arc, price. */
export function TripListRow({ trip: t }: { trip: TripLite }) {
  const n = t.seatsTotal ?? 0
  const left = t.seatsLeft ?? n
  const d = dayParts(t.nextDeparture)
  const img = tripImage(t)
  return (
    <Link href={`/packages/${t.slug}`} className="fc-lrow">
      <span className="fc-lrow-thumb">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {img ? <img src={img} alt="" loading="lazy" decoding="async" /> : <CalendarDays className="h-5 w-5 text-muted-foreground" aria-hidden />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-bold">{t.title}</span>
        <span className="block truncate text-[13px] text-muted-foreground">{d ? `${d.dow} ${Number(d.dd)} ${d.mon}` : ''} · {t.durationDays}D · {(t.place?.name ?? '').split(',')[0]}</span>
      </span>
      {n > 0 && <MiniArc total={n} taken={n - left} />}
      <span className="w-[84px] shrink-0 text-right">
        <span className="pc-price block text-[16px]">{rupees(t.priceFromPaise)}</span>
        <span className="block text-[12px] font-semibold text-muted-foreground">{n === 0 ? '' : left <= 0 ? 'Full' : `${left} open`}</span>
      </span>
    </Link>
  )
}
