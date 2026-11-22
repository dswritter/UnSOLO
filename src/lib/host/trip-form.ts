/**
 * TripForm (docs/revamp/api-v1-host.md): validation and conversion to and from `packages` rows.
 * The web form (src/components/hosting/HostTripForm.tsx) checks these rules on the client only;
 * the native Host API checks them here, on the server.
 */
import { z } from 'zod'
import { ApiError, parseWith } from '@/lib/api/http'
import { INTEREST_TAGS } from '@/lib/constants'
import { parseSearchKeywords } from '@/lib/explore/search-metadata'
import { readListingPin } from '@/lib/listing-location'
import { minPricePaiseFromVariants, parsePriceVariants, priceVariantsFromFormRows, type PriceVariant } from '@/lib/package-pricing'
import { maxInclusiveSpanDays, tripDepartureDateKey } from '@/lib/package-trip-calendar'
import { addTripCalendarDays, MAX_TRIP_DEPARTURES, normalizeTripDeparturePairs } from '@/lib/trip-departure-recurrence'

type Row = Record<string, unknown>

const MIN_PRICE_PAISE = 100
const MAX_PRICE_PAISE = 100_000_000 // ₹10 lakh per person: a typo guard, not a business rule.

const money = (label: string) =>
  z.number({ error: `Enter ${label}` }).int(`${label} must be in whole paise`).min(MIN_PRICE_PAISE, `${label} must be at least ₹1`).max(MAX_PRICE_PAISE, `${label} is too high`)
const compareAt = z.number().int('Original price must be in whole paise').max(MAX_PRICE_PAISE, 'Original price is too high').nullish()
const age = z.number().int().min(18, 'Age must be 18–99').max(99, 'Age must be 18–99').nullish()

export const TripFormSchema = z.object({
  title: z.string({ error: 'Enter a title' }).trim().min(1, 'Enter a title').max(100, 'Keep the title under 100 characters'),
  destinationId: z.string({ error: 'Choose a destination' }).uuid('Choose a destination'),
  shortDescription: z.string().trim().max(150, 'Keep the short description under 150 characters').nullish(),
  description: z.string({ error: 'Add a description' }).trim().min(1, 'Add a description').max(20_000, 'Keep the description under 20,000 characters'),
  searchKeywords: z.string().max(1200, 'Keep search keywords under 1,200 characters').nullish(),
  meetingAddress: z.string().trim().max(300, 'Keep the meeting address under 300 characters').nullish(),
  meetingPoint: z.object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    label: z.string().trim().max(300),
  }).nullish(),
  pricePaise: money('a price per person'),
  compareAtPaise: compareAt,
  priceVariants: z.array(z.object({
    description: z.string({ error: 'Describe this price tier' }).trim().min(1, 'Describe this price tier').max(80, 'Keep tier descriptions under 80 characters'),
    pricePaise: money('a tier price'),
    compareAtPaise: compareAt,
  })).max(10, 'Use at most 10 price tiers').nullish(),
  tripDays: z.number({ error: 'Enter trip days' }).int().min(1, 'Trip days must be 1–60').max(60, 'Trip days must be 1–60'),
  tripNights: z.number({ error: 'Enter trip nights' }).int().min(0, 'Trip nights must be 0–60').max(60, 'Trip nights must be 0–60'),
  excludeFirstDayTravel: z.boolean(),
  departureTime: z.enum(['morning', 'evening']),
  returnTime: z.enum(['morning', 'evening']),
  maxGroupSize: z.number({ error: 'Enter a max group size' }).int().min(2, 'Max group size must be at least 2'),
  difficulty: z.enum(['easy', 'moderate', 'challenging']),
  departures: z.array(z.object({
    date: z.string({ error: 'Enter a departure date' }),
    returnDate: z.string({ error: 'Enter a return date' }),
  })).min(1, 'Add at least one departure').max(MAX_TRIP_DEPARTURES, `A trip can have at most ${MAX_TRIP_DEPARTURES} departures`),
  includes: z.array(z.string().trim().min(1, 'Includes can’t be blank').max(60, 'Keep each include under 60 characters')).max(30, 'Add at most 30 includes').default([]),
  images: z.array(z.string().trim().url('Upload photos through UnSOLO').max(1000)).min(1, 'Add at least one photo').max(12, 'Add at most 12 photos'),
  joinPreferences: z.object({
    paymentTiming: z.enum(['after_host_approval', 'pay_on_booking']),
    tokenDepositEnabled: z.boolean().default(false),
    tokenAmountPaise: z.number().int().nullish(),
    minTripsCompleted: z.number().int().min(0, 'Min trips can’t be negative').max(1000).nullish(),
    // 'all' is what the web form calls "everyone"; it saves as no preference.
    genderPreference: z.enum(['men', 'women', 'all']).nullish(),
    interestTags: z.array(z.string().trim().min(1).max(40)).max(20, 'Pick at most 20 interest tags').nullish(),
    minAge: age,
    maxAge: age,
  }),
})

