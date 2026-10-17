import type { Package, ServiceListing } from '@/types'
import { tripDepartureDateKey } from '@/lib/package-trip-calendar'
import { matchesExploreSearch } from '@/lib/explore/local-search'

/**
 * Client-side mirror of the explore server filters (search_explore_packages_page
 * RPC + service listing query). Used only to re-filter listings already in the
 * browser while the authoritative server results stream in — never to decide
 * what the user finally sees.
 */

export const EXPLORE_PENDING_EVENT = 'unsolo:explore-pending'

export type ExploreTab = 'trips' | 'stays' | 'activities' | 'rentals' | 'getting_around'

const NON_FILTER_KEYS = new Set(['search', 'page'])

function boundedInt(value: string | undefined, min: number, max: number): number | null {
  const parsed = Number.parseInt(value || '', 10)
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null
}

/** Params as the server would see them for this href (drops presentation-only keys). */
export function exploreParamsFromHref(href: string): Record<string, string> {
  const query = href.includes('?') ? href.slice(href.indexOf('?') + 1).split('#')[0] : ''
  const out: Record<string, string> = {}
  new URLSearchParams(query).forEach((value, key) => {
    if (value) out[key] = value
  })
  return out
}

/** Stable comparison key — ignores `search`/`page` and empty values. */
export function exploreFilterKey(params: Record<string, string>): string {
  return JSON.stringify(
    Object.entries(params)
      .filter(([key, value]) => !!value && !NON_FILTER_KEYS.has(key))
      .sort(([a], [b]) => a.localeCompare(b)),
  )
}

export function exploreTabFromParams(params: Record<string, string>): ExploreTab {
  const tab = params.tab
  return tab === 'stays' || tab === 'activities' || tab === 'rentals' || tab === 'getting_around' ? tab : 'trips'
}

export function packageMatchesExploreParams(
  pkg: Package,
  params: Record<string, string>,
  interestedIds?: ReadonlySet<string>,
): boolean {
  const source = params.tripSource
  if (source === 'community' && !(pkg.host_id || pkg.created_on_behalf_by)) return false
  if (source === 'unsolo' && (pkg.host_id || pkg.created_on_behalf_by)) return false
  if (params.difficulty && pkg.difficulty !== params.difficulty) return false

  const minBudget = boundedInt(params.minBudget, 1, 21_474_836)
  const maxBudget = boundedInt(params.maxBudget, 1, 21_474_836)
  if (minBudget != null && pkg.price_paise < minBudget * 100) return false
  if (maxBudget != null && pkg.price_paise > maxBudget * 100) return false

  const minDays = boundedInt(params.minDays, 1, 10000)
  const maxDays = boundedInt(params.maxDays, 1, 10000)
  if (minDays != null && pkg.duration_days < minDays) return false
  if (maxDays != null && pkg.duration_days > maxDays) return false

  const month = boundedInt(params.month, 0, 11)
  if (month != null) {
    const closed = new Set((pkg.departure_dates_closed || []).map(tripDepartureDateKey))
    const hit = (pkg.departure_dates || []).some(date => {
      const key = tripDepartureDateKey(date)
      return !closed.has(key) && Number(key.slice(5, 7)) === month + 1
    })
    if (!hit) return false
  }

  if (params.interested && interestedIds && !interestedIds.has(pkg.id)) return false

  if (params.q && !matchesExploreSearch([
    pkg.title, pkg.short_description, pkg.description, pkg.destination?.name, pkg.destination?.state, pkg.includes, pkg.metadata,
  ], params.q)) return false

  return true
}

export function serviceMatchesExploreParams(
  listing: ServiceListing,
  params: Record<string, string>,
  tab: ExploreTab,
): boolean {
  if (listing.type !== tab) return false
  const minPrice = boundedInt(params.minPrice, 1, 21_474_836)
  const maxPrice = boundedInt(params.maxPrice, 1, 21_474_836)
  if (minPrice != null && listing.price_paise < minPrice * 100) return false
  if (maxPrice != null && listing.price_paise > maxPrice * 100) return false
  if (params.amenities && !(listing.amenities || []).includes(params.amenities)) return false
  if (params.difficulty && tab === 'activities') {
    const difficulty = (listing.metadata as Record<string, unknown> | null | undefined)?.difficulty
    if (difficulty !== params.difficulty) return false
  }
  if (params.q && !matchesExploreSearch([
    listing.title, listing.short_description, listing.description, listing.location, listing.tags, listing.amenities, listing.metadata,
  ], params.q)) return false
  return true
}

/** Tell the explore results to re-filter what's on screen before the server responds. */
export function announceExploreNavigation(href: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<string>(EXPLORE_PENDING_EVENT, { detail: href }))
}
