'use server'

import { unstable_cache } from 'next/cache'
import { getCachedExplorePackagePage } from '@/lib/explore/cachedPublicPackageData'
import { getCachedPublicServiceListings } from '@/lib/explore/cachedPublicServiceData'
import { getWanderServiceItemsForListings } from '@/lib/wander/wanderQueries'
import { createServiceRoleClient } from '@/lib/supabase/server'
import type { ExploreListPayload } from '@/lib/explore/explorePageData'

type RowKind = 'trips' | 'stays' | 'activities' | 'rentals'
type RowPage = Pick<ExploreListPayload, 'packages' | 'serviceListings' | 'interestCounts' | 'spotsBooked' | 'page' | 'hasMore'>
const PAGE_SIZE = 8

const getPublicRowPage = unstable_cache(async (kind: RowKind, page: number): Promise<RowPage> => {
  const result: RowPage = { packages: [], serviceListings: [], interestCounts: {}, spotsBooked: {}, page, hasMore: false }
  if (kind === 'trips') {
    const { packages, totalCount } = await getCachedExplorePackagePage({}, page, PAGE_SIZE)
    result.packages = packages
    result.hasMore = page * PAGE_SIZE < totalCount
    if (packages.length) {
      const { data, error } = await createServiceRoleClient().rpc('get_wander_trip_candidate_metrics', {
        p_package_ids: packages.map(pkg => pkg.id),
      })
      if (error) throw error
      for (const row of data || []) {
        result.interestCounts[row.package_id] = Number(row.interest_count) || 0
        result.spotsBooked[row.package_id] = Number(row.booked_guests) || 0
      }
    }
  } else {
    const { listings, total } = await getCachedPublicServiceListings(kind, {}, page, PAGE_SIZE)
    result.serviceListings = await getWanderServiceItemsForListings(listings)
    result.hasMore = page * PAGE_SIZE < total
  }
  return result
}, ['wander-mobile-row-page-v1'], { revalidate: 60 })

/** Cookieless public continuation of the cached homepage previews. */
export async function loadMoreWanderListings(kind: RowKind, page: number): Promise<RowPage> {
  if (!['trips', 'stays', 'activities', 'rentals'].includes(kind)) throw new Error('Invalid listing category')
  if (!Number.isInteger(page) || page < 1 || page > 1000) throw new Error('Invalid listing page')
  return getPublicRowPage(kind, page)
}