export type TripForm = {
  title: string
  destinationId: string
  shortDescription?: string | null
  description: string
  searchKeywords?: string | null
  meetingAddress?: string | null
  meetingPoint?: { lat: number; lon: number; label: string } | null
  pricePaise: number
  compareAtPaise?: number | null
  priceVariants?: { description: string; pricePaise: number; compareAtPaise?: number | null }[] | null
  tripDays: number
  tripNights: number
  excludeFirstDayTravel: boolean
  departureTime: 'morning' | 'evening'
  returnTime: 'morning' | 'evening'
  maxGroupSize: number
  difficulty: 'easy' | 'moderate' | 'challenging'
  departures: { date: string; returnDate: string }[]
  includes: string[]
  images: string[]
  joinPreferences: {
    paymentTiming: 'after_host_approval' | 'pay_on_booking'
    tokenDepositEnabled: boolean
    tokenAmountPaise?: number | null
    minTripsCompleted?: number | null
    genderPreference?: 'men' | 'women' | 'all' | null
    interestTags?: string[] | null
    minAge?: number | null
    maxAge?: number | null
  }
}

export type TripFormRules = {
  /** IST calendar day (YYYY-MM-DD). */
  today: string
  /** Platform max (platform_settings.host_max_group_size, default 50). */
  maxGroupSize: number
  /** Public prefix of our image storage; uploads through POST /uploads start with it. */
  storagePrefix: string
  /** The trip being edited (PUT): its existing dates, photos, tags and size stay allowed. */
  existing?: Row | null
}

const bad = (field: string, message: string) => new ApiError('bad_request', message, { field })

function isCalendarDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/** The checked form plus the row values derived from it (sorted departures, min tier price, span). */
export type ValidTripForm = TripForm & {
  pairs: { dep: string; ret: string }[]
  tiers: PriceVariant[] | null
  durationDays: number
}

/**
 * Parses and checks a TripForm body. Throws `ApiError('bad_request', message, { field })` on the
 * first problem. Mirrors HostTripForm `canProceed` + `buildTripPersistPayload`, plus the contract's
 * server rules (lengths, platform group size, storage-only photos, no new past dates).
 */
