/** Refund tier rows stored in platform_settings (JSON array). */

export type RefundTier = {
  /**
   * Inclusive lower bound in days. If `minHoursBefore` is present, it overrides this for sub-day precision.
   */
  minDaysBefore: number
  /** Inclusive upper bound in days when set. */
  maxDaysBefore?: number | null
  /** Optional sub-day lower bound in hours. When present, takes precedence over minDaysBefore for matching. */
  minHoursBefore?: number | null
  /** Optional sub-day upper bound in hours. Matches with `minHoursBefore`. */
  maxHoursBefore?: number | null
  percent: number
  /** Table row label; falls back to generated copy if missing. */
  label?: string
}

/** Canonical category key for tier lookups. */
export type RefundTierCategory = 'unsolo' | 'host' | 'stays' | 'activities' | 'rentals'

// ── Defaults per category ────────────────────────────────────────────────────

const DEFAULT_UNSLO: RefundTier[] = [
  { minDaysBefore: 15, percent: 100, label: '15+ days before departure' },
  { minDaysBefore: 7, maxDaysBefore: 14, percent: 75, label: '7–14 days before departure' },
  { minDaysBefore: 2, maxDaysBefore: 6, percent: 50, label: '2–6 days before departure (48h+)' },
  { minDaysBefore: 0, maxDaysBefore: 1, percent: 0, label: 'Less than 2 days' },
]

const DEFAULT_HOST: RefundTier[] = DEFAULT_UNSLO.map((t) => ({ ...t }))

const DEFAULT_STAYS: RefundTier[] = [
  { minDaysBefore: 7, percent: 100, label: '7+ days before check-in' },
  { minDaysBefore: 4, maxDaysBefore: 6, percent: 75, label: '4–6 days before check-in' },
  { minDaysBefore: 2, maxDaysBefore: 3, percent: 50, label: '2–3 days before check-in' },
  { minDaysBefore: 1, maxDaysBefore: 1, percent: 25, label: '24 hours before check-in' },
  { minDaysBefore: 0, maxDaysBefore: 0, percent: 0, label: 'Same day / no-show' },
]

const DEFAULT_ACTIVITIES: RefundTier[] = [
  { minDaysBefore: 3, percent: 100, label: '3+ days before start' },
  { minDaysBefore: 2, maxDaysBefore: 2, percent: 50, label: '48+ hours before start' },
  { minDaysBefore: 1, maxDaysBefore: 1, percent: 25, label: '24+ hours before start' },
  { minDaysBefore: 0, maxDaysBefore: 0, percent: 0, label: 'Same day' },
]

const DEFAULT_RENTALS: RefundTier[] = [
  { minDaysBefore: 2, minHoursBefore: 48, percent: 100, label: '48+ hours before pickup' },
  { minDaysBefore: 1, minHoursBefore: 24, maxHoursBefore: 47, percent: 75, label: '24–48 hours before pickup' },
  { minDaysBefore: 0, minHoursBefore: 12, maxHoursBefore: 23, percent: 50, label: '12–24 hours before pickup' },
  { minDaysBefore: 0, minHoursBefore: 0, maxHoursBefore: 11, percent: 0, label: 'Less than 12 hours' },
]

export function defaultUnsoloRefundTiers(): RefundTier[] { return DEFAULT_UNSLO.map((t) => ({ ...t })) }
export function defaultHostRefundTiers(): RefundTier[] { return DEFAULT_HOST.map((t) => ({ ...t })) }
export function defaultStaysRefundTiers(): RefundTier[] { return DEFAULT_STAYS.map((t) => ({ ...t })) }
export function defaultActivitiesRefundTiers(): RefundTier[] { return DEFAULT_ACTIVITIES.map((t) => ({ ...t })) }
export function defaultRentalsRefundTiers(): RefundTier[] { return DEFAULT_RENTALS.map((t) => ({ ...t })) }

export const REFUND_TIER_SETTING_KEYS: Record<RefundTierCategory, string> = {
  unsolo: 'refund_tiers_unsolo',
  host: 'refund_tiers_host',
  stays: 'refund_tiers_stays',
  activities: 'refund_tiers_activities',
  rentals: 'refund_tiers_rentals',
}

