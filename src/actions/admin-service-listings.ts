'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient, createServiceRoleClient } from '@/lib/supabase/server'
import { getActionAuth } from '@/lib/auth/action-auth'
import type { ServiceListing, ServiceListingType, ServiceListingMetadata, ServiceEventScheduleEntry, AdminPermissionKey, UserRole } from '@/types'
import { hasAdminPermission } from '@/types'
import { minPricePaiseFromVariants, type PriceVariant } from '@/lib/package-pricing'
import { fetchServiceBookingCountsForListings } from '@/lib/service-listing-booking-stats'

/**
 * Allow anyone whose role grants the `service_listings` permission.
 * This includes: admin (all permissions), host_onboarding_staff (default),
 * and custom-role users whose custom_permissions list includes it.
 *
 * Returns the SERVICE-ROLE client so queries bypass RLS — the permission
 * check above is the app-level gate; we must not let Supabase RLS silently
 * block non-admin staff who legitimately have this permission.
 */
async function requireAdmin() {
  const { user } = await getActionAuth()
  if (!user) throw new Error('Not authenticated')

  // CRITICAL: use service-role client even for the permission check itself.
  // If team_members has restrictive RLS, the user's JWT can't read its own
  // row, and our role-resolution falls back to profile.role which may still
  // be 'user' if the profile sync hasn't happened. Service-role bypasses RLS
  // entirely so we can authoritatively check the user's role.
  const svc = createServiceRoleClient()

  const [{ data: profile }, { data: membership }] = await Promise.all([
    svc.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    svc
      .from('team_members')
      .select('role, custom_permissions, is_active')
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  // Resolve effective role the same way AdminShell does: profile.role first,
  // fall back to team_members.role. This handles the case where the profile
  // row hasn't been synced yet and still reads 'user'.
  const STAFF: UserRole[] = ['admin', 'social_media_manager', 'field_person', 'chat_responder', 'host_onboarding_staff', 'custom']
  const profileRole = profile?.role as UserRole | undefined
  const memberRole = membership?.is_active && membership.role ? (membership.role as UserRole) : undefined
  const role: UserRole | undefined =
    profileRole && STAFF.includes(profileRole) ? profileRole
    : memberRole && STAFF.includes(memberRole) ? memberRole
    : undefined

  if (!role) {
    throw new Error(
      `Unauthorized — no staff role found. profile.role=${profile?.role ?? 'null'}, membership=${membership ? `role=${membership.role},active=${membership.is_active}` : 'null'}`,
    )
  }

  const customPermissions: AdminPermissionKey[] =
    role === 'custom' && membership?.is_active
      ? ((membership.custom_permissions as AdminPermissionKey[]) ?? [])
      : []

  if (!hasAdminPermission(role, customPermissions, 'service_listings')) {
    throw new Error(`Unauthorized — role '${role}' does not have service_listings permission`)
  }

  // Return service-role client for all subsequent queries so RLS doesn't
  // silently block staff members whose DB role isn't 'admin'.
  const supabase = await createServiceClient()
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
  const listings = (data || []) as (ServiceListing & {
    destination?: { id: string; name: string; slug: string }
    host?: { id: string; username: string; full_name: string | null; avatar_url: string | null }
  })[]
  const { byListingId } = await fetchServiceBookingCountsForListings(
    supabase,
    listings.map((l) => l.id),
  )
  return listings.map((l) => ({ ...l, booking_count: byListingId[l.id] ?? 0 }))
}

export async function getServiceListingDetail(id: string) {
  const { supabase } = await requireAdmin()

  const [{ data, error }, { data: items }] = await Promise.all([
    supabase
      .from('service_listings')
      .select(`
        *,
        destination:destinations(id, name, slug),
        host:profiles(id, username, full_name, avatar_url)
      `)
      .eq('id', id)
      .single(),
    supabase
      .from('service_listing_items')
      .select('*')
      .eq('service_listing_id', id)
      .order('position_order', { ascending: true })
      .order('created_at', { ascending: true }),
  ])

  if (error) throw error

  const listingRow = data as ServiceListing & {
    destination?: { id: string; name: string; slug: string }
    host?: { id: string; username: string; full_name: string | null; avatar_url: string | null }
  }
  const { byListingId, byItemId } = await fetchServiceBookingCountsForListings(supabase, [id])

  return {
    ...listingRow,
    booking_count: byListingId[id] ?? 0,
    booking_count_by_item_id: byItemId,
    items: (items || []) as Array<{
      id: string
      name: string
      description: string | null
      price_paise: number
      unit: string | null
      quantity_available: number
      max_per_booking: number
      images: string[]
      amenities: string[] | null
      is_active: boolean
      position_order: number
      created_at: string
    }>,
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
  unit: 'per_night' | 'per_person' | 'per_day' | 'per_hour' | 'per_week' | 'per_month'
  destination_ids: string[]
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
  /** Activities only: explicit dates + slots. Null = ongoing. */
  event_schedule?: ServiceEventScheduleEntry[] | null
}) {
  const { supabase, user } = await requireAdmin()

  // Validate slug uniqueness
  const { data: existing } = await supabase
    .from('service_listings')
    .select('id')
    .eq('slug', input.slug)
    .single()

  if (existing) throw new Error('Slug already exists')

  // Validate destinations: must have at least one, and all must exist.
  const destinationIds = Array.from(new Set(input.destination_ids.filter(Boolean)))
  if (destinationIds.length === 0) throw new Error('Please pick at least one location')

  const { data: dests } = await supabase
    .from('destinations')
    .select('id')
    .in('id', destinationIds)

  if (!dests || dests.length !== destinationIds.length) {
    throw new Error('One or more locations could not be found')
  }
  const primaryDestinationId = destinationIds[0]

  // Validate images
  if (!input.images || input.images.length === 0) {
    throw new Error('At least one image is required')
  }

  const { destination_ids: _omit, ...rest } = input
  const { data, error } = await supabase
    .from('service_listings')
    .insert({
      ...rest,
      destination_id: primaryDestinationId,
      destination_ids: destinationIds,
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
    unit: 'per_night' | 'per_person' | 'per_day' | 'per_hour' | 'per_week' | 'per_month'
    destination_ids: string[]
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
    /** Activities only: explicit dates + slots. Null = ongoing. */
    event_schedule: ServiceEventScheduleEntry[] | null
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

  // If destination_ids provided, validate and derive primary
  let destinationPatch: { destination_id?: string; destination_ids?: string[] } = {}
  if (input.destination_ids) {
    const destinationIds = Array.from(new Set(input.destination_ids.filter(Boolean)))
    if (destinationIds.length === 0) throw new Error('Please pick at least one location')
    const { data: dests } = await supabase
      .from('destinations')
      .select('id')
      .in('id', destinationIds)
    if (!dests || dests.length !== destinationIds.length) {
      throw new Error('One or more locations could not be found')
    }
    destinationPatch = {
      destination_id: destinationIds[0],
      destination_ids: destinationIds,
    }
  }

  const { destination_ids: _omit, ...rest } = input
  const { data, error } = await supabase
    .from('service_listings')
    .update({
      ...rest,
      ...destinationPatch,
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

  revalidatePath('/admin/service-listings')
  revalidatePath(`/admin/service-listings/${id}`)
  revalidatePath('/')
  revalidatePath('/host')

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

export async function hardDeleteServiceListing(id: string) {
  const { supabase, user } = await requireAdmin()

  const { error } = await supabase.from('service_listings').delete().eq('id', id)
  if (error) throw new Error(error.message)

  await logAuditEvent(user.id, 'HARD_DELETE_SERVICE_LISTING', 'service_listing', id)

  revalidatePath('/admin/service-listings')
  revalidatePath('/')
}

async function notifyHostOfModeration(opts: {
  listingId: string
  approved: boolean
  reason?: string
}) {
  const svc = await createServiceClient()
  const { data: listing } = await svc
    .from('service_listings')
    .select('host_id, title')
    .eq('id', opts.listingId)
    .single()
  if (!listing?.host_id) return

  await svc.from('notifications').insert({
    user_id: listing.host_id,
    type: 'booking',
    title: opts.approved ? 'Listing Approved!' : 'Listing Not Approved',
    body: opts.approved
      ? `Your listing "${listing.title}" has been approved and is now live on UnSOLO!`
      : `Your listing "${listing.title}" was not approved.${opts.reason ? ` Reason: ${opts.reason}` : ''} You can edit and resubmit from your host dashboard.`,
    link: '/host',
  })
}

export async function approveServiceListing(id: string) {
  const { supabase, user } = await requireAdmin()

  const update: Record<string, unknown> = { status: 'approved', is_active: true }
  // Stamp first_approved_at on the very first approval — lets downstream
  // logic tell "never reviewed" apart from "re-review after edit".
  const { data: existing } = await supabase
    .from('service_listings')
    .select('first_approved_at')
    .eq('id', id)
    .single()
  if (!existing?.first_approved_at) {
    update.first_approved_at = new Date().toISOString()
  }

  const { error } = await supabase
    .from('service_listings')
    .update(update)
    .eq('id', id)

  if (error) throw error

  await logAuditEvent(user.id, 'APPROVE_SERVICE_LISTING', 'service_listing', id)
  await notifyHostOfModeration({ listingId: id, approved: true })
}

export async function rejectServiceListing(id: string, reason: string) {
  const { supabase, user } = await requireAdmin()

  const { error } = await supabase
    .from('service_listings')
    .update({ status: 'rejected', is_active: false })
    .eq('id', id)

  if (error) throw error

  await logAuditEvent(user.id, 'REJECT_SERVICE_LISTING', 'service_listing', id, { reason })
  await notifyHostOfModeration({ listingId: id, approved: false, reason })
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
