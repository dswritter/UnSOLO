/**
 * Contract models for /api/v1 (docs/revamp/api-v1.md → "Shared models") and mappers
 * from Supabase rows. Shared by API routes and web server components.
 */
import { storageThumbnailUrl } from '@/lib/images/storageThumbUrl'

export type UserLite = {
  id: string
  username: string
  name: string
  avatarUrl: string | null
  isPhoneVerified: boolean
  isIdVerified: boolean
  isHost: boolean
}
export type Media = { url: string; thumbUrl: string | null; lqip: string | null; width: number | null; height: number | null }
export type Place = { name: string; slug: string | null; lat: number | null; lng: number | null }
export type SeatState = 'organiser' | 'host' | 'member' | 'you' | 'requested' | 'held' | 'open'
export type Seat = { state: SeatState; user: UserLite | null }
export type ReactionKind = 'want_to_go' | 'helpful' | 'love'
export type PostKind = 'plan' | 'story' | 'ask'
export type Membership = null | 'requested' | 'approved' | 'declined' | 'withdrawn' | 'expired' | 'removed'

export type TripLite = {
  id: string
  slug: string
  title: string
  place: Place | null
  image: Media | null
  priceFromPaise: number
  durationDays: number
  nextDeparture: string | null
  seatsLeft: number | null
  seatsTotal: number | null
  host: UserLite | null
  goingFaces: UserLite[]
  /** Absent or 'trip' for hosted trips; stays, activities and rentals open on the web at [webPath]. */
  kind?: 'trip' | 'stay' | 'activity' | 'rental'
  /** Price unit for listings ("night", "person", "day"). */
  unit?: string | null
  webPath?: string
}

export type Post = {
  id: string
  kind: PostKind
  author: UserLite
  title: string | null
  body: string
  place: Place | null
  startsOn: string | null
  endsOn: string | null
  spotsTotal: number | null
  memberCount: number
  audience: 'anyone' | 'women' | 'verified'
  estCostText: string | null
  media: Media[]
  trip: TripLite | null
  poll: { options: { id: string; label: string; votes: number }[]; myChoice: string | null } | null
  reactions: { wantToGo: number; helpful: number; love: number }
  myReactions: ReactionKind[]
  commentCount: number
  status: 'live' | 'held' | 'hidden' | 'removed' | 'cancelled' | 'past'
  seats: Seat[]
  createdAt: string
  updatedAt: string
  meetingPoint: string | null
  viewer: {
    isAuthor: boolean
    membership: Membership
    saved: boolean
    canJoin: boolean
    joinBlockedReason: null | 'full' | 'women_only' | 'verified_only' | 'own_plan' | 'phone_required' | 'closed'
  }
}

export type Comment = {
  id: string
  postId: string
  parentId: string | null
  author: UserLite
  body: string
  pollChoice: string | null
  createdAt: string
  replies: Comment[]
}

export type HostOffer = {
  id: string
  postId: string
  host: UserLite
  pricePaise: number
  includes: string[]
  notes: string | null
  extraSeats: number
  state: 'pending' | 'accepted' | 'declined' | 'expired' | 'withdrawn'
  expiresAt: string
  packageSlug: string | null
  payBy: string | null
}

export type NotificationItem = {
  id: string
  type: string
  category: 'plans' | 'replies' | 'messages' | 'trips' | 'tags' | 'system'
  title: string
  body: string | null
  link: string | null
  isRead: boolean
  createdAt: string
  /** Present for Tribe events so clients can act inline (e.g. approve a join request). */
  postId?: string | null
  actorId?: string | null
}

// ── Row selections ────────────────────────────────────────────────────────
export const PROFILE_LITE = 'id, username, full_name, avatar_url, is_phone_verified, is_id_verified, is_host'
export const PACKAGE_LITE =
  'id, slug, title, images, price_paise, duration_days, departure_dates, max_group_size, is_active, host_id, destination:destinations(name, slug, state)'
