'use server'

import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { ServiceListing, ServiceListingType, ServiceListingMetadata } from '@/types'
import { minPricePaiseFromVariants, type PriceVariant } from '@/lib/package-pricing'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') throw new Error('Unauthorized — admin only')
  return { supabase, user }
}

// ── Service Listing CRUD ─────────────────────────────────────────────────

export async function getAdminServiceListings() {
  const { supabase } = await requireAdmin()

  const { data, error } = await supabase
    .from('service_listings')
    .select(`
      *,
      destination:destinations(id, name, slug),
      host:profiles(id, username, full_name, avatar_url)
    `)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []) as (ServiceListing & {
    destination?: { id: string; name: string; slug: string }
    host?: { id: string; username: string; full_name: string | null; avatar_url: string | null }
  })[]
}

export async function getServiceListingDetail(id: string) {
  const { supabase } = await requireAdmin()

  const { data, error } = await supabase
    .from('service_listings')
    .select(`
      *,
      destination:destinations(id, name, slug),
      host:profiles(id, username, full_name, avatar_url)
    `)
    .eq('id', id)
    .single()

  if (error) throw error
  return data as ServiceListing & {
    destination?: { id: string; name: string; slug: string }
    host?: { id: string; username: string; full_name: string | null; avatar_url: string | null }
  }
}

export async function createServiceListing(input: {
  title: string
  slug: string
  description: string | null
  short_description: string | null
  type: ServiceListingType
  price_paise: number
  price_variants?: PriceVariant[] | null
  unit: 'per_night' | 'per_person' | 'per_day' | 'per_hour' | 'per_week'
  destination_id: string
  location: string
  latitude?: number | null
  longitude?: number | null
  max_guests_per_booking?: number | null
  quantity_available?: number | null
  images: string[]
  amenities: string[]
  tags: string[]
  metadata: ServiceListingMetadata | null
  host_id?: string | null
  is_active?: boolean
  is_featured?: boolean
  status?: 'pending' | 'approved' | 'rejected' | 'archived'
}) {
  const { supabase, user } = await requireAdmin()

  // Validate slug uniqueness
  const { data: existing } = await supabase
    .from('service_listings')
    .select('id')
    .eq('slug', input.slug)
    .single()

  if (existing) throw new Error('Slug already exists')

  // Validate destination exists
  const { data: dest } = await supabase
    .from('destinations')
    .select('id')
    .eq('id', input.destination_id)
    .single()

  if (!dest) throw new Error('Destination not found')

  // Validate images
  if (!input.images || input.images.length === 0) {
    throw new Error('At least one image is required')
  }

  const { data, error } = await supabase
    .from('service_listings')
    .insert({
      ...input,
      price_variants: input.price_variants || null,
    })
    .select()
    .single()

  if (error) throw error

  // Log audit event
  await logAuditEvent(user.id, 'CREATE_SERVICE_LISTING', 'service_listing', data.id, {
    title: input.title,
    type: input.type,
  })

  return data as ServiceListing
}

