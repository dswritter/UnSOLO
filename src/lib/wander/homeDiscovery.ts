/**
 * Pure derivations for the homepage discovery sections (regions, vibes, hosts,
 * reviews). Kept free of Supabase / Next imports so they're unit-testable.
 */

export type DiscoveryPackage = {
  id: string
  title: string
  short_description: string | null
  description: string | null
  metadata: Record<string, unknown> | null
  price_paise: number
  duration_days: number
  difficulty: string | null
  images: string[] | null
  host_id: string | null
  destination: { name: string | null; state: string | null; country: string | null; image_url: string | null } | null
}

export type RegionTile = {
  key: string
  label: string
  /** Secondary line, e.g. country for non-Indian regions or top destinations. */
  caption: string
  tripCount: number
  /** Host-uploaded trip photo first (we store and serve those), seeded destination art second. */
  imageUrl: string | null
  /** Tried client-side when `imageUrl` fails to load. */
  fallbackImageUrl: string | null
  /** Explore search term — must match `destinations.state` (or name) for the search RPC. */
  query: string
}

function clean(value: string | null | undefined): string {
  return (value ?? '').trim()
}

/** Group active trips by destination state (falls back to destination name). */
export function buildRegionTiles(packages: DiscoveryPackage[], limit = 6): RegionTile[] {
  const groups = new Map<string, {
    label: string
    country: string
    count: number
    destinationImage: string | null
    packageImage: string | null
    destinations: Map<string, number>
  }>()
  for (const pkg of packages) {
    const dest = pkg.destination
    const label = clean(dest?.state) || clean(dest?.name)
    if (!label) continue
    const key = label.toLowerCase()
    let group = groups.get(key)
    if (!group) {
      group = { label, country: clean(dest?.country), count: 0, destinationImage: null, packageImage: null, destinations: new Map() }
      groups.set(key, group)
    }
    group.count += 1
    group.destinationImage ??= clean(dest?.image_url) || null
    group.packageImage ??= pkg.images?.find(img => clean(img)) ?? null
    const destName = clean(dest?.name)
    if (destName && destName.toLowerCase() !== key) {
      group.destinations.set(destName, (group.destinations.get(destName) ?? 0) + 1)
    }
  }
  return [...groups.entries()]
    .map(([key, g]) => {
      const topDestinations = [...g.destinations.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 2)
        .map(([name]) => name)
      const isAbroad = g.country !== '' && g.country.toLowerCase() !== 'india'
      const caption = topDestinations.length ? topDestinations.join(' · ') : isAbroad ? g.country : ''
      return {
        key,
        label: g.label,
        caption,
        tripCount: g.count,
        imageUrl: g.packageImage ?? g.destinationImage,
        fallbackImageUrl: g.packageImage && g.destinationImage !== g.packageImage ? g.destinationImage : null,
        query: g.label,
      }
    })
    .sort((a, b) => b.tripCount - a.tripCount || a.label.localeCompare(b.label))
    .slice(0, limit)
}

export type VibeId = 'weekend' | 'beginner' | 'budget' | 'snow' | 'spiritual' | 'long'

export type VibeBucket = {
  id: VibeId
  label: string
  blurb: string
  tripCount: number
  imageUrl: string | null
  /** Explore query params (without `search`/`tab`). */
  params: Record<string, string>
}

/** Same tokenisation as Postgres' `simple` text-search config for plain words. */
function tokens(pkg: DiscoveryPackage): Set<string> {
  const text = [pkg.title, pkg.short_description, pkg.description, pkg.metadata ? JSON.stringify(pkg.metadata) : '']
    .join(' ')
    .toLowerCase()
  return new Set(text.split(/[^a-z0-9]+/).filter(Boolean))
}

const VIBES: Array<{
  id: VibeId
  label: string
  blurb: string
  params: Record<string, string>
  matches: (pkg: DiscoveryPackage, words: Set<string>) => boolean
}> = [
  {
    id: 'weekend', label: 'Weekend getaways', blurb: 'Back by Monday',
    params: { minDays: '1', maxDays: '3' },
    matches: pkg => pkg.duration_days >= 1 && pkg.duration_days <= 3,
  },
  {
    id: 'snow', label: 'Snow & winter treks', blurb: 'Crunchy trails, warm chai',
    params: { q: 'snow' },
    matches: (_pkg, words) => words.has('snow'),
  },
  {
    id: 'beginner', label: 'Beginner friendly', blurb: 'Easy pace, first-timers welcome',
    params: { difficulty: 'easy' },
    matches: pkg => pkg.difficulty === 'easy',
  },
  {
    id: 'budget', label: 'Under ₹10K', blurb: 'Big trips, small budgets',
    params: { maxBudget: '10000' },
    matches: pkg => pkg.price_paise > 0 && pkg.price_paise <= 10_000 * 100,
  },
  {
    id: 'spiritual', label: 'Spiritual journeys', blurb: 'Temples, ghats & quiet mornings',
    params: { q: 'spiritual' },
    matches: (_pkg, words) => words.has('spiritual'),
  },
  {
    id: 'long', label: '8+ day journeys', blurb: 'Go deep, slow down',
    params: { minDays: '8' },
    matches: pkg => pkg.duration_days >= 8,
  },
]

