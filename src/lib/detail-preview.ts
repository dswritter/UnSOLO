/**
 * What a listing card already knows about its detail page, saved on click so the
 * detail route's loading state can paint real content instead of a skeleton.
 * localStorage (not sessionStorage) because desktop opens details in a new tab.
 */
export type DetailPreview = {
  title: string
  image: string | null
  /** `sizes` the card used, so next/image picks the same (already cached) candidate. */
  imageSizes: string
  location: string
  meta: string[]
  price: string | null
  priceSuffix: string
  priceFrom: boolean
}

type Stored = Record<string, DetailPreview & { savedAt: number }>

const KEY = 'unsolo:detail-preview:v1'
const MAX_ENTRIES = 24
export const DETAIL_PREVIEW_TTL_MS = 24 * 60 * 60 * 1000

let memo: { raw: string | null; parsed: Stored } | null = null

function readAll(): Stored {
  if (typeof window === 'undefined') return {}
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(KEY)
  } catch {
    return {}
  }
  if (memo && memo.raw === raw) return memo.parsed
  let parsed: Stored = {}
  try {
    parsed = raw ? (JSON.parse(raw) as Stored) : {}
  } catch {
    parsed = {}
  }
  memo = { raw, parsed }
  return parsed
}

export function writeDetailPreview(href: string, preview: DetailPreview, now = Date.now()) {
  if (typeof window === 'undefined') return
  const entries = Object.entries({ ...readAll(), [href]: { ...preview, savedAt: now } })
    .sort(([, a], [, b]) => b.savedAt - a.savedAt)
    .slice(0, MAX_ENTRIES)
  try {
    window.localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    /* quota / private mode */
  }
}

/** Stable reference per stored value (safe for `useSyncExternalStore`). */
export function readDetailPreview(href: string, now = Date.now()): DetailPreview | null {
  const entry = readAll()[href]
  if (!entry || now - entry.savedAt > DETAIL_PREVIEW_TTL_MS) return null
  return entry
}
