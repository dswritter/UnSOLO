import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { tripDepartureDateKey } from '@/lib/package-trip-calendar'
import type { Package, ServiceListing } from '@/types'
import { fetchPackagePopularityMaps, sortExplorePackages } from '@/lib/explore-package-popularity'
import type { ServiceEventScheduleEntry } from '@/types'
import {
  DEFAULT_WANDER_HERO_LINE1,
  DEFAULT_WANDER_INSTAGRAM_LABEL,
  DEFAULT_WANDER_LINE2_ACCENT,
  DEFAULT_WANDER_LINE2_AFTER,
  DEFAULT_WANDER_LINE2_BEFORE,
  DEFAULT_WANDER_SUBTITLE,
  DEFAULT_WANDER_TRUST_BADGE_TEXT,
} from '@/lib/wander/wander-defaults'
import { sanitizeAdminPublicHref } from '@/lib/wander/safe-public-link'
export {
  DEFAULT_WANDER_TRUST_BADGE_TEXT,
  DEFAULT_WANDER_HERO_LINE1,
  DEFAULT_WANDER_LINE2_BEFORE,
  DEFAULT_WANDER_LINE2_ACCENT,
  DEFAULT_WANDER_LINE2_AFTER,
  DEFAULT_WANDER_SUBTITLE,
  DEFAULT_WANDER_INSTAGRAM_LABEL,
}

export type WanderHeroCopy = {
  line1: string
  line2Before: string
  line2Accent: string
  line2After: string
  subtitle: string
  headlineLink: string | null
  subtitleLink: string | null
  /** Shown below subtitle when `instagramUrl` is set. */
  instagramLabel: string
  instagramUrl: string | null
}

const HERO_KEYS = [
  'wander_hero_line1',
  'wander_hero_line2_before',
  'wander_hero_line2_accent',
  'wander_hero_line2_after',
  'wander_hero_subtitle',
  'wander_hero_headline_link_url',
  'wander_hero_subtitle_link_url',
  'wander_hero_instagram_text',
  'wander_hero_instagram_url',
] as const

/** Headline lines + subtitle from platform_settings; falsy fields fall back to product defaults. */
export async function getWanderHeroCopy(): Promise<WanderHeroCopy> {
  const defaults = (): WanderHeroCopy => ({
    line1: DEFAULT_WANDER_HERO_LINE1,
    line2Before: DEFAULT_WANDER_LINE2_BEFORE,
    line2Accent: DEFAULT_WANDER_LINE2_ACCENT,
    line2After: DEFAULT_WANDER_LINE2_AFTER,
    subtitle: DEFAULT_WANDER_SUBTITLE,
    headlineLink: null,
    subtitleLink: null,
    instagramLabel: DEFAULT_WANDER_INSTAGRAM_LABEL,
    instagramUrl: null,
  })
  try {
    const supabase = await createServerClient()
    const { data } = await supabase.from('platform_settings').select('key, value').in('key', [...HERO_KEYS])
    const m = Object.fromEntries((data || []).map((r: { key: string; value: string }) => [r.key, r.value ?? '']))
    const headlineLink = sanitizeAdminPublicHref(m.wander_hero_headline_link_url)
    const subtitleLink = sanitizeAdminPublicHref(m.wander_hero_subtitle_link_url)
    const instagramUrl = sanitizeAdminPublicHref(m.wander_hero_instagram_url)
    const instagramRaw = (m.wander_hero_instagram_text as string | undefined)?.trim()
    const instagramLabel = instagramRaw || DEFAULT_WANDER_INSTAGRAM_LABEL
    const line1 = (m.wander_hero_line1 as string)?.trim()
    const line2Before = (m.wander_hero_line2_before as string) ?? ''
    const line2Accent = (m.wander_hero_line2_accent as string) ?? ''
    const line2After = (m.wander_hero_line2_after as string) ?? ''
    const subtitle = (m.wander_hero_subtitle as string) ?? ''
    return {
      line1: line1 || DEFAULT_WANDER_HERO_LINE1,
      line2Before: line2Before.trim() !== '' ? line2Before : DEFAULT_WANDER_LINE2_BEFORE,
      line2Accent: line2Accent.trim() !== '' ? line2Accent : DEFAULT_WANDER_LINE2_ACCENT,
      line2After: line2After.trim() !== '' ? line2After : DEFAULT_WANDER_LINE2_AFTER,
      subtitle: subtitle.trim() !== '' ? subtitle : DEFAULT_WANDER_SUBTITLE,
      headlineLink,
      subtitleLink,
      instagramLabel,
      instagramUrl: instagramUrl ?? null,
    }
  } catch {
    /* Supabase down */
  }
  return defaults()
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function isActivityVisibleToPublic(
  listing: Pick<ServiceListing, 'type' | 'event_schedule'>,
): boolean {
  if (listing.type !== 'activities') return true
  const schedule = listing.event_schedule
  if (!schedule || (schedule as ServiceEventScheduleEntry[]).length === 0) return true
  const t = todayIso()
  return (schedule as ServiceEventScheduleEntry[]).some(entry => entry.date >= t)
}

const DEFAULT_WANDER_HERO =
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=2400&q=85'

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createServiceClient(url, key)
}