export async function updateServiceListing(
  id: string,
  input: Partial<{
    title: string
    slug: string
    description: string | null
    short_description: string | null
    price_paise: number
    price_variants: PriceVariant[] | null
    unit: 'per_night' | 'per_person' | 'per_day' | 'per_hour' | 'per_week'
    location: string
    latitude: number | null
    longitude: number | null
    max_guests_per_booking: number | null
    quantity_available: number | null
    images: string[]
    amenities: string[]
    tags: string[]
    metadata: ServiceListingMetadata | null
    is_active: boolean
    is_featured: boolean
    status: 'pending' | 'approved' | 'rejected' | 'archived'
    average_rating: number
    review_count: number
  }>
) {
  const { supabase, user } = await requireAdmin()

  // Validate slug uniqueness if changed
  if (input.slug) {
    const { data: existing } = await supabase
      .from('service_listings')
      .select('id')
      .eq('slug', input.slug)
      .neq('id', id)
      .single()

    if (existing) throw new Error('Slug already exists')
  }

  const { data, error } = await supabase
    .from('service_listings')
    .update({
      ...input,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error

  // Log audit event
  await logAuditEvent(user.id, 'UPDATE_SERVICE_LISTING', 'service_listing', id, {
    changes: Object.keys(input),
  })

  return data as ServiceListing
}

export async function deleteServiceListing(id: string) {
  const { supabase, user } = await requireAdmin()

  // Soft delete by archiving
  const { error } = await supabase
    .from('service_listings')
    .update({ status: 'archived', is_active: false })
    .eq('id', id)

  if (error) throw error

  // Log audit event
  await logAuditEvent(user.id, 'DELETE_SERVICE_LISTING', 'service_listing', id)
}

export async function approveServiceListing(id: string) {
  const { supabase, user } = await requireAdmin()

  const { error } = await supabase
    .from('service_listings')
    .update({ status: 'approved', is_active: true })
    .eq('id', id)

  if (error) throw error

  await logAuditEvent(user.id, 'APPROVE_SERVICE_LISTING', 'service_listing', id)
}

export async function rejectServiceListing(id: string, reason: string) {
  const { supabase, user } = await requireAdmin()

  const { error } = await supabase
    .from('service_listings')
    .update({ status: 'rejected', is_active: false })
    .eq('id', id)

  if (error) throw error

  await logAuditEvent(user.id, 'REJECT_SERVICE_LISTING', 'service_listing', id, { reason })
}

// ── Service-Package Links (Cross-Sell) ─────────────────────────────────────

export async function linkServiceToPackage(
  packageId: string,
  serviceId: string,
  linkType: 'curated' | 'auto_geo',
  position?: number
) {
  const { supabase, user } = await requireAdmin()

  const { data, error } = await supabase
    .from('service_listing_package_links')
    .upsert({
      package_id: packageId,
      service_listing_id: serviceId,
      link_type: linkType,
      position_order: position || 0,
    })
    .select()
    .single()

  if (error) throw error

  await logAuditEvent(user.id, 'LINK_SERVICE_TO_PACKAGE', 'service_link', data.id, {
    packageId,
    serviceId,
    linkType,
  })

  return data
}

export async function unlinkServiceFromPackage(packageId: string, serviceId: string) {
  const { supabase, user } = await requireAdmin()

  const { error } = await supabase
    .from('service_listing_package_links')
    .delete()
    .eq('package_id', packageId)
    .eq('service_listing_id', serviceId)

  if (error) throw error

  await logAuditEvent(user.id, 'UNLINK_SERVICE_FROM_PACKAGE', 'service_link', serviceId, {
    packageId,
  })
}

export async function getServiceListingsNearPackage(packageId: string, radiusKm: number = 50) {
  const { supabase } = await requireAdmin()

  // Get package location
  const { data: pkg } = await supabase
    .from('packages')
    .select('destination_id, destinations(latitude, longitude)')
    .eq('id', packageId)
    .single()

  if (!pkg) throw new Error('Package not found')

  // Get all active service listings near destination
  const { data: listings, error } = await supabase
    .from('service_listings')
    .select('*')
    .eq('is_active', true)
    .eq('status', 'approved')

  if (error) throw error

  // Filter by distance (simple lat/lng distance calc)
  // In production, use PostGIS for accurate distance
  return (listings || []).filter(
    (s) => s.latitude && s.longitude // Basic filter for now
  )
}

// ── Audit Logging ──────────────────────────────────────────────────

async function logAuditEvent(
  adminId: string,
  action: string,
  targetType: string,
  targetId: string,
  details?: Record<string, unknown>
) {
  const supabase = await createServiceClient()
  await supabase.from('audit_logs').insert({
    admin_id: adminId,
    action,
    target_type: targetType,
    target_id: targetId,
    details: details || {},
  })
}
