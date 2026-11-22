import type { ApiContext } from '@/lib/api/context'
import { ApiError } from '@/lib/api/http'
import { SERVICE_LISTING_PUBLIC_COLUMNS } from '@/lib/explore/cachedPublicServiceData'
import { getCachedPublicServiceListings } from '@/lib/explore/cachedPublicServiceData'
import type { ServiceListingType } from '@/types'
import { PROFILE_LITE, mediaFromUrl, toUserLite, type TripLite } from './models'

type Row = Record<string, unknown>

/** Columns for a listing card (bookings join). */
export const LISTING_LITE = 'id, slug, title, images, price_paise, unit, type, location, latitude, longitude, host_id, destination:destinations(name, slug)'

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

/** service_listings.type → Explore tab (getting-around listings sit with rentals). */
export function categoryForType(type: unknown): ListingCategory {
  return type === 'stays' || type === 'activities' ? type : 'rentals'
}

/**
 * GET /trips/{slug} for a listing: the trip-detail shape (description, includes = amenities,
 * images, rating) with kind/unit/webPath, no departures or seats. Public, approved listings only.
 */
export async function loadListingDetail(ctx: Pick<ApiContext, 'db' | 'service'>, slug: string) {
  const { data } = await ctx.service().from('service_listings')
    .select(`${SERVICE_LISTING_PUBLIC_COLUMNS}, destination:destinations(id, name, slug)`)
    .eq('slug', slug).eq('is_active', true)
    .or('status.eq.approved,and(status.eq.pending,first_approved_at.not.is.null)')
    .maybeSingle()
  if (!data) throw new ApiError('not_found', 'This listing is not available')
  const r = data as Row
  const host = r.host_id ? (await ctx.db.from('profiles').select(PROFILE_LITE).eq('id', r.host_id).maybeSingle()).data : null
  const lite = listingToTripLite(r, categoryForType(r.type), host ? toUserLite(host as Row) : null)
  const images = (Array.isArray(r.images) ? (r.images as string[]) : []).map((u) => mediaFromUrl(u)).filter((m): m is NonNullable<typeof m> => !!m)
  const amenities = Array.isArray(r.amenities) ? (r.amenities as unknown[]).map(String).filter(Boolean) : []
  const count = Number(r.review_count ?? 0)
  return {
    ...lite,
    description: String(r.description ?? r.short_description ?? ''),
    includes: amenities,
    images,
    departures: [],
    seats: [],
    rating: { avg: count && r.average_rating != null ? Number(r.average_rating) : null, count },
    stories: [],
    planningCount: 0,
  }
}
