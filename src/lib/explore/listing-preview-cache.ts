import type { Package } from '@/types'
import type { ServiceListingWithItems } from '@/lib/explore/explorePageData'

/**
 * Browser-side snapshot of the listings already painted on the home rows, so
 * "View all" (and the rows themselves on a revisit) can paint instantly while
 * fresh server data streams in. Never authoritative — always replaced by the
 * server render.
 */
export type ListingPreviewKind = 'trips' | 'stays' | 'activities' | 'rentals'

export type TripsPreview = {
  packages: Package[]
  interestCounts: Record<string, number>
  spotsBooked: Record<string, number>
}

export type ServicePreview = { listings: ServiceListingWithItems[] }

type PreviewByKind = {
  trips: TripsPreview
  stays: ServicePreview
  activities: ServicePreview
  rentals: ServicePreview
}

type StoredPreview<K extends ListingPreviewKind> = { savedAt: number; data: PreviewByKind[K] }

const STORAGE_PREFIX = 'unsolo:listing-preview:v1:'
export const LISTING_PREVIEW_TTL_MS = 30 * 60 * 1000

const memory = new Map<ListingPreviewKind, StoredPreview<ListingPreviewKind> | null>()

function storage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

function readEntry<K extends ListingPreviewKind>(kind: K): StoredPreview<K> | null {
  if (memory.has(kind)) return memory.get(kind) as StoredPreview<K> | null
  let entry: StoredPreview<K> | null = null
  try {
    const raw = storage()?.getItem(STORAGE_PREFIX + kind)
    if (raw) entry = JSON.parse(raw) as StoredPreview<K>
  } catch {
    entry = null
  }
  memory.set(kind, entry)
  return entry
}

/** Returns a stable reference (safe for `useSyncExternalStore`) or null when missing/expired. */
export function readListingPreview<K extends ListingPreviewKind>(kind: K, now = Date.now()): PreviewByKind[K] | null {
  const entry = readEntry(kind)
  if (!entry || now - entry.savedAt > LISTING_PREVIEW_TTL_MS) return null
  return entry.data
}

export function writeListingPreview<K extends ListingPreviewKind>(kind: K, data: PreviewByKind[K], now = Date.now()) {
  const entry: StoredPreview<K> = { savedAt: now, data }
  memory.set(kind, entry)
  try {
    storage()?.setItem(STORAGE_PREFIX + kind, JSON.stringify(entry))
  } catch {
    /* quota / private mode — memory copy still serves this tab */
  }
}

export function clearListingPreviewMemory() {
  memory.clear()
}

const PREVIEWABLE_PARAMS = new Set(['search', 'tab'])

/** Only plain "View all" URLs (no filters/query) can be painted from a home-row snapshot. */
export function previewKindForParams(sp: Record<string, string>): ListingPreviewKind | null {
  if (Object.keys(sp).some(key => !PREVIEWABLE_PARAMS.has(key))) return null
  const tab = sp.tab || 'trips'
  return tab === 'trips' || tab === 'stays' || tab === 'activities' || tab === 'rentals' ? tab : null
}
