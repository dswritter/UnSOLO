import Image from 'next/image'
import Link from 'next/link'
import { BadgeCheck, CalendarDays } from 'lucide-react'
import type { TripLite } from '@/lib/tribe/models'
import { cn } from '@/lib/utils'
import { isOptimizableImageUrl } from '@/lib/images/isOptimizableImageUrl'
import { LowResUnderlay } from '@/components/ui/LowResUnderlay'
import { MiniArc, SeatRing, segsFromCounts, spotsCenter } from '@/components/tribe/SeatRing'
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
const fullImage = (t: TripLite) => t.image?.url ?? t.image?.thumbUrl ?? null
const CARD_SIZES = '(min-width: 1536px) 17vw, (min-width: 1280px) 20vw, (min-width: 1024px) 25vw, (min-width: 768px) 33vw, 80vw'

function seatLine(t: TripLite) {
  const n = t.seatsTotal ?? 0
  const left = t.seatsLeft ?? n
  const k = n - left
  if (n === 0) return null
  if (k <= 0) return <><strong>Be first in the circle</strong></>
  if (left <= 0) return <><strong>Full</strong> · {n}/{n}</>
  return <><strong>{k} going</strong></>
}

/**
 * Photo-first departure card: the trip photo leads, the seat ring overlaps its bottom edge with the
 * open-seat count in the middle. Whole card is one link; "Take a seat" is the visual CTA.
 */
export function TripRingCard({ trip: t, ringSize = 72, className, priority }: { trip: TripLite; ringSize?: number; className?: string; priority?: boolean }) {
  const n = t.seatsTotal ?? 0
  const left = t.seatsLeft ?? n
  const full = n > 0 && left <= 0
  const d = dayParts(t.nextDeparture)
  const photo = fullImage(t)
  return (
    <article className={cn('fc-tcard group relative', className)}>
      <Link href={`/packages/${t.slug}`} className="absolute inset-0 z-[1] rounded-[inherit]" aria-label={`${t.title}${d ? `, leaves ${d.dow} ${d.dd} ${d.mon}` : ''}`} />
      <div className="fc-tcard-photo">
        {photo
          ? <>
              {/* Thumb paints at once; the resized full photo covers it when it arrives. */}
              <LowResUnderlay src={photo} low={t.image?.thumbUrl} eager={priority} />
              <Image src={photo} alt="" fill sizes={CARD_SIZES} priority={priority} unoptimized={!isOptimizableImageUrl(photo)} className="object-cover" />
            </>
          : <span className="fc-tcard-wash" aria-hidden>{t.place?.name ?? t.title}</span>}
        {d && <span className="fc-datechip"><b>{d.dd}</b><span>{d.mon}</span></span>}
        {full && <span className="fc-fullchip">Full circle</span>}
      </div>
      <div className="fc-tcard-main">
        {n > 0 && (
          <SeatRing segs={segsFromCounts(n, left)} size={ringSize} showDots={false}
            center={spotsCenter(n, left, ringSize * 0.27)} className="fc-tcard-ring" />
        )}
        <div className="min-w-0 flex-1 pt-9">
          <h3 className="line-clamp-2 text-[15px] leading-tight" title={t.title}>{t.title}</h3>
          <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">{t.durationDays}D/{Math.max(t.durationDays - 1, 0)}N · {t.place?.name ?? 'India'}</p>
        </div>
      </div>
      <div className="px-3.5 pb-3.5 pt-2">
        <div className="flex items-center justify-between gap-2">
          {t.host
            ? <span className="pc-tag pc-tag-verified min-w-0 shrink"><BadgeCheck className="h-3.5 w-3.5 shrink-0" aria-hidden /><span className="truncate">{t.host.name}</span></span>
            : <span className="pc-tag pc-tag-hosted shrink-0">UnSOLO trip</span>}
          <span className="fc-caption min-w-0 truncate text-right text-[12px]">{seatLine(t)}</span>
        </div>
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <span className="pc-price whitespace-nowrap">{rupees(t.priceFromPaise)}<small>/person</small></span>
          {/* The whole card is the link; the pill is a visual cue and hides when the card is narrow. */}
          <span className="fc-tcard-cta pc-btn pc-btn-sm pc-btn-quiet shrink-0">{full ? 'Notify me' : 'Grab a spot'}</span>
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
        <span className="block truncate text-[14px] font-bold">{t.title}</span>
        <span className="block truncate text-[12px] text-muted-foreground">{d ? `${d.dow} ${Number(d.dd)} ${d.mon}` : ''} · {t.durationDays}D · {(t.place?.name ?? '').split(',')[0]}</span>
      </span>
      {n > 0 && <MiniArc total={n} taken={n - left} />}
      <span className="w-[76px] shrink-0 text-right">
        <span className="pc-price block text-[14.5px]">{rupees(t.priceFromPaise)}</span>
        <span className="block text-[11px] font-semibold text-muted-foreground">{n === 0 ? '' : left <= 0 ? 'Full' : `${left} open`}</span>
      </span>
    </Link>
  )
}
