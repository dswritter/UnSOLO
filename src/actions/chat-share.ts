'use server'

import { createClient } from '@/lib/supabase/server'
import type { Package, ServiceListingType } from '@/types'
import { tripDepartureDateKey } from '@/lib/package-trip-calendar'
import { fuzzyMatch } from '@/lib/utils'
import { fetchPackagePopularityMaps, sortExplorePackages } from '@/lib/explore-package-popularity'
import { getServiceListingsByType } from '@/actions/service-listing-discovery'

export type ChatShareKind = 'trips' | 'stays' | 'activities' | 'rentals'

export type ChatShareItem = {
  kind: ChatShareKind
  slug: string
  title: string
  subtitle: string
  /** Path only, e.g. /packages/slug or /listings/stays/slug */
  path: string
}

const DEFAULT_LIMIT = 5

const listingTypeByKind: Record<Exclude<ChatShareKind, 'trips'>, ServiceListingType> = {
  stays: 'stays',
  activities: 'activities',
  rentals: 'rentals',
}

async function fetchTripsPage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  offset: number,
  limit: number,
  search: string | undefined,
): Promise<{ items: ChatShareItem[]; total: number }> {
  let query = supabase
    .from('packages')
    .select('*, destination:destinations(name, state)')
    .eq('is_active', true)
    .order('is_featured', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200)

  const { data } = await query
  let packages = (data || []) as unknown as Package[]

  const todayStr = new Date().toISOString().split('T')[0]
  packages = packages.filter(pkg => {
    if (!pkg.departure_dates || pkg.departure_dates.length === 0) return true
    const closed = new Set((pkg.departure_dates_closed || []).map(tripDepartureDateKey))
    return pkg.departure_dates.some(d => {
      const k = tripDepartureDateKey(d)
      return k >= todayStr && !closed.has(k)
    })
  })

  if (search && search.trim()) {
    const q = search.trim().toLowerCase()
    packages = packages.filter(pkg => {
      const dest = pkg.destination as { name?: string; state?: string } | null
      return (
        pkg.title.toLowerCase().includes(q) ||
        (pkg.short_description || '').toLowerCase().includes(q) ||
        fuzzyMatch(dest?.name || '', search.trim()) ||
        fuzzyMatch(dest?.state || '', search.trim())
      )
    })
  }

  const ids = packages.map(p => p.id)
  const { bookedGuests, interestCount } = await fetchPackagePopularityMaps(supabase, ids)
  packages = sortExplorePackages(packages, bookedGuests, interestCount)

  const total = packages.length
  const slice = packages.slice(offset, offset + limit)
  const items: ChatShareItem[] = slice.map(p => {
    const dest = p.destination as { name?: string; state?: string } | null
    const subtitle = dest ? `${dest.name}${dest.state ? `, ${dest.state}` : ''}` : ''
    return {
      kind: 'trips' as const,
      slug: p.slug,
      title: p.title,
      subtitle,
      path: `/packages/${p.slug}`,
    }
  })
  return { items, total }
}

/**
 * Paginated “share in chat” catalog: trips (by popularity like Explore) or service listings (featured → rating).
 */
export async function fetchChatSharePage(
  kind: ChatShareKind,
  offset: number,
  limit: number = DEFAULT_LIMIT,
  search?: string,
): Promise<{ items: ChatShareItem[]; total: number; error?: string }> {
  const supabase = await createClient()
  const lim = Math.min(Math.max(1, limit), 20)
  const off = Math.max(0, offset)

  try {
    if (kind === 'trips') {
      return await fetchTripsPage(supabase, off, lim, search)
    }

    const type = listingTypeByKind[kind]
    const page = Math.floor(off / lim) + 1
    const filters = search?.trim() ? { search: search.trim() } : {}
    const { listings, total } = await getServiceListingsByType(type, filters, page, lim)

    const items: ChatShareItem[] = listings.map(l => {
      const dest = l.destination as { name?: string } | null | undefined
      const subtitle = l.location || dest?.name || ''
      return {
        kind,
        slug: l.slug,
        title: l.title,
        subtitle,
        path: `/listings/${l.type}/${l.slug}`,
      }
    })
    return { items, total }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load'
    return { items: [], total: 0, error: msg }
  }
}
