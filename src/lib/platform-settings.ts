import { createClient } from '@/lib/supabase/server'
import { DEFAULT_PLATFORM_FEE_PERCENT } from '@/lib/constants'
import type { ServiceListingType } from '@/types'

export type FeeCategory = 'trips' | ServiceListingType

const CATEGORY_KEY: Record<FeeCategory, string> = {
  trips: 'platform_fee_percent',
  stays: 'platform_fee_percent_stays',
  activities: 'platform_fee_percent_activities',
  rentals: 'platform_fee_percent_rentals',
  getting_around: 'platform_fee_percent_getting_around',
}

function parseFeePercent(raw: unknown): number | null {
  const n = parseFloat(String(raw ?? '').trim())
  if (!Number.isFinite(n) || n < 0 || n > 100) return null
  return Math.round(n * 100) / 100
}

/** Resolved from `platform_settings.<category-key>`; falls back to default if missing or invalid. */
export async function getPlatformFeePercentByCategory(category: FeeCategory): Promise<number> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', CATEGORY_KEY[category])
    .maybeSingle()

  const parsed = parseFeePercent(data?.value)
  return parsed ?? DEFAULT_PLATFORM_FEE_PERCENT
}

/** Legacy helper — returns the trips/community-trips commission. */
export async function getPlatformFeePercent(): Promise<number> {
  return getPlatformFeePercentByCategory('trips')
}
