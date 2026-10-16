import { unstable_cache } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/server'

export type TripFormBootstrap = {
  destinations: { id: string; name: string; state: string }[]
  includesOptions: { id: string; label: string }[]
  maxGroupSize: number
  platformFeePercent: number
}

/** Option lists + limits the trip form needs, fetched server-side so the form paints immediately. */
export const getTripFormBootstrap = unstable_cache(
  async (): Promise<TripFormBootstrap> => {
    const svc = createServiceRoleClient()
    const [{ data: destinations }, { data: includes }, { data: settings }] = await Promise.all([
      svc.from('destinations').select('id, name, state').order('name'),
      svc.from('includes_options').select('id, label').order('label'),
      svc.from('platform_settings').select('key, value').in('key', ['host_max_group_size', 'platform_fee_percent']),
    ])
    const setting = (key: string) => settings?.find(row => row.key === key)?.value
    const fee = parseFloat(String(setting('platform_fee_percent') ?? '').trim())
    return {
      destinations: (destinations ?? []) as TripFormBootstrap['destinations'],
      includesOptions: (includes ?? []) as TripFormBootstrap['includesOptions'],
      maxGroupSize: parseInt(String(setting('host_max_group_size') ?? ''), 10) || 50,
      platformFeePercent: Number.isFinite(fee) && fee >= 0 && fee <= 100 ? Math.round(fee * 100) / 100 : 15,
    }
  },
  ['trip-form-bootstrap-v1'],
  { revalidate: 60 },
)
