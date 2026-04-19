'use server'

import { createClient } from '@/lib/supabase/server'
import type { ServiceListingType, ServiceListingMetadata } from '@/types'

export async function createHostServiceListing(input: {
  title: string
  description: string | null
  short_description: string | null
  type: ServiceListingType
  price_paise: number
  unit: 'per_night' | 'per_person' | 'per_day' | 'per_hour' | 'per_week'
  destination_id: string
  location: string | null
  max_guests_per_booking?: number | null
  quantity_available?: number | null
  amenities: string[]
  tags: string[]
  metadata: ServiceListingMetadata | null
  host_id: string
}) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // Verify user is authenticated
    if (!user) {
      return { error: 'Not authenticated' }
    }

    // Verify host_id matches current user
    if (input.host_id !== user.id) {
      return { error: 'Unauthorized' }
    }

    // Verify destination exists
    const { data: dest } = await supabase
      .from('destinations')
      .select('id')
      .eq('id', input.destination_id)
      .single()

    if (!dest) {
      return { error: 'Destination not found' }
    }

    // Generate slug from title
    const slug = input.title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      + '-' + Date.now()

    // Create the listing
    const { data, error: insertError } = await supabase
      .from('service_listings')
      .insert({
        title: input.title,
        slug,
        description: input.description,
        short_description: input.short_description,
        type: input.type,
        price_paise: input.price_paise,
        unit: input.unit,
        destination_id: input.destination_id,
        location: input.location,
        latitude: null,
        longitude: null,
        max_guests_per_booking: input.max_guests_per_booking || 1,
        quantity_available: input.quantity_available,
        amenities: input.amenities.length > 0 ? input.amenities : null,
        tags: input.tags.length > 0 ? input.tags : null,
        images: null, // Can be added later
        metadata: input.metadata,
        host_id: input.host_id,
        is_active: true,
        is_featured: false,
        status: 'pending', // Hosts' listings need admin approval
      })
      .select('id, slug')
      .single()

    if (insertError) {
      console.error('Database error:', insertError)
      return { error: 'Failed to create listing' }
    }

    return { success: true, data }
  } catch (error) {
    console.error('Error creating service listing:', error)
    return { error: 'An unexpected error occurred' }
  }
}