/** Hero background for /wander — from Admin → platform_settings. */
export async function getWanderHeroImageUrl(): Promise<string> {
  try {
    const supabase = await createServerClient()
    const { data } = await supabase.from('platform_settings').select('value').eq('key', 'wander_hero_image_url').maybeSingle()
    const v = data?.value?.trim()
    if (v && (v.startsWith('http://') || v.startsWith('https://'))) return v
  } catch {
    /* Supabase down */
  }
  return DEFAULT_WANDER_HERO
}

/** Top-left pill on /wander — from platform_settings; empty = default copy. */
export async function getWanderTrustBadgeText(): Promise<string> {
  try {
    const supabase = await createServerClient()
    const { data } = await supabase
      .from('platform_settings')
      .select('value')
      .eq('key', 'wander_trust_badge_text')
      .maybeSingle()
    const v = data?.value?.trim()
    if (v) return v
  } catch {
    /* Supabase down */
  }
  return DEFAULT_WANDER_TRUST_BADGE_TEXT
}

/**
 * Distinct activity labels from live listings: tags + metadata.activity_category.
 */
export async function getListedActivityFilterOptions(): Promise<string[]> {
  const supabase = svc()
  const { data, error } = await supabase
    .from('service_listings')
    .select('tags, metadata, type, event_schedule')
    .eq('type', 'activities')
    .eq('is_active', true)
    .or('status.eq.approved,and(status.eq.pending,first_approved_at.not.is.null)')
  if (error || !data?.length) return []
  const set = new Set<string>()
  for (const row of data) {
    if (!isActivityVisibleToPublic(row as ServiceListing)) continue
    const r = row as { tags: string[] | null; metadata: { activity_category?: string } | null }
    for (const t of r.tags || []) {
      if (t?.trim()) set.add(t.trim())
    }
    const c = r.metadata?.activity_category
    if (c?.trim()) set.add(c.trim())
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}

export type WanderStats = {
  soloTravelers: number
  destinations: number
  bookings: number
  happyPercent: number
}

export async function getWanderStats(): Promise<WanderStats> {
  const supabase = svc()

  const [{ count: profileCount }, { count: bookingCount }, destPackages, destServices, reviews, hostReviews] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .not('status', 'eq', 'pending'),
    supabase
      .from('packages')
      .select('destination_id')
      .eq('is_active', true)
      .not('host_id', 'is', null)
      .not('destination_id', 'is', null),
    supabase
      .from('service_listings')
      .select('destination_id')
      .eq('is_active', true)
      .not('host_id', 'is', null)
      .or('status.eq.approved,and(status.eq.pending,first_approved_at.not.is.null)'),
    supabase.from('reviews').select('rating'),
    supabase.from('host_reviews').select('rating'),
  ])

  const destSet = new Set<string>()
  for (const r of destPackages.data || []) {
    const d = (r as { destination_id: string | null }).destination_id
    if (d) destSet.add(d)
  }
  for (const r of destServices.data || []) {
    const d = (r as { destination_id: string | null }).destination_id
    if (d) destSet.add(d)
  }

  const allRatings = [
    ...((reviews.data || []) as { rating: number }[]).map(x => x.rating),
    ...((hostReviews.data || []) as { rating: number }[]).map(x => x.rating),
  ]
  const totalR = allRatings.length
  const goodR = allRatings.filter(x => x >= 3).length
  const happyPercent = totalR === 0 ? 0 : Math.round((goodR / totalR) * 1000) / 10

  return {
    soloTravelers: profileCount ?? 0,
    destinations: destSet.size,
    bookings: bookingCount ?? 0,
    happyPercent,
  }
}

