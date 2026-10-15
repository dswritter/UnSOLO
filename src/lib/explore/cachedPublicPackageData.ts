import { unstable_cache } from 'next/cache'
import { createPublicClient } from '@/lib/supabase/public-client'
import type { Package } from '@/types'

export type PublicPackageFilters = {
  tripSource?: string
  difficulty?: string
  minBudget?: string
  maxBudget?: string
  maxDays?: string
  minDays?: string
}

/** Shared, cookie-free Explore listing data. User-specific interests stay outside this cache. */
export const getCachedExplorePackages = unstable_cache(async (filters: PublicPackageFilters): Promise<Package[]> => {
  const supabase = createPublicClient()
  let query = supabase
    .from('packages')
    .select('*, destination:destinations(*), host:profiles!packages_host_id_fkey(id, username, full_name, avatar_url, bio, host_rating, is_verified, total_hosted_trips)')
    .eq('is_active', true)

  if (filters.tripSource === 'community') query = query.not('host_id', 'is', null)
  else if (filters.tripSource === 'unsolo') query = query.is('host_id', null)
  if (filters.difficulty) query = query.eq('difficulty', filters.difficulty)
  if (filters.minBudget) {
    const value = Number.parseInt(filters.minBudget, 10)
    if (Number.isFinite(value)) query = query.gte('price_paise', value * 100)
  }
  if (filters.maxBudget) {
    const value = Number.parseInt(filters.maxBudget, 10)
    if (Number.isFinite(value)) query = query.lte('price_paise', value * 100)
  }
  if (filters.maxDays) {
    const value = Number.parseInt(filters.maxDays, 10)
    if (Number.isFinite(value)) query = query.lte('duration_days', value)
  }
  if (filters.minDays) {
    const value = Number.parseInt(filters.minDays, 10)
    if (Number.isFinite(value)) query = query.gte('duration_days', value)
  }
  const { data, error } = await query.order('is_featured', { ascending: false })
    .order('created_at', { ascending: false }).limit(200)
  if (error) throw error
  return (data || []) as unknown as Package[]
}, ['explore-public-packages-v1'], { revalidate: 30, tags: ['explore-public-packages'] })

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