export const POST_SELECT = `id, kind, author_id, title, body, place_name, place_slug, lat, lng, starts_on, ends_on,
  spots_total, audience, est_cost_text, converted_package_id, trip_package_id, show_on_trip_page, poll_options,
  status, comment_count, reaction_counts, member_count, created_at, updated_at,
  author:profiles!posts_author_id_fkey(${PROFILE_LITE}),
  media:post_media(url, thumb_url, lqip, width, height, position)`

type Row = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v : null)
const num = (v: unknown) => (typeof v === 'number' ? v : v == null ? null : Number(v))

export function toUserLite(r: Row | null | undefined): UserLite {
  return {
    id: String(r?.id ?? ''),
    username: String(r?.username ?? ''),
    name: String(r?.full_name || r?.username || 'Traveller'),
    avatarUrl: str(r?.avatar_url),
    isPhoneVerified: r?.is_phone_verified === true,
    isIdVerified: r?.is_id_verified === true,
    isHost: r?.is_host === true,
  }
}

export function mediaFromUrl(url: string | null | undefined): Media | null {
  if (!url) return null
  const thumb = storageThumbnailUrl(url)
  return { url, thumbUrl: thumb && thumb !== url ? thumb : null, lqip: null, width: null, height: null }
}

export function todayIST(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)
}

export function nextDeparture(dates: unknown): string | null {
  if (!Array.isArray(dates)) return null
  const today = todayIST()
  const upcoming = (dates as string[]).filter((d) => typeof d === 'string' && d >= today).sort()
  return upcoming[0] ?? null
}

export function toTripLite(
  r: Row,
  extra: { booked?: number; host?: UserLite | null; goingFaces?: UserLite[] } = {},
): TripLite {
  const dest = r.destination as Row | null
  const images = Array.isArray(r.images) ? (r.images as string[]) : []
  const total = num(r.max_group_size)
  const next = nextDeparture(r.departure_dates)
  return {
    id: String(r.id),
    slug: String(r.slug),
    title: String(r.title),
    place: dest ? { name: String(dest.name), slug: str(dest.slug), lat: null, lng: null } : null,
    image: mediaFromUrl(images[0]),
    priceFromPaise: num(r.price_paise) ?? 0,
    durationDays: num(r.duration_days) ?? 1,
    nextDeparture: next,
    seatsTotal: total,
    seatsLeft: total != null && next ? Math.max(total - (extra.booked ?? 0), 0) : null,
    host: extra.host ?? null,
    goingFaces: extra.goingFaces ?? [],
  }
}

export function toMedia(r: Row): Media {
  return {
    url: String(r.url),
    thumbUrl: str(r.thumb_url),
    lqip: str(r.lqip),
    width: num(r.width),
    height: num(r.height),
  }
}

export function toNotification(r: Row): NotificationItem {
  const meta = (r.metadata as Row | null) ?? {}
  const type = String(r.type)
  const category = (str(meta.category) ??
    (type === 'message' ? 'messages' : type.startsWith('tribe_') ? 'plans' : type.includes('booking') ? 'trips' : 'system')) as NotificationItem['category']
  return {
    id: String(r.id),
    type,
    category,
    title: String(r.title),
    body: str(r.body),
    link: str(r.link),
    isRead: r.is_read === true,
    createdAt: String(r.created_at),
    postId: str(meta.post_id),
    actorId: str(meta.actor_id),
  }
}

export function toHostOffer(r: Row): HostOffer {
  const pkg = r.package as Row | null
  return {
    id: String(r.id),
    postId: String(r.post_id),
    host: toUserLite(r.host as Row),
    pricePaise: num(r.price_paise) ?? 0,
    includes: Array.isArray(r.includes) ? (r.includes as string[]) : [],
    notes: str(r.notes),
    extraSeats: num(r.extra_seats) ?? 0,
    state: String(r.state) as HostOffer['state'],
    expiresAt: String(r.expires_at),
    packageSlug: pkg ? str(pkg.slug) : null,
    payBy: str(r.pay_by),
  }
}

export function placeSlug(name: string | null | undefined): string | null {
  if (!name) return null
  const s = name.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')
  return s.slice(0, 60) || null
}