export type RaterPreview = { userId: string; avatar_url: string | null; username: string; full_name: string | null }

export type WanderRatingHero = {
  overall: number
  reviewCount: number
  /** Recent unique raters (for avatar strip) */
  recentRaters: RaterPreview[]
}

export async function getWanderRatingHero(): Promise<WanderRatingHero> {
  const supabase = svc()
  const [reviews, hostRows] = await Promise.all([
    supabase.from('reviews').select('user_id, rating, created_at'),
    supabase.from('host_reviews').select('reviewer_id, rating, created_at'),
  ])
  const r1 = (reviews.data || []) as { user_id: string; rating: number; created_at: string }[]
  const r2 = (hostRows.data || []) as { reviewer_id: string; rating: number; created_at: string }[]

  const all = [
    ...r1.map(x => ({ uid: x.user_id, rating: x.rating, t: x.created_at })),
    ...r2.map(x => ({ uid: x.reviewer_id, rating: x.rating, t: x.created_at })),
  ]
  const sum = all.reduce((a, b) => a + b.rating, 0)
  const n = all.length
  const overall = n === 0 ? 4.8 : Math.round((sum / n) * 10) / 10

  // Recent raters, unique users, most recent first
  all.sort((a, b) => new Date(b.t).getTime() - new Date(a.t).getTime())
  const seen = new Set<string>()
  const orderedIds: string[] = []
  for (const row of all) {
    if (seen.has(row.uid)) continue
    seen.add(row.uid)
    orderedIds.push(row.uid)
    if (orderedIds.length >= 12) break
  }

  let recentRaters: RaterPreview[] = []
  if (orderedIds.length) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .in('id', orderedIds)
    const byId = new Map((profs || []).map(p => [p.id, p as RaterPreview & { id: string }]))
    recentRaters = orderedIds
      .map(id => {
        const p = byId.get(id)
        if (!p) return null
        return { userId: p.id, avatar_url: p.avatar_url, username: p.username, full_name: p.full_name }
      })
      .filter((x): x is RaterPreview => x != null)
      .slice(0, 8)
  }

  return { overall, reviewCount: n, recentRaters }
}

function filterPackagesWithFutureDepartures(packages: Package[]): Package[] {
  const todayStr = new Date().toISOString().split('T')[0]
  return packages.filter(pkg => {
    if (!pkg.departure_dates || pkg.departure_dates.length === 0) return true
    const closed = new Set((pkg.departure_dates_closed || []).map(tripDepartureDateKey))
    return pkg.departure_dates.some(d => {
      const k = tripDepartureDateKey(d)
      return k >= todayStr && !closed.has(k)
    })
  })
}

export type WanderTripRowResult = {
  packages: Package[]
  /** Counts for `package_interests` rows, keyed by package id (aligned with Explore). */
  interestCounts: Record<string, number>
}