export function validateTripForm(raw: unknown, rules: TripFormRules): ValidTripForm {
  const f = parseWith(TripFormSchema, raw) as TripForm
  const existing = rules.existing ?? null

  // Pricing: one price, or 2–10 tiers where the listed price is the cheapest tier.
  const rawTiers = f.priceVariants ?? []
  if (rawTiers.length === 1) throw bad('priceVariants', 'Add at least two price tiers, or use a single price')
  let tiers: PriceVariant[] | null = null
  let pricePaise = f.pricePaise
  let compareAtPaise: number | null = null
  if (rawTiers.length >= 2) {
    rawTiers.forEach((t, i) => {
      if (t.compareAtPaise != null && t.compareAtPaise <= t.pricePaise) {
        throw bad(`priceVariants.${i}.compareAtPaise`, 'Original price must be higher than the current price')
      }
    })
    tiers = priceVariantsFromFormRows(rawTiers.map((t) => ({ pricePaise: t.pricePaise, compareAtPaise: t.compareAtPaise ?? null, facilities: t.description })))
    pricePaise = minPricePaiseFromVariants(tiers!)
  } else if (f.compareAtPaise != null) {
    if (f.compareAtPaise < MIN_PRICE_PAISE) throw bad('compareAtPaise', 'Enter a valid original price (minimum ₹1)')
    if (f.compareAtPaise <= pricePaise) throw bad('compareAtPaise', 'Original price must be higher than the current price')
    compareAtPaise = f.compareAtPaise
  }

  // Departures: real dates, return on or after departure, one row per date, no new past dates.
  const existingDeps = new Set(((existing?.departure_dates as string[] | null) ?? []).map(tripDepartureDateKey))
  const seen = new Set<string>()
  f.departures.forEach((d, i) => {
    const dep = d.date.trim(), ret = d.returnDate.trim()
    if (!isCalendarDate(dep)) throw bad(`departures.${i}.date`, 'Enter a valid departure date (YYYY-MM-DD)')
    if (!isCalendarDate(ret)) throw bad(`departures.${i}.returnDate`, 'Enter a valid return date (YYYY-MM-DD)')
    if (ret < dep) throw bad(`departures.${i}.returnDate`, 'Return date must be on or after departure')
    if (seen.has(dep)) throw bad(`departures.${i}.date`, `Departure ${dep} is listed twice`)
    seen.add(dep)
    if (dep < rules.today && !existingDeps.has(dep)) throw bad(`departures.${i}.date`, 'Departure date cannot be in the past')
  })
  let pairs: { dep: string; ret: string }[]
  try {
    pairs = normalizeTripDeparturePairs(f.departures.map((d) => ({ dep: d.date.trim(), ret: d.returnDate.trim() })))
  } catch (e) {
    throw bad('departures', e instanceof Error ? e.message : 'Invalid departure schedule')
  }
  if (pairs.length === 0) throw bad('departures', 'Add at least one departure date and return date')

  // Group size: platform max, unless the trip already had a larger size before the max changed.
  const currentSize = existing ? Number(existing.max_group_size) : null
  if (f.maxGroupSize > rules.maxGroupSize && f.maxGroupSize !== currentSize) {
    throw bad('maxGroupSize', `Maximum group size allowed is ${rules.maxGroupSize}`)
  }

  // Photos: our storage only (upload with POST /uploads purpose host); photos already on the trip stay.
  const existingImages = new Set((existing?.images as string[] | null) ?? [])
  f.images.forEach((u, i) => {
    if (!u.startsWith(rules.storagePrefix) && !existingImages.has(u)) throw bad(`images.${i}`, 'Upload photos through UnSOLO')
  })
  if (new Set(f.images).size !== f.images.length) throw bad('images', 'The same photo is added twice')

  // Join preferences.
  const jp = f.joinPreferences
  if (jp.tokenDepositEnabled) {
    const t = jp.tokenAmountPaise
    if (t == null || t < MIN_PRICE_PAISE) throw bad('joinPreferences.tokenAmountPaise', 'Enter a valid token amount per person (minimum ₹1)')
    if (t > pricePaise) throw bad('joinPreferences.tokenAmountPaise', 'Token amount cannot exceed your listed price per person')
  }
  if (jp.minAge != null && jp.maxAge != null && jp.minAge > jp.maxAge) {
    throw bad('joinPreferences.maxAge', 'Max age must be at least the min age')
  }
  const existingTags = new Set((((existing?.join_preferences as Row | null)?.interest_tags as string[] | undefined) ?? []))
  const allowedTags = new Set<string>(INTEREST_TAGS)
  ;(jp.interestTags ?? []).forEach((tag, i) => {
    if (!allowedTags.has(tag) && !existingTags.has(tag)) throw bad(`joinPreferences.interestTags.${i}`, `Unknown interest tag: ${tag}`)
  })

  return {
    ...f,
    pricePaise,
    compareAtPaise,
    includes: [...new Set(f.includes)],
    joinPreferences: { ...jp, interestTags: jp.interestTags ? [...new Set(jp.interestTags)] : null },
    pairs,
    tiers,
    durationDays: maxInclusiveSpanDays(pairs),
  }
}

/** Removes undefined keys so jsonb rows and comparisons stay clean. */
function compact<T extends Row>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
}

