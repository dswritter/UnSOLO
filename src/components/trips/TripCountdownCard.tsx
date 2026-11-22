'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, FileText, MessageCircle } from 'lucide-react'
import { listingScheduleTodayISO } from '@/lib/utils'
import { formatDateRangeFromEdges } from '@/lib/package-trip-calendar'
import { v1 } from '@/lib/api/v1-client'

export type CountdownTrip = {
  bookingId: string
  title: string
  /** Place name for the headline ("Spiti in 12 days"); falls back to the title. */
  place: string | null
  slug: string
  start: string
  end: string | null
  image: string | null
  chatRoomId: string | null
}

const dayMs = 86_400_000
const diffDays = (a: string, b: string) => Math.round((Date.parse(`${a.slice(0, 10)}T00:00:00Z`) - Date.parse(`${b.slice(0, 10)}T00:00:00Z`)) / dayMs)

/** "Spiti in 12 days", "Spiti starts tomorrow", "Day 2 of 5". */
export function countdownLine(t: Pick<CountdownTrip, 'place' | 'title' | 'start' | 'end'>, today = listingScheduleTodayISO()) {
  const name = t.place || t.title
  const until = diffDays(t.start, today)
  if (until > 1) return `${name} in ${until} days`
  if (until === 1) return `${name} starts tomorrow`
  const total = t.end ? diffDays(t.end, t.start) + 1 : 1
  const day = -until + 1
  if (until === 0 && total <= 1) return `${name} is today`
  if (day > total) return `Heading home from ${name}`
  return `Day ${day} of ${total}`
}

/** Compact card for the next upcoming trip, or the one under way. */
export function TripCountdownCard({ trip, onOpenChat }: { trip: CountdownTrip; onOpenChat?: () => void }) {
  const line = countdownLine(trip)
  const during = diffDays(trip.start, listingScheduleTodayISO()) <= 0
  const range = trip.end && trip.end !== trip.start ? formatDateRangeFromEdges(trip.start.slice(0, 10), trip.end.slice(0, 10)) : new Date(`${trip.start.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  const link = 'inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[13px] font-semibold text-foreground hover:border-primary'
  return (
    <div className="pc-card flex items-center gap-4 p-3 sm:p-4">
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[color:var(--pc-tonal)] sm:h-20 sm:w-20">
        {trip.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={trip.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="pc-eyebrow text-[color:var(--pc-accent-ink)]">{during ? 'On your trip' : 'Your next trip'}</p>
        <h2 className="truncate text-[20px] font-bold leading-tight text-foreground">{line}</h2>
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">{during ? trip.title : `${trip.title} · ${range}`}</span>
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link href={`/packages/${encodeURIComponent(trip.slug)}`} className={link}>View trip</Link>
          {trip.chatRoomId ? (
            <Link href={`/community/${trip.chatRoomId}`} className={link}><MessageCircle className="h-3.5 w-3.5" aria-hidden />Group chat</Link>
          ) : onOpenChat ? (
            <button type="button" onClick={onOpenChat} className={link}><MessageCircle className="h-3.5 w-3.5" aria-hidden />Group chat</button>
          ) : null}
          <Link href={`/bookings/${trip.bookingId}/pack`} className={link}><FileText className="h-3.5 w-3.5" aria-hidden />Trip pack</Link>
        </div>
      </div>
    </div>
  )
}

type MyTrip = {
  id: string
  status: string
  travelDate: string
  endDate: string | null
  onTrip: boolean
  chatRoomId: string | null
  trip: { slug: string; title: string; kind?: string; place: { name: string } | null; image: { url: string; thumbUrl: string | null } | null }
}

/** Loads GET /api/v1/my/trips and shows the next confirmed trip (or the one under way). Renders nothing otherwise. */
export function TripCountdownLoader({ className }: { className?: string }) {
  const [trip, setTrip] = useState<CountdownTrip | null>(null)
  useEffect(() => {
    let live = true
    void v1<{ upcoming: MyTrip[] }>('/my/trips').then((r) => {
      if (!live || !r.ok) return
      const next = r.data.upcoming
        .filter((b) => b.status === 'confirmed' && b.endDate && (!b.trip.kind || b.trip.kind === 'trip'))
        .sort((a, b) => Number(b.onTrip) - Number(a.onTrip) || a.travelDate.localeCompare(b.travelDate))[0]
      if (next) setTrip({
        bookingId: next.id, title: next.trip.title, place: next.trip.place?.name ?? null, slug: next.trip.slug,
        start: next.travelDate, end: next.endDate, image: next.trip.image?.thumbUrl || next.trip.image?.url || null, chatRoomId: next.chatRoomId,
      })
    })
    return () => { live = false }
  }, [])
  if (!trip) return null
  return <div className={className}><TripCountdownCard trip={trip} /></div>
}