/** Featured first, then by average review rating, then explore popularity sort. */
export async function getWanderTripRow(): Promise<WanderTripRowResult> {
  const supabase = svc()
  const { data: raw } = await supabase
    .from('packages')
    .select('*, destination:destinations(*), host:profiles!packages_host_id_fkey(id, username, full_name, avatar_url, bio, host_rating, is_verified, total_hosted_trips)')
    .eq('is_active', true)
    .order('is_featured', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(120)
  let packages = filterPackagesWithFutureDepartures((raw || []) as Package[])
  if (packages.length === 0) return { packages: [], interestCounts: {} }

  const ids = packages.map(p => p.id)
  const { data: reviewRows } = await supabase.from('reviews').select('package_id, rating').in('package_id', ids)
  const avgByPackage = new Map<string, { sum: number; n: number }>()
  for (const r of reviewRows || []) {
    const row = r as { package_id: string; rating: number }
    const cur = avgByPackage.get(row.package_id) || { sum: 0, n: 0 }
    cur.sum += row.rating
    cur.n += 1
    avgByPackage.set(row.package_id, cur)
  }
  const ratingAvg = (id: string) => {
    const x = avgByPackage.get(id)
    if (!x || x.n === 0) return 0
    return x.sum / x.n
  }

  const { bookedGuests, interestCount } = await fetchPackagePopularityMaps(supabase, ids)
  packages = sortExplorePackages(packages, bookedGuests, interestCount)
  packages.sort((a, b) => {
    if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1
    const ra = ratingAvg(a.id)
    const rb = ratingAvg(b.id)
    if (rb !== ra) return rb - ra
    return 0
  })
  const sliced = packages.slice(0, 4)
  const interestCounts: Record<string, number> = {}
  for (const p of sliced) {
    interestCounts[p.id] = interestCount.get(p.id) || 0
  }
  return { packages: sliced, interestCounts }
}

export async function getWanderActivityRow(): Promise<ServiceListing[]> {
  const supabase = svc()
  const { data, error } = await supabase
    .from('service_listings')
    .select('*, destination:destinations(id, name, slug)')
    .eq('type', 'activities')
    .eq('is_active', true)
    .or('status.eq.approved,and(status.eq.pending,first_approved_at.not.is.null)')
    .order('is_featured', { ascending: false })
    .order('average_rating', { ascending: false })
    .order('review_count', { ascending: false })
    .limit(30)
  if (error || !data) return []
  const visible = ((data || []) as ServiceListing[]).filter(l => isActivityVisibleToPublic(l))
  return visible.slice(0, 4)
}

export async function getWanderRentalRow(): Promise<ServiceListing[]> {
  const supabase = svc()
  const { data: listings, error: lerr } = await supabase
    .from('service_listings')
    .select('*, destination:destinations(id, name, slug)')
    .eq('type', 'rentals')
    .eq('is_active', true)
    .or('status.eq.approved,and(status.eq.pending,first_approved_at.not.is.null)')
    .limit(80)
  if (lerr || !listings?.length) return []
  const ids = listings.map(l => l.id)
  const { data: bookRows } = await supabase
    .from('bookings')
    .select('service_listing_id, status')
    .eq('booking_type', 'service')
    .in('service_listing_id', ids)
    .not('status', 'eq', 'pending')
  const counts = new Map<string, number>()
  for (const b of bookRows || []) {
    const row = b as { service_listing_id: string | null }
    if (!row.service_listing_id) continue
    counts.set(row.service_listing_id, (counts.get(row.service_listing_id) || 0) + 1)
  }
  const sorted = [...(listings as ServiceListing[])].sort((a, b) => {
    const ca = counts.get(a.id) || 0
    const cb = counts.get(b.id) || 0
    if (cb !== ca) return cb - ca
    if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1
    return (b.average_rating || 0) - (a.average_rating || 0)
  })
  return sorted.slice(0, 4)
}

export async function getWanderServiceItemsForListings(
  listings: ServiceListing[],
): Promise<
  Array<
    ServiceListing & {
      items: Array<{ id: string; name: string; price_paise: number; images: string[]; unit: string | null }>
    }
  >
> {
  if (listings.length === 0) return []
  const supabase = svc()
  const ids = listings.map(l => l.id)
  const { data: itemRows } = await supabase
    .from('service_listing_items')
    .select('id, name, price_paise, images, unit, is_out_of_stock, service_listing_id')
    .in('service_listing_id', ids)
    .eq('is_active', true)
    .order('position_order', { ascending: true })
  const itemsBy = new Map<string, Array<{ id: string; name: string; price_paise: number; images: string[]; unit: string | null; is_out_of_stock: boolean }>>()
  for (const row of itemRows || []) {
    const lid = (row as { service_listing_id: string }).service_listing_id
    if (!itemsBy.has(lid)) itemsBy.set(lid, [])
    itemsBy.get(lid)!.push({
      id: (row as { id: string }).id,
      name: (row as { name: string }).name,
      price_paise: (row as { price_paise: number }).price_paise,
      images: ((row as { images: string[] | null }).images) || [],
      unit: (row as { unit: string | null }).unit,
      is_out_of_stock: Boolean((row as { is_out_of_stock?: boolean | null }).is_out_of_stock),
    })
  }
  return listings.map(l => ({ ...l, items: itemsBy.get(l.id) || [] }))
}