/** Same join_preferences shape the web form writes. */
export function joinPreferencesFromForm(jp: TripForm['joinPreferences']): Row {
  return compact({
    gender_preference: jp.genderPreference === 'men' || jp.genderPreference === 'women' ? jp.genderPreference : undefined,
    min_trips_completed: jp.minTripsCompleted ?? undefined,
    interest_tags: jp.interestTags?.length ? jp.interestTags : undefined,
    payment_timing: jp.paymentTiming,
    token_deposit_enabled: jp.tokenDepositEnabled ? true : undefined,
    token_amount_paise: jp.tokenDepositEnabled ? jp.tokenAmountPaise ?? undefined : undefined,
    min_age: jp.minAge ?? undefined,
    max_age: jp.maxAge ?? undefined,
  })
}

/**
 * The `packages` columns a TripForm sets (create and full edit). `prevMetadata` keeps metadata keys
 * the form doesn't own, as the web form does.
 */
export function tripFormToRow(f: ValidTripForm, prevMetadata: Row | null = null): Row {
  return {
    title: f.title,
    destination_id: f.destinationId,
    description: f.description,
    short_description: f.shortDescription?.trim() || null,
    metadata: {
      ...(prevMetadata ?? {}),
      search_keywords: parseSearchKeywords(f.searchKeywords ?? ''),
      meeting_address: f.meetingAddress?.trim() ?? '',
      meeting_point: f.meetingPoint ? { lat: f.meetingPoint.lat, lon: f.meetingPoint.lon, label: f.meetingPoint.label } : null,
    },
    price_paise: f.pricePaise,
    compare_at_price_paise: f.tiers ? null : f.compareAtPaise ?? null,
    price_variants: f.tiers,
    duration_days: f.durationDays,
    trip_days: f.tripDays,
    trip_nights: f.tripNights,
    exclude_first_day_travel: f.excludeFirstDayTravel,
    departure_time: f.departureTime,
    return_time: f.returnTime,
    departure_dates: f.pairs.map((p) => p.dep),
    return_dates: f.pairs.map((p) => p.ret),
    max_group_size: f.maxGroupSize,
    difficulty: f.difficulty,
    includes: f.includes,
    images: f.images,
    join_preferences: joinPreferencesFromForm(f.joinPreferences),
  }
}

const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)

/** A trip row as the TripForm the edit screen starts from (GET /host/trips/{id}/form). */
export function rowToTripForm(row: Row): TripForm {
  const meta = (row.metadata as Row | null) ?? {}
  const keywords = Array.isArray(meta.search_keywords) ? (meta.search_keywords as unknown[]).filter((v): v is string => typeof v === 'string') : []
  const tiers = parsePriceVariants(row.price_variants)
  const deps = ((row.departure_dates as string[] | null) ?? []).map(tripDepartureDateKey)
  const rets = ((row.return_dates as string[] | null) ?? []).map((r) => (r ? tripDepartureDateKey(r) : ''))
  const span = Math.max(Number(row.duration_days ?? 1) || 1, 1)
  const jp = (row.join_preferences as Row | null) ?? {}
  const legacyToken = jp.payment_timing === 'token_to_book'
  const token = numOrNull(jp.token_amount_paise)
  const tokenOn = legacyToken || (jp.token_deposit_enabled === true && token != null)
  const gender = jp.gender_preference === 'men' || jp.gender_preference === 'women' ? jp.gender_preference : null
  const pricePaise = Number(row.price_paise ?? 0)
  const compare = numOrNull(row.compare_at_price_paise)
  return {
    title: String(row.title ?? ''),
    destinationId: String(row.destination_id ?? ''),
    shortDescription: (row.short_description as string | null) || null,
    description: String(row.description ?? ''),
    searchKeywords: keywords.join(', '),
    meetingAddress: typeof meta.meeting_address === 'string' ? meta.meeting_address : '',
    meetingPoint: readListingPin(meta.meeting_point),
    pricePaise,
    compareAtPaise: tiers ? null : compare != null && compare > pricePaise ? compare : null,
    priceVariants: tiers ? tiers.map((t) => ({ description: t.description, pricePaise: t.price_paise, compareAtPaise: t.compare_at_paise ?? null })) : [],
    tripDays: Number(row.trip_days ?? row.duration_days ?? 1),
    tripNights: Number(row.trip_nights ?? 0),
    excludeFirstDayTravel: row.exclude_first_day_travel !== false,
    departureTime: row.departure_time === 'evening' ? 'evening' : 'morning',
    returnTime: row.return_time === 'evening' ? 'evening' : 'morning',
    maxGroupSize: Number(row.max_group_size ?? 12),
    difficulty: row.difficulty === 'easy' || row.difficulty === 'challenging' ? row.difficulty : 'moderate',
    departures: deps.map((date, i) => ({ date, returnDate: rets[i] || addTripCalendarDays(date, span - 1) })),
    includes: ((row.includes as string[] | null) ?? []).slice(),
    images: ((row.images as string[] | null) ?? []).slice(),
    joinPreferences: {
      paymentTiming: jp.payment_timing === 'pay_on_booking' || legacyToken ? 'pay_on_booking' : 'after_host_approval',
      tokenDepositEnabled: tokenOn,
      tokenAmountPaise: tokenOn ? token : null,
      minTripsCompleted: numOrNull(jp.min_trips_completed),
      genderPreference: gender,
      interestTags: Array.isArray(jp.interest_tags) ? (jp.interest_tags as string[]).slice() : [],
      minAge: numOrNull(jp.min_age),
      maxAge: numOrNull(jp.max_age),
    },
  }
}