export function defaultTiersFor(category: RefundTierCategory): RefundTier[] {
  switch (category) {
    case 'unsolo': return defaultUnsoloRefundTiers()
    case 'host': return defaultHostRefundTiers()
    case 'stays': return defaultStaysRefundTiers()
    case 'activities': return defaultActivitiesRefundTiers()
    case 'rentals': return defaultRentalsRefundTiers()
  }
}

// ── Parse / serialize ─────────────────────────────────────────────────────────

export function parseRefundTiersJson(raw: string | null | undefined, fallback: RefundTier[]): RefundTier[] {
  if (!raw?.trim()) return fallback
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed) || parsed.length === 0) return fallback
    const out: RefundTier[] = []
    for (const row of parsed) {
      if (!row || typeof row !== 'object') continue
      const r = row as Record<string, unknown>
      const minDaysBefore = typeof r.minDaysBefore === 'number' ? r.minDaysBefore : Number(r.minDaysBefore)
      const percent = typeof r.percent === 'number' ? r.percent : Number(r.percent)
      if (!Number.isFinite(minDaysBefore) || !Number.isFinite(percent)) continue
      const asOptionalNum = (v: unknown): number | undefined => {
        if (v === undefined || v === null) return undefined
        const n = typeof v === 'number' ? v : Number(v)
        return Number.isFinite(n) ? n : undefined
      }
      out.push({
        minDaysBefore,
        maxDaysBefore: asOptionalNum(r.maxDaysBefore),
        minHoursBefore: asOptionalNum(r.minHoursBefore),
        maxHoursBefore: asOptionalNum(r.maxHoursBefore),
        percent,
        label: typeof r.label === 'string' ? r.label : undefined,
      })
    }
    return out.length > 0 ? out : fallback
  } catch {
    return fallback
  }
}

/** Persist tiers to platform_settings `value` (pretty-printed JSON array). */
export function serializeRefundTiersJson(tiers: RefundTier[]): string {
  const rows = tiers.map((t) => {
    const o: Record<string, number | string> = {
      minDaysBefore: Math.round(Number(t.minDaysBefore)),
      percent: Math.round(Number(t.percent)),
    }
    if (t.maxDaysBefore != null && Number.isFinite(t.maxDaysBefore)) {
      o.maxDaysBefore = Math.round(Number(t.maxDaysBefore))
    }
    if (t.minHoursBefore != null && Number.isFinite(t.minHoursBefore)) {
      o.minHoursBefore = Math.round(Number(t.minHoursBefore))
    }
    if (t.maxHoursBefore != null && Number.isFinite(t.maxHoursBefore)) {
      o.maxHoursBefore = Math.round(Number(t.maxHoursBefore))
    }
    if (t.label?.trim()) o.label = t.label.trim()
    return o
  })
  return JSON.stringify(rows, null, 2)
}

// ── Matching ─────────────────────────────────────────────────────────────────

/** Returns the tier's bounds in hours for consistent matching. */
function tierBoundsHours(t: RefundTier): { minH: number; maxH: number | null } {
  const minH = t.minHoursBefore != null && Number.isFinite(t.minHoursBefore)
    ? t.minHoursBefore
    : t.minDaysBefore * 24
  const maxH =
    t.maxHoursBefore != null && Number.isFinite(t.maxHoursBefore)
      ? t.maxHoursBefore
      : t.maxDaysBefore != null && Number.isFinite(t.maxDaysBefore)
        ? (t.maxDaysBefore + 1) * 24 - 1 // inclusive day-range upper: "6 days" means up to 6d 23:59
        : null
  return { minH, maxH }
}

/**
 * Returns the refund % applicable right now for a booking whose travel/start
 * is `travelDateIso`. Uses hours-level precision so sub-day rental tiers work.
 * `now` is injectable for tests.
 */
