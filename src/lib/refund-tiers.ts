/** Refund tier rows stored in platform_settings (JSON array). */

export type RefundTier = {
  /** Inclusive lower bound: days before departure must be >= this to match (unless using open-ended max). */
  minDaysBefore: number
  /** Inclusive upper bound when set (e.g. 29 for "15–29 days"). Omit for open-ended high band. */
  maxDaysBefore?: number | null
  percent: number
  /** Table row label; falls back to generated copy if missing. */
  label?: string
}

const DEFAULT_UNSLO: RefundTier[] = [
  { minDaysBefore: 30, percent: 100, label: '30+ days before departure' },
  { minDaysBefore: 15, maxDaysBefore: 29, percent: 75, label: '15–29 days before departure' },
  { minDaysBefore: 7, maxDaysBefore: 14, percent: 50, label: '7–14 days before departure' },
  { minDaysBefore: 0, maxDaysBefore: 6, percent: 0, label: 'Less than 7 days' },
]

/** Host/community: same schedule by default; admins may tighten separately. */
const DEFAULT_HOST: RefundTier[] = [...DEFAULT_UNSLO]

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
      const maxDaysBefore =
        r.maxDaysBefore === undefined || r.maxDaysBefore === null
          ? undefined
          : typeof r.maxDaysBefore === 'number'
            ? r.maxDaysBefore
            : Number(r.maxDaysBefore)
      out.push({
        minDaysBefore,
        maxDaysBefore: Number.isFinite(maxDaysBefore!) ? maxDaysBefore : undefined,
        percent,
        label: typeof r.label === 'string' ? r.label : undefined,
      })
    }
    return out.length > 0 ? out : fallback
  } catch {
    return fallback
  }
}

export function defaultUnsoloRefundTiers(): RefundTier[] {
  return DEFAULT_UNSLO.map((t) => ({ ...t }))
}

export function defaultHostRefundTiers(): RefundTier[] {
  return DEFAULT_HOST.map((t) => ({ ...t }))
}

export function tierRefundLabel(percent: number): string {
  if (percent <= 0) return 'No refund'
  if (percent >= 100) return 'Full refund (100%)'
  return `${percent}% refund`
}

/** Row label for the policy table when `label` is omitted in JSON. */
export function tierTimelineLabel(t: RefundTier): string {
  if (t.label?.trim()) return t.label.trim()
  if (t.maxDaysBefore != null && Number.isFinite(t.maxDaysBefore)) {
    return `${t.minDaysBefore}–${t.maxDaysBefore} days before departure`
  }
  return `${t.minDaysBefore}+ days before departure`
}