/** Changes to these columns on an approved trip don't send it back to review (web HOST_TRIP_OPERATIONAL_FIELDS). */
export const HOST_TRIP_OPERATIONAL_FIELDS = new Set([
  'departure_dates',
  'return_dates',
  'duration_days',
  'max_group_size',
  'trip_days',
  'trip_nights',
  'exclude_first_day_travel',
  'departure_time',
  'return_time',
  'departure_dates_closed',
  'booking_cutoff_dates',
])

/**
 * Canonical form for comparing a saved value with a new one: object keys sorted (jsonb reorders
 * them), and empty values (null, '', [], {}) treated alike so "nothing" never counts as a change.
 */
function canonical(v: unknown): unknown {
  if (v === undefined || v === null || v === '') return null
  if (Array.isArray(v)) return v.length ? v.map(canonical) : null
  if (typeof v === 'object') {
    const entries = Object.entries(v as Row)
      .map(([k, x]) => [k, canonical(x)] as const)
      .filter(([, x]) => x !== null)
      .sort(([a], [b]) => a.localeCompare(b))
    return entries.length ? Object.fromEntries(entries) : null
  }
  if (typeof v === 'string') return v.trim() === '' ? null : v
  return v
}

export function fieldChanged(prev: unknown, next: unknown): boolean {
  return JSON.stringify(canonical(prev)) !== JSON.stringify(canonical(next))
}

/** True when `next` changes anything outside the operational fields compared with the saved row. */
export function hasSubstantiveChange(prev: Row, next: Row): boolean {
  return Object.keys(next).some((k) => !HOST_TRIP_OPERATIONAL_FIELDS.has(k) && fieldChanged(prev[k], next[k]))
}

/** Keeps closed dates and cutoffs only for departures that still exist. */
export function pruneToDepartures(prev: Row, departureDates: string[]): { departure_dates_closed: string[]; booking_cutoff_dates: Record<string, string> } {
  const keep = new Set(departureDates.map(tripDepartureDateKey))
  const closed = ((prev.departure_dates_closed as string[] | null) ?? []).map(tripDepartureDateKey).filter((k) => keep.has(k))
  const cutoffs = Object.fromEntries(
    Object.entries((prev.booking_cutoff_dates as Record<string, string> | null) ?? {}).filter(([k]) => keep.has(tripDepartureDateKey(k))),
  )
  return { departure_dates_closed: [...new Set(closed)].sort(), booking_cutoff_dates: cutoffs }
}

/** URL-safe slug from the title (≤60) plus a base36 timestamp, as the web does. */
export function tripSlug(title: string, now = Date.now()): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
  return `${base || 'trip'}-${now.toString(36)}`
}
