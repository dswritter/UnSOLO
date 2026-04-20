'use server'

import { createClient } from '@/lib/supabase/server'
import type { ServiceListingItem } from '@/types'

async function requireHostOfListing(listingId: string) {
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

  return { supabase, user, listing }
}

export async function listServiceListingItems(listingId: string) {
  const ctx = await requireHostOfListing(listingId)
  if ('error' in ctx) return { error: ctx.error }

  const { data, error } = await ctx.supabase
    .from('service_listing_items')
    .select('*')
    .eq('service_listing_id', listingId)
    .order('position_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) return { error: 'Failed to load items' }
  return { items: (data || []) as ServiceListingItem[] }
}

export async function createServiceListingItem(input: {
  service_listing_id: string
  name: string
  description?: string | null
  price_paise: number
  quantity_available: number
  max_per_booking: number
  images: string[]
  position_order?: number
}) {
  const ctx = await requireHostOfListing(input.service_listing_id)
  if ('error' in ctx) return { error: ctx.error }

  if (!input.name.trim()) return { error: 'Item name is required' }
  if (input.price_paise < 0) return { error: 'Price cannot be negative' }
  if (input.quantity_available < 0) return { error: 'Quantity cannot be negative' }
  if (input.max_per_booking < 1) return { error: 'Max per booking must be at least 1' }

  const { data, error } = await ctx.supabase
    .from('service_listing_items')
    .insert({
      service_listing_id: input.service_listing_id,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      price_paise: input.price_paise,
      quantity_available: input.quantity_available,
      max_per_booking: input.max_per_booking,
      images: input.images,
      position_order: input.position_order ?? 0,
    })
    .select('*')
    .single()

  if (error) {
    console.error('createServiceListingItem:', error)
    return { error: 'Failed to create item' }
  }
  return { success: true, item: data as ServiceListingItem }
}

export async function updateServiceListingItem(
  itemId: string,
  patch: Partial<{
    name: string
    description: string | null
    price_paise: number
    quantity_available: number
    max_per_booking: number
    images: string[]
    position_order: number
    is_active: boolean
  }>,
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Verify ownership via join-like lookup.
  const { data: existing } = await supabase
    .from('service_listing_items')
    .select('id, service_listing_id, service_listings!inner(host_id)')
    .eq('id', itemId)
    .single()

  if (!existing) return { error: 'Item not found' }
  // @ts-expect-error supabase join shape
  if (existing.service_listings?.host_id !== user.id) {
    return { error: 'Unauthorized' }
  }

  if (patch.name !== undefined && !patch.name.trim()) {
    return { error: 'Item name is required' }
  }

  const { data, error } = await supabase
    .from('service_listing_items')
    .update({
      ...patch,
      name: patch.name?.trim(),
      description: patch.description === undefined ? undefined : patch.description?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId)
    .select('*')
    .single()

  if (error) {
    console.error('updateServiceListingItem:', error)
    return { error: 'Failed to update item' }
  }
  return { success: true, item: data as ServiceListingItem }
}

export async function deleteServiceListingItem(itemId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: existing } = await supabase
    .from('service_listing_items')
    .select('id, service_listings!inner(host_id)')
    .eq('id', itemId)
    .single()

  if (!existing) return { error: 'Item not found' }
  // @ts-expect-error supabase join shape
  if (existing.service_listings?.host_id !== user.id) {
    return { error: 'Unauthorized' }
  }

  const { error } = await supabase
    .from('service_listing_items')
    .delete()
    .eq('id', itemId)

  if (error) return { error: 'Failed to delete item' }
  return { success: true }
}

// Public: for detail pages. RLS ensures only approved+active listings' active items are returned.
export async function getPublicServiceListingItems(listingId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('service_listing_items')
    .select('*')
    .eq('service_listing_id', listingId)
    .eq('is_active', true)
    .order('position_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) return []
  return (data || []) as ServiceListingItem[]
}