/** Vibes with at least one matching trip, in curated order. */
export function buildVibeBuckets(packages: DiscoveryPackage[]): VibeBucket[] {
  const tokenCache = new Map<string, Set<string>>()
  const wordsFor = (pkg: DiscoveryPackage) => {
    let w = tokenCache.get(pkg.id)
    if (!w) {
      w = tokens(pkg)
      tokenCache.set(pkg.id, w)
    }
    return w
  }
  const usedImages = new Set<string>()
  const buckets: VibeBucket[] = []
  for (const vibe of VIBES) {
    const matching = packages.filter(pkg => vibe.matches(pkg, wordsFor(pkg)))
    if (!matching.length) continue
    const images = matching.map(p => p.images?.find(img => clean(img)) ?? null).filter((x): x is string => !!x)
    // Prefer an image not already used by an earlier vibe so the grid isn't repetitive.
    const imageUrl = images.find(img => !usedImages.has(img)) ?? images[0] ?? null
    if (imageUrl) usedImages.add(imageUrl)
    buckets.push({ id: vibe.id, label: vibe.label, blurb: vibe.blurb, tripCount: matching.length, imageUrl, params: vibe.params })
  }
  return buckets
}

export type HostCandidate = {
  id: string
  username: string | null
  full_name: string | null
  avatar_url: string | null
  bio: string | null
  location: string | null
  host_rating: number | null
  total_hosted_trips: number | null
  is_verified: boolean | null
}

export type HostCard = {
  id: string
  username: string
  name: string
  avatarUrl: string | null
  bio: string | null
  location: string | null
  rating: number | null
  tripsHosted: number
  liveListings: number
  verified: boolean
}

/** Rank hosts that have live listings: rated first, then experience, then listing count. */
export function rankHosts(profiles: HostCandidate[], liveListings: Map<string, number>, limit = 8): HostCard[] {
  return profiles
    .filter(p => clean(p.username) && (liveListings.get(p.id) ?? 0) > 0)
    .map(p => {
      const rating = Number(p.host_rating) > 0 ? Math.round(Number(p.host_rating) * 10) / 10 : null
      return {
        id: p.id,
        username: clean(p.username),
        name: clean(p.full_name) || clean(p.username),
        avatarUrl: clean(p.avatar_url) || null,
        bio: clean(p.bio) || null,
        location: clean(p.location) || null,
        rating,
        tripsHosted: Math.max(0, Number(p.total_hosted_trips) || 0),
        liveListings: liveListings.get(p.id) ?? 0,
        verified: !!p.is_verified,
      }
    })
    .sort((a, b) =>
      (b.rating ?? 0) - (a.rating ?? 0) ||
      b.tripsHosted - a.tripsHosted ||
      b.liveListings - a.liveListings ||
      a.name.localeCompare(b.name))
    .slice(0, limit)
}

export type ReviewRow = {
  id: string
  user_id: string
  package_id: string
  rating: number
  title: string | null
  body: string | null
  images: string[] | null
  created_at: string
}

export type ReviewCard = {
  id: string
  title: string | null
  body: string
  createdAt: string
  imageUrl: string | null
  reviewer: { username: string; name: string; avatarUrl: string | null }
  trip: { title: string; slug: string; destination: string | null } | null
}

const MIN_REVIEW_LENGTH = 24
const MAX_REVIEW_LENGTH = 220

export function truncateReview(body: string, max = MAX_REVIEW_LENGTH): string {
  const text = body.replace(/\s+/g, ' ').trim()
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:!-]+$/, '')}…`
}

/** Recent, substantive 5★ reviews — one per reviewer, skipping anonymous/deleted profiles. */
export function pickReviewCards(
  reviews: ReviewRow[],
  profiles: Map<string, { username: string | null; full_name: string | null; avatar_url: string | null }>,
  packages: Map<string, { title: string; slug: string; images: string[] | null; is_active: boolean | null; destination: string | null }>,
  limit = 10,
): ReviewCard[] {
  const seenReviewers = new Set<string>()
  const cards: ReviewCard[] = []
  for (const review of [...reviews].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    if (review.rating < 5) continue
    const body = clean(review.body)
    if (body.length < MIN_REVIEW_LENGTH) continue
    if (seenReviewers.has(review.user_id)) continue
    const profile = profiles.get(review.user_id)
    const username = clean(profile?.username)
    if (!profile || !username) continue
    const pkg = packages.get(review.package_id)
    seenReviewers.add(review.user_id)
    cards.push({
      id: review.id,
      title: clean(review.title) || null,
      body: truncateReview(body),
      createdAt: review.created_at,
      imageUrl: review.images?.find(img => clean(img)) ?? pkg?.images?.find(img => clean(img)) ?? null,
      reviewer: { username, name: clean(profile.full_name) || username, avatarUrl: clean(profile.avatar_url) || null },
      trip: pkg && pkg.is_active ? { title: pkg.title, slug: pkg.slug, destination: pkg.destination } : null,
    })
    if (cards.length >= limit) break
  }
  return cards
}
