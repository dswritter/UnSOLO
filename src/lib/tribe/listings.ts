import type { ApiContext } from '@/lib/api/context'
import { getCachedPublicServiceListings } from '@/lib/explore/cachedPublicServiceData'
import type { ServiceListingType } from '@/types'
import { PROFILE_LITE, mediaFromUrl, toUserLite, type TripLite } from './models'

type Row = Record<string, unknown>

/** Explore tab → service_listings.type, and the TripLite.kind the apps get back. */
export const LISTING_CATEGORIES = { stays: 'stay', activities: 'activity', rentals: 'rental' } as const
export type ListingCategory = keyof typeof LISTING_CATEGORIES

/** "per_night" → "night"; unknown or empty → null. */
export function unitLabel(unit: unknown): string | null {
  if (typeof unit !== 'string' || !unit) return null
  return unit.replace(/^per_/, '').replace(/_/g, ' ') || null
}

/** A public stay/activity/rental as a TripLite card, opened on the web at its listing page. */
export function listingToTripLite(r: Row, category: ListingCategory, host: TripLite['host']): TripLite {
  const dest = r.destination as Row | null
  const images = Array.isArray(r.images) ? (r.images as string[]) : []
  const location = typeof r.location === 'string' && r.location.trim() ? r.location.trim() : null
  const name = dest?.name ? String(dest.name) : location
  return {
    id: String(r.id),
    slug: String(r.slug),
    title: String(r.title),
    place: name ? {
      name, slug: dest?.slug ? String(dest.slug) : null,
      lat: typeof r.latitude === 'number' ? r.latitude : null, lng: typeof r.longitude === 'number' ? r.longitude : null,
    } : null,
    image: mediaFromUrl(images[0]),
    priceFromPaise: typeof r.price_paise === 'number' ? r.price_paise : Number(r.price_paise ?? 0) || 0,
    durationDays: 1,
    nextDeparture: null,
    seatsLeft: null,
    seatsTotal: null,
    host,
    goingFaces: [],
    kind: LISTING_CATEGORIES[category],
    unit: unitLabel(r.unit),
    webPath: `/listings/${category}/${encodeURIComponent(String(r.slug))}`,
  }
}

/** Public, approved stays/activities/rentals for the Explore tabs (same query and cache as the web). */
export async function loadServiceListings(
  ctx: Pick<ApiContext, 'db'>,
  category: ListingCategory,
  opts: { q?: string; limit?: number; offset?: number } = {},
): Promise<{ items: TripLite[]; hasMore: boolean }> {
  const limit = opts.limit ?? 20, offset = opts.offset ?? 0
  // The cached query pages by page number; offsets from our cursors are always multiples of limit.
  const page = Math.floor(offset / limit) + 1
  const search = opts.q?.replace(/[%_,()]/g, ' ').trim().slice(0, 60) || undefined
  const { listings, total } = await getCachedPublicServiceListings(category as ServiceListingType, { search }, page, limit)
  const rows = listings as unknown as Row[]
  const hostIds = [...new Set(rows.map((r) => r.host_id).filter(Boolean) as string[])]
  const hosts = hostIds.length ? await ctx.db.from('profiles').select(PROFILE_LITE).in('id', hostIds) : { data: [] as Row[] }
  const hostBy = new Map(((hosts.data ?? []) as Row[]).map((h) => [String(h.id), toUserLite(h)]))
  return {
    items: rows.map((r) => listingToTripLite(r, category, r.host_id ? hostBy.get(String(r.host_id)) ?? null : null)),
    hasMore: total > offset + rows.length,
  }
}
