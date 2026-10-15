import { unstable_cache } from 'next/cache'
import { createPublicClient } from '@/lib/supabase/public-client'
import type { Package } from '@/types'

export type PublicPackageFilters = {
  search?: string
  tripSource?: string
  difficulty?: string
  minBudget?: string
  maxBudget?: string
  maxDays?: string
  minDays?: string
  month?: string
}

export type ExplorePackagePage = { packages: Package[]; totalCount: number; page: number; pageSize: number }

function packagePageArgs(filters: PublicPackageFilters, page: number, pageSize: number) {
  const parseBoundedInteger = (value: string | undefined, minimum: number, maximum: number) => {
    const parsed = Number.parseInt(value || '', 10)
    return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null
  }
  const minBudget = parseBoundedInteger(filters.minBudget, 1, 21_474_836)
  const maxBudget = parseBoundedInteger(filters.maxBudget, 1, 21_474_836)
  const minDays = parseBoundedInteger(filters.minDays, 1, 10000)
  const maxDays = parseBoundedInteger(filters.maxDays, 1, 10000)
  const month = Number.parseInt(filters.month || '', 10)
  return {
    p_search: filters.search?.trim() || null,
    p_trip_source: filters.tripSource || null,
    p_difficulty: filters.difficulty || null,
    p_min_price_paise: minBudget == null ? null : minBudget * 100,
    p_max_price_paise: maxBudget == null ? null : maxBudget * 100,
    p_min_days: minDays,
    p_max_days: maxDays,
    p_month: Number.isInteger(month) && month >= 0 && month <= 11 ? month : null,
    p_interested_only: false,
    p_page: Math.max(1, Math.floor(page)),
    p_page_size: Math.max(1, Math.min(48, Math.floor(pageSize))),
  }
}

async function queryExplorePackagePage(filters: PublicPackageFilters, page: number, pageSize: number, client = createPublicClient(), interestedOnly = false): Promise<ExplorePackagePage> {
  const { data, error } = await client.rpc('search_explore_packages_page', {
    ...packagePageArgs(filters, page, pageSize), p_interested_only: interestedOnly,
  })
  if (error) throw error
  const rows = (data || []) as Array<{ listing: Package | null; total_count: number | string }>
  return {
    packages: rows.flatMap(row => row.listing ? [row.listing] : []),
    totalCount: Number(rows[0]?.total_count ?? 0),
    page: Math.max(1, Math.floor(page)),
    pageSize: Math.max(1, Math.min(48, Math.floor(pageSize))),
  }
}

/** Public pages are shared-cacheable; a user's interested-only page is not. */
export const getCachedExplorePackagePage = unstable_cache(
  async (filters: PublicPackageFilters, page: number, pageSize: number) => queryExplorePackagePage(filters, page, pageSize),
  ['explore-public-package-page-v2'], { revalidate: 30, tags: ['explore-public-packages'] },
)

export async function getInterestedExplorePackagePage(
  client: Parameters<typeof queryExplorePackagePage>[3], filters: PublicPackageFilters, page: number, pageSize: number,
) {
  return queryExplorePackagePage(filters, page, pageSize, client, true)
}

export const getCachedExploreMaxPackagePrice = unstable_cache(async (): Promise<number> => {
  const { data, error } = await createPublicClient().from('packages')
    .select('price_paise').eq('is_active', true)
    .order('price_paise', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  return data?.price_paise || 2000000
}, ['explore-public-max-package-price-v1'], { revalidate: 60, tags: ['explore-public-packages'] })

/** Public aggregate only. User-specific saved IDs and booking visibility stay outside shared cache. */
export const getCachedPackageInterestCounts = unstable_cache(async (ids: string[]) => {
  const supabase = createPublicClient()
  const { data, error } = await supabase.from('package_interests').select('package_id').in('package_id', ids)
  if (error) throw error
  const interestCount = new Map<string, number>()
  for (const row of data || []) {
    const id = row.package_id as string
    interestCount.set(id, (interestCount.get(id) || 0) + 1)
  }
  return [...interestCount]
}, ['explore-public-package-interest-counts-v1'], { revalidate: 30, tags: ['explore-public-package-popularity'] })