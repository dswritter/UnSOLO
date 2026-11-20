import Link from 'next/link'
import { createPublicClient } from '@/lib/supabase/public-client'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { loadUpcomingTrips } from '@/lib/tribe/trips'
import type { Seat, TripLite } from '@/lib/tribe/models'
import { SeatRow } from './SeatRow'
import { rupees } from './format'

function strip(t: TripLite): Seat[] {
  const total = Math.min(t.seatsTotal ?? 12, 16)
  const taken = Math.max(total - (t.seatsLeft ?? total), 0)
  return Array.from({ length: total }, (_, i) => ({ state: i < taken ? 'member' : 'open', user: null }))
}

function day(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`)
  return { dd: d.toLocaleDateString('en-IN', { day: '2-digit', timeZone: 'UTC' }), mon: d.toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' }), dow: d.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' }) }
}

/**
 * Explore "Leaving next": hosted departures sorted by date as a ruled table (desktop) / ruled list
 * (mobile), each with its seat strip. Cookie-free so the home page stays cacheable; seat counts come
 * from aggregate booking totals only (no faces). Renders nothing on error.
 */
export async function DeparturesTable() {
  let items: TripLite[] = []
  try {
    items = (await loadUpcomingTrips({ db: createPublicClient(), service: createServiceRoleClient, user: null }, { limit: 8 })).items
  } catch {
    return null
  }
  if (items.length === 0) return null
  return (
    <section aria-label="Leaving next" className="mx-auto mt-8 max-w-[1280px] px-4 md:px-6">
      <div className="mb-2 flex items-end justify-between border-b border-foreground pb-2">
        <h2 className="text-[22px]">Leaving next</h2>
        <Link href="/?search=1" className="pc-link text-sm">All departures →</Link>
      </div>
      <table className="pc-table hidden md:table">
        <thead><tr><th className="w-20">Date</th><th>Trip</th><th className="w-64">Seats</th><th className="w-20">Length</th><th className="w-28 text-right">From</th><th className="w-32" /></tr></thead>
        <tbody>
          {items.map((t) => {
            const d = day(t.nextDeparture!)
            return (
              <tr key={t.id}>
                <td><span className="pc-mono block text-lg font-semibold leading-none">{d.dd}</span><span className="text-xs text-muted-foreground">{d.mon} · {d.dow}</span></td>
                <td className="min-w-0"><Link href={`/packages/${t.slug}`} className="font-semibold hover:underline">{t.title}</Link>
                  <span className="block text-xs text-muted-foreground">{t.place?.name ?? ''}{t.host ? ` · hosted by ${t.host.name}` : ' · UnSOLO trip'}</span></td>
                <td><SeatRow seats={strip(t)} size="xs" className="gap-[3px]" /><span className="pc-mono mt-1 block text-xs text-muted-foreground">{t.seatsLeft} of {t.seatsTotal} left</span></td>
                <td className="pc-mono text-sm">{t.durationDays}D</td>
                <td className="pc-mono text-right font-semibold">{rupees(t.priceFromPaise)}</td>
                <td className="text-right"><Link href={`/packages/${t.slug}`} className="pc-btn pc-btn-sm">Take a seat</Link></td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <ul className="divide-y divide-border md:hidden">
        {items.map((t) => {
          const d = day(t.nextDeparture!)
          return (
            <li key={t.id}>
              <Link href={`/packages/${t.slug}`} className="grid grid-cols-[52px_1fr_auto] items-center gap-3 py-3">
                <span><span className="pc-mono block text-lg font-semibold leading-none">{d.dd}</span><span className="text-xs text-muted-foreground">{d.mon}</span></span>
                <span className="min-w-0"><span className="block truncate font-semibold">{t.title}</span>
                  <SeatRow seats={strip(t)} size="xs" className="mt-1 gap-[3px]" /></span>
                <span className="pc-mono text-right text-sm font-semibold">{rupees(t.priceFromPaise)}<span className="block text-xs font-normal text-muted-foreground">{t.seatsLeft} left</span></span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
