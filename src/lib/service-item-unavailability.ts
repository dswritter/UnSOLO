import { createClient } from '@/lib/supabase/server'

export type ServiceListingItemUnavailability = {
  id: string
  service_listing_item_id: string
  start_date: string
  end_date: string
  created_at: string
  updated_at: string
}

export function datesOverlap(startA: string, endA: string, startB: string, endB: string) {
  return startA <= endB && startB <= endA
}

export async function itemHasDateBlock(
  itemId: string,
  startDate: string,
  endDate: string,
): Promise<boolean> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('service_listing_item_unavailability')
    .select('id, start_date, end_date')
    .eq('service_listing_item_id', itemId)
    .lte('start_date', endDate)
    .gte('end_date', startDate)
    .limit(1)

  return !!(data && data.length > 0)
}
