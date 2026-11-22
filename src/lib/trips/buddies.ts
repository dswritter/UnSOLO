import type { SupabaseClient } from '@supabase/supabase-js'
import { PROFILE_LITE, placeSlug, toUserLite, todayIST, type UserLite } from '@/lib/tribe/models'
import { addDays } from './tripDays'

type Row = Record<string, unknown>

export type Buddy = { user: UserLite; score: number; reasons: string[]; trip: { slug: string; title: string } | null; planId: string | null }

const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })
/** Within 30% of each other: a similar budget. */
export const similarBudget = (a?: number | null, b?: number | null) => !!a && !!b && Math.abs(a - b) <= 0.3 * Math.max(a, b)

/**
 * People to travel with, from what you've booked, planned and saved:
 * - going on the same departure as you (strongest),
 * - planning the same place within a week of your dates,
 * - saved the same trip (and a similar budget),
 * Never you, never anyone either of you blocked.
 */
export async function findBuddies(svc: SupabaseClient, userId: string, limit = 30): Promise<Buddy[]> {
  const today = todayIST()
  const [{ data: myBookings }, { data: mySaved }, { data: myPlans }, { data: blocks }] = await Promise.all([
    svc.from('bookings').select('package_id, travel_date, package:packages(slug, title, price_paise, destination:destinations(name, slug, state))')
      .eq('user_id', userId).in('status', ['pending', 'confirmed']).gte('travel_date', today).not('package_id', 'is', null).limit(20),
    svc.from('saved_trips').select('package_id, package:packages(slug, title, price_paise, departure_dates, destination:destinations(name, slug))').eq('user_id', userId).limit(50),
    svc.from('posts').select('id, place_slug, place_name, starts_on').eq('author_id', userId).eq('kind', 'plan').eq('status', 'live').gte('starts_on', today).limit(10),
    svc.from('user_blocks').select('blocker_id, blocked_id').or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`),
  ])
  const blocked = new Set(((blocks ?? []) as Row[]).flatMap((b) => [String(b.blocker_id), String(b.blocked_id)]))
  blocked.add(userId)
  const out = new Map<string, Buddy>()
  const add = (u: Row | null | undefined, score: number, reason: string, extra: Partial<Buddy> = {}) => {
    const id = String(u?.id ?? '')
    if (!id || blocked.has(id)) return
    const cur = out.get(id) ?? { user: toUserLite(u), score: 0, reasons: [], trip: null, planId: null }
    if (!cur.reasons.includes(reason)) { cur.reasons.push(reason); cur.score += score }
    out.set(id, { ...cur, trip: cur.trip ?? extra.trip ?? null, planId: cur.planId ?? extra.planId ?? null })
  }
  const mine = (myBookings ?? []) as Row[]
  // Where and when I'm going (booked trips and my plans).
  const windows: { slug: string; name: string; date: string; price: number | null }[] = []
  for (const b of mine) {
    const p = b.package as Row, d = p?.destination as Row | null
    windows.push({ slug: String(d?.slug ?? placeSlug(String(d?.name ?? ''))), name: String(d?.name ?? p?.title ?? ''), date: String(b.travel_date), price: Number(p?.price_paise ?? 0) || null })
  }
  for (const pl of (myPlans ?? []) as Row[]) windows.push({ slug: String(pl.place_slug ?? placeSlug(String(pl.place_name ?? ''))), name: String(pl.place_name ?? ''), date: String(pl.starts_on), price: null })

  // 1. Same departure.
  for (const b of mine) {
    const p = b.package as Row
    const { data } = await svc.from('bookings').select(`user:profiles!bookings_user_id_fkey(${PROFILE_LITE})`)
      .eq('package_id', b.package_id).eq('travel_date', b.travel_date).in('status', ['pending', 'confirmed']).neq('user_id', userId).limit(30)
    for (const r of (data ?? []) as Row[]) add(r.user as Row, 100, `Going on ${p.title} with you · ${fmt(String(b.travel_date))}`, { trip: { slug: String(p.slug), title: String(p.title) } })
  }
  // 2. Planning the same place within a week.
  const slugs = [...new Set(windows.map((w) => w.slug).filter(Boolean))]
  if (slugs.length) {
    const { data } = await svc.from('posts').select(`id, place_slug, place_name, starts_on, author:profiles!posts_author_id_fkey(${PROFILE_LITE})`)
      .eq('kind', 'plan').eq('status', 'live').in('place_slug', slugs).gte('starts_on', today).neq('author_id', userId).limit(100)
    for (const pl of (data ?? []) as Row[]) {
      const w = windows.find((x) => x.slug === pl.place_slug && String(pl.starts_on) >= addDays(x.date, -7) && String(pl.starts_on) <= addDays(x.date, 7))
      if (w) add(pl.author as Row, 70, `Planning ${pl.place_name ?? w.name} around ${fmt(String(pl.starts_on))}, like you`, { planId: String(pl.id) })
    }
  }
  // 3. Saved the same trip.
  const saved = (mySaved ?? []) as Row[]
  if (saved.length) {
    const priceOf = new Map(saved.map((s) => [String(s.package_id), Number((s.package as Row)?.price_paise ?? 0)]))
    const { data } = await svc.from('saved_trips').select(`package_id, user:profiles!saved_trips_user_id_fkey(${PROFILE_LITE}), package:packages(slug, title)`)
      .in('package_id', saved.map((s) => s.package_id as string)).neq('user_id', userId).limit(200)
    const myPrice = windows.find((w) => w.price)?.price ?? null
    for (const r of (data ?? []) as Row[]) {
      const p = r.package as Row
      add(r.user as Row, 40, `Also saved ${p.title}`, { trip: { slug: String(p.slug), title: String(p.title) } })
      if (similarBudget(myPrice, priceOf.get(String(r.package_id)))) add(r.user as Row, 10, 'Similar budget')
    }
  }
  return [...out.values()].sort((a, b) => b.score - a.score).slice(0, limit)
}
