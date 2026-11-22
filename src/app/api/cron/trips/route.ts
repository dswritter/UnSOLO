import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { isAuthorizedCron } from '@/lib/cron/auth'
import { dispatchPendingPushes } from '@/lib/push/dispatch'
import { loadUpcomingTrips } from '@/lib/tribe/trips'
import { todayIST } from '@/lib/tribe/models'
import { addDays, tripEndDate } from '@/lib/trips/tripDays'
import { geocodeMissingDestinations } from '@/lib/trips/geocode'
import { notify } from '@/lib/trips/safety'

export const runtime = 'nodejs'
export const maxDuration = 60

type Row = Record<string, unknown>
const rupees = (p: number) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`
/** "Nearly full": this many spots or fewer on the next departure. */
const LOW_SEATS = 3

/**
 * Daily: saved-trip alerts (price dropped, next departure nearly full), "How was your trip?" the
 * day after a trip ends, and map coordinates for new destinations. Vercel Cron sends GET.
 */
async function run(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const svc = createServiceRoleClient()
  const today = todayIST()
  const result: Record<string, number> = { priceDrops: 0, lowSeats: 0, reviewAsks: 0, geocoded: 0 }

  // ── Saved trips ──
  const { data: saved } = await svc.from('saved_trips')
    .select('user_id, package_id, price_paise, alerted_price_paise, alerted_low_seats_date, package:packages(slug, title, price_paise, is_active)').limit(5000)
  const rows = ((saved ?? []) as Row[]).filter((s) => (s.package as Row | null)?.is_active)
  for (const s of rows) {
    const p = s.package as Row
    const now = Number(p.price_paise ?? 0), was = Number(s.alerted_price_paise ?? s.price_paise ?? 0)
    if (now > 0 && was > 0 && now < was) {
      await notify(svc, [String(s.user_id)], { type: 'trip_alert', title: `Price drop: ${p.title}`, body: `Now ${rupees(now)} (was ${rupees(was)}).`, link: `/packages/${p.slug}` })
      await svc.from('saved_trips').update({ alerted_price_paise: now }).eq('user_id', s.user_id).eq('package_id', s.package_id)
      result.priceDrops++
    }
  }
  const ids = [...new Set(rows.map((s) => String(s.package_id)))]
  if (ids.length) {
    const { items } = await loadUpcomingTrips({ db: svc, service: () => svc, user: null } as never, { ids, limit: 400 })
    const byId = new Map(items.map((t) => [t.id, t]))
    for (const s of rows) {
      const t = byId.get(String(s.package_id))
      if (!t?.nextDeparture || t.seatsLeft == null || t.seatsLeft <= 0 || t.seatsLeft > LOW_SEATS) continue
      if (s.alerted_low_seats_date === t.nextDeparture) continue
      await notify(svc, [String(s.user_id)], { type: 'trip_alert', title: `${t.seatsLeft === 1 ? 'Last spot' : `Only ${t.seatsLeft} spots left`}: ${t.title}`,
        body: `For ${new Date(`${t.nextDeparture}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })}.`, link: `/packages/${t.slug}` })
      await svc.from('saved_trips').update({ alerted_low_seats_date: t.nextDeparture }).eq('user_id', s.user_id).eq('package_id', s.package_id)
      result.lowSeats++
    }
  }

  // ── Review requests: trips that ended 1–3 days ago, not reviewed, not asked ──
  const { data: ended } = await svc.from('bookings').select('id, user_id, travel_date, package:packages(title, duration_days)')
    .in('status', ['confirmed', 'completed']).not('package_id', 'is', null).gte('travel_date', addDays(today, -45)).lt('travel_date', today).limit(2000)
  const candidates = ((ended ?? []) as Row[]).filter((b) => {
    const end = tripEndDate(String(b.travel_date), Number((b.package as Row | null)?.duration_days ?? 1))
    return end >= addDays(today, -3) && end <= addDays(today, -1)
  })
  if (candidates.length) {
    const cid = candidates.map((b) => String(b.id))
    const [{ data: asked }, { data: reviewed }] = await Promise.all([
      svc.from('review_requests').select('booking_id').in('booking_id', cid),
      svc.from('reviews').select('booking_id').in('booking_id', cid),
    ])
    const skip = new Set([...((asked ?? []) as Row[]), ...((reviewed ?? []) as Row[])].map((r) => String(r.booking_id)))
    for (const b of candidates) {
      if (skip.has(String(b.id))) continue
      const title = String((b.package as Row | null)?.title ?? 'your trip')
      await notify(svc, [String(b.user_id)], { type: 'review_request', title: `How was ${title}?`, body: 'Rate it and add a few photos. It helps the next traveller decide.', link: `/review/${b.id}` })
      await svc.from('review_requests').insert({ booking_id: b.id })
      result.reviewAsks++
    }
  }

  result.geocoded = await geocodeMissingDestinations(svc, 15)
  const pushes = await dispatchPendingPushes({ limit: 500 })
  return NextResponse.json({ ...result, pushes })
}

export const GET = run
export const POST = run
