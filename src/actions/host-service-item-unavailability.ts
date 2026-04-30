'use server'

import { createClient } from '@/lib/supabase/server'
import type { ServiceListingItemUnavailability } from '@/lib/service-item-unavailability'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

async function requireHostOfItem(itemId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' as const }

  const { data: item } = await supabase
    .from('service_listing_items')
    .select('id, service_listing_id, service_listings!inner(host_id)')
    .eq('id', itemId)
    .single()

  if (!item) return { error: 'Item not found' as const }
  // @ts-expect-error supabase join shape
  if (item.service_listings?.host_id !== user.id) return { error: 'Unauthorized' as const }

  return { supabase, user, item }
}

export async function listItemUnavailabilityByListing(listingId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' as const }

  const { data: listing } = await supabase
    .from('service_listings')
    .select('id, host_id')
    .eq('id', listingId)
    .single()
  if (!listing) return { error: 'Listing not found' as const }
  if (listing.host_id !== user.id) return { error: 'Unauthorized' as const }

  const { data, error } = await supabase
    .from('service_listing_item_unavailability')
    .select('id, service_listing_item_id, start_date, end_date, created_at, updated_at')
    .in(
      'service_listing_item_id',
      (
        await supabase
          .from('service_listing_items')
          .select('id')
          .eq('service_listing_id', listingId)
      ).data?.map(r => r.id) ?? ['00000000-0000-0000-0000-000000000000'],
    )
    .order('start_date', { ascending: true })

  if (error) return { error: 'Failed to load unavailable dates' as const }
  return { entries: (data || []) as ServiceListingItemUnavailability[] }
}

export async function addItemUnavailability(itemId: string, startDate: string, endDate?: string) {
  const ctx = await requireHostOfItem(itemId)
  if ('error' in ctx) return { error: ctx.error }

  const start = startDate.trim()
  const end = (endDate || startDate).trim()
  if (!DATE_RE.test(start) || !DATE_RE.test(end)) {
    return { error: 'Please choose valid dates' }
  }
  if (end < start) {
    return { error: 'End date cannot be before start date' }
  }

  const { data, error } = await ctx.supabase
    .from('service_listing_item_unavailability')
    .insert({
      service_listing_item_id: itemId,
      start_date: start,
      end_date: end,
    })
    .select('id, service_listing_item_id, start_date, end_date, created_at, updated_at')
    .single()

  if (error) {
    console.error('addItemUnavailability:', error)
    return { error: 'Failed to save unavailable dates' }
  }

  return { success: true as const, entry: data as ServiceListingItemUnavailability }
}

export async function removeItemUnavailability(entryId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: existing } = await supabase
    .from('service_listing_item_unavailability')
    .select('id, service_listing_item_id, service_listing_items!inner(service_listings!inner(host_id))')
    .eq('id', entryId)
    .single()

  if (!existing) return { error: 'Availability entry not found' }
  // @ts-expect-error supabase join shape
  if (existing.service_listing_items?.service_listings?.host_id !== user.id) {
    return { error: 'Unauthorized' }
  }

  const { error } = await supabase
    .from('service_listing_item_unavailability')
    .delete()
    .eq('id', entryId)

  if (error) return { error: 'Failed to remove unavailable dates' }
  return { success: true as const }
}
