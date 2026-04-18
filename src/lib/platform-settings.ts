import { createClient } from '@/lib/supabase/server'
import { DEFAULT_PLATFORM_FEE_PERCENT } from '@/lib/constants'

/** Resolved from `platform_settings.platform_fee_percent`; falls back if missing or invalid. */
export async function getPlatformFeePercent(): Promise<number> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', 'platform_fee_percent')
    .maybeSingle()

  const n = parseFloat(String(data?.value ?? '').trim())
  if (!Number.isFinite(n) || n < 0 || n > 100) return DEFAULT_PLATFORM_FEE_PERCENT
  return Math.round(n * 100) / 100
}