export function currentRefundPercent(
  travelDateIso: string | null | undefined,
  tiers: RefundTier[],
  now: Date = new Date(),
): number {
  if (!travelDateIso) return 0
  const travel = new Date(travelDateIso).getTime()
  if (!Number.isFinite(travel)) return 0
  const hoursBefore = (travel - now.getTime()) / (60 * 60 * 1000)
  if (hoursBefore < 0) return 0
  let pct = 0
  for (const t of tiers) {
    const { minH, maxH } = tierBoundsHours(t)
    const inBand = hoursBefore >= minH && (maxH == null || hoursBefore <= maxH)
    if (inBand) pct = Math.max(pct, t.percent)
  }
  return pct
}

// ── Labels ───────────────────────────────────────────────────────────────────

export function tierRefundLabel(percent: number): string {
  if (percent <= 0) return 'No refund'
  if (percent >= 100) return 'Full refund (100%)'
  return `${percent}% refund`
}

/** Row label for the policy table when `label` is omitted in JSON. */
export function tierTimelineLabel(t: RefundTier): string {
  if (t.label?.trim()) return t.label.trim()
  if (t.minHoursBefore != null || t.maxHoursBefore != null) {
    const minH = t.minHoursBefore ?? t.minDaysBefore * 24
    const maxH = t.maxHoursBefore ?? (t.maxDaysBefore != null ? (t.maxDaysBefore + 1) * 24 - 1 : null)
    if (maxH == null) return `${minH}+ hours before`
    return `${minH}–${maxH} hours before`
  }
  if (t.maxDaysBefore != null && Number.isFinite(t.maxDaysBefore)) {
    return `${t.minDaysBefore}–${t.maxDaysBefore} days before departure`
  }
  return `${t.minDaysBefore}+ days before departure`
}

export function validateRefundTiers(
  tiers: RefundTier[]
): { ok: true } | { ok: false; message: string } {
  if (tiers.length === 0) {
    return { ok: false, message: 'Add at least one refund tier.' }
  }
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i]
    const min = Number(t.minDaysBefore)
    const pct = Number(t.percent)
    if (!Number.isFinite(min) || min < 0) {
      return { ok: false, message: `Tier ${i + 1}: “Min days” must be 0 or greater.` }
    }
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return { ok: false, message: `Tier ${i + 1}: Refund % must be between 0 and 100.` }
    }
    if (t.maxDaysBefore != null && Number.isFinite(t.maxDaysBefore)) {
      const max = Number(t.maxDaysBefore)
      if (max < min) {
        return { ok: false, message: `Tier ${i + 1}: “Max days” must be ≥ “Min days” (or leave max empty).` }
      }
    }
    if (t.minHoursBefore != null && Number.isFinite(t.minHoursBefore)) {
      const minH = Number(t.minHoursBefore)
      if (minH < 0) return { ok: false, message: `Tier ${i + 1}: “Min hours” must be 0 or greater.` }
      if (t.maxHoursBefore != null && Number.isFinite(t.maxHoursBefore) && Number(t.maxHoursBefore) < minH) {
        return { ok: false, message: `Tier ${i + 1}: “Max hours” must be ≥ “Min hours”.` }
      }
    }
  }
  return { ok: true }
}

// ── Category resolver ────────────────────────────────────────────────────────

/**
 * Map a booking to its refund-tier category.
 * - service-listing stays → 'stays'
 * - service-listing activities → 'activities'
 * - service-listing rentals / getting_around → 'rentals'
 * - community (host-owned) package → 'host'
 * - UnSOLO-owned package → 'unsolo'
 */
export function resolveRefundCategory(input: {
  serviceListingType?: string | null
  packageHostId?: string | null
  isServiceListing?: boolean
}): RefundTierCategory {
  if (input.isServiceListing || input.serviceListingType) {
    const t = (input.serviceListingType || '').toLowerCase()
    if (t === 'stays') return 'stays'
    if (t === 'activities') return 'activities'
    if (t === 'rentals' || t === 'getting_around') return 'rentals'
  }
  if (input.packageHostId) return 'host'
  return 'unsolo'
}
