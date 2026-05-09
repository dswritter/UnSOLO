'use server'

import { createClient, createServiceClient, createServiceRoleClient } from '@/lib/supabase/server'
import { getActionAuth } from '@/lib/auth/action-auth'
import { ROLE_LABELS, type JoinPreferences, type UserRole } from '@/types'
import { minPricePaiseFromVariants, type PriceVariant } from '@/lib/package-pricing'
import { validateScopedPromoCode, type PromoScopeContext } from '@/lib/checkout-promos'

const STAFF_ROLES: UserRole[] = ['admin', 'social_media_manager', 'field_person', 'chat_responder', 'host_onboarding_staff', 'custom']

// ── Audit Log ─────────────────────────────────────────────────

export async function logAuditEvent(
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

// ── Helpers ──────────────────────────────────────────────────

async function requireAdmin() {
  const { supabase, user } = await getActionAuth()
  if (!user) throw new Error('Not authenticated')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') throw new Error('Unauthorized — admin only')
  return { supabase, user }
}

async function requireStaff() {
  const { supabase, user } = await getActionAuth()
  if (!user) throw new Error('Not authenticated')

  const [{ data: profile }, { data: membership }] = await Promise.all([
    supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single(),
    supabase
      .from('team_members')
      .select('role, is_active')
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  const effectiveRole =
    profile?.role && STAFF_ROLES.includes(profile.role as UserRole)
      ? (profile.role as UserRole)
      : membership?.is_active && membership.role && STAFF_ROLES.includes(membership.role as UserRole)
        ? (membership.role as UserRole)
        : null

  if (!effectiveRole) {
    throw new Error('Unauthorized — staff only')
  }
  return { supabase, user, role: effectiveRole }
}

async function syncTeamMemberProfileRoles() {
  const svc = createServiceRoleClient()
  const { data: teamRows, error } = await svc
    .from('team_members')
    .select('user_id, role, is_active')

  if (error || !teamRows?.length) return

  for (const row of teamRows) {
    await svc
      .from('profiles')
      .update({ role: row.is_active ? (row.role as UserRole) : 'user' })
      .eq('id', row.user_id)
  }
}

// ── Dashboard Stats ──────────────────────────────────────────

export async function getAdminDashboardStats() {
  await requireStaff() // verify auth
  // Use service client for platform-wide counts (bypasses RLS)
  const { createClient: createSvc } = await import('@supabase/supabase-js')
  const supabase = createSvc(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const [
    { count: totalUsers },
    { count: totalBookings },
    { count: confirmedBookings },
    { count: pendingBookings },
    { count: cancellationRequested },
    { count: pendingDateRequests },
    { count: teamCount },
    { count: pendingServiceListings },
    { count: pendingCommunityTrips },
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('bookings').select('*', { count: 'exact', head: true }),
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('status', 'confirmed'),
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('cancellation_status', 'requested'),
    supabase.from('custom_date_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('team_members').select('*', { count: 'exact', head: true }).eq('is_active', true),
    // Pending host-submitted service listings (stays, rentals, activities, etc.)
    supabase.from('service_listings').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    // Pending host-created community trips (packages with a host_id and pending moderation)
    supabase.from('packages').select('*', { count: 'exact', head: true })
      .not('host_id', 'is', null)
      .is('archived_at', null)
      .eq('moderation_status', 'pending'),
  ])

  // Revenue from confirmed + completed bookings minus refunds
  const { data: revenueData } = await supabase
    .from('bookings')
    .select('total_amount_paise, refund_amount_paise')
    .in('status', ['confirmed', 'completed'])

  const { data: refundedBookings } = await supabase
    .from('bookings')
    .select('refund_amount_paise')
    .eq('cancellation_status', 'approved')

  const grossRevenue = (revenueData || []).reduce((sum, b) => sum + b.total_amount_paise, 0)
  const totalRefunds = (refundedBookings || []).reduce((sum, b) => sum + (b.refund_amount_paise || 0), 0)
  const totalRevenue = grossRevenue - totalRefunds

  return {
    totalUsers: totalUsers || 0,
    totalBookings: totalBookings || 0,
    confirmedBookings: confirmedBookings || 0,
    pendingBookings: pendingBookings || 0,
    cancellationRequested: cancellationRequested || 0,
    pendingDateRequests: pendingDateRequests || 0,
    teamCount: teamCount || 0,
    totalRevenue,
    pendingServiceListings: pendingServiceListings || 0,
    pendingCommunityTrips: pendingCommunityTrips || 0,
  }
}

// ── Bookings Management ──────────────────────────────────────

export async function getAdminBookings(status?: string) {
  const { supabase } = await requireStaff()

  let query = supabase
    .from('bookings')
    .select('*, package:packages(*, destination:destinations(*)), user:profiles!bookings_user_id_fkey(*), poc:profiles!bookings_assigned_poc_fkey(*)')
    .order('created_at', { ascending: false })

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) console.error('getAdminBookings error:', error)
  return data || []
}

export async function assignPOC(bookingId: string, pocUserId: string) {
  const { supabase } = await requireAdmin()

  const { error } = await supabase
    .from('bookings')
    .update({ assigned_poc: pocUserId })
    .eq('id', bookingId)

  if (error) return { error: error.message }
  return { success: true }
}

export async function updateBookingStatus(bookingId: string, status: string) {
  const { supabase } = await requireAdmin()

  const { error } = await supabase
    .from('bookings')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', bookingId)

  if (error) return { error: error.message }
  return { success: true }
}

export async function updateBookingNotes(bookingId: string, notes: string) {
  const { supabase } = await requireStaff()

  const { error } = await supabase
    .from('bookings')
    .update({ admin_notes: notes })
    .eq('id', bookingId)

  if (error) return { error: error.message }
  return { success: true }
}

// ── Share POC details with customer via email ────────────────

export async function sharePOCWithCustomer(bookingId: string) {
  const { supabase } = await requireStaff()

  const { data: booking } = await supabase
    .from('bookings')
    .select('*, package:packages(title), user:profiles!bookings_user_id_fkey(full_name, username), poc:profiles!bookings_assigned_poc_fkey(full_name, username)')
    .eq('id', bookingId)
    .single()

  if (!booking) return { error: 'Booking not found' }
  if (!booking.poc) return { error: 'No POC assigned to this booking' }

  // Get customer email from auth
  const serviceClient = await createServiceClient()
  const { data: authUser } = await serviceClient.auth.admin.getUserById(booking.user_id)
  if (!authUser?.user?.email) return { error: 'Customer email not found' }

  try {
    const { sendPOCDetails } = await import('@/lib/resend/emails')
    await sendPOCDetails({
      customerEmail: authUser.user.email,
      customerName: (booking.user as { full_name?: string })?.full_name || 'Traveler',
      packageTitle: (booking.package as { title?: string })?.title || 'Trip',
      confirmationCode: booking.confirmation_code || '',
      travelDate: booking.travel_date,
      pocName: (booking.poc as { full_name?: string })?.full_name || 'Team Member',
      pocUsername: (booking.poc as { username?: string })?.username || '',
    })

    await supabase
      .from('bookings')
      .update({ poc_shared_at: new Date().toISOString() })
      .eq('id', bookingId)

    return { success: true }
  } catch (err) {
    console.error('Share POC error:', err)
    return { error: 'Failed to send email' }
  }
}

// ── Send booking confirmation email ──────────────────────────

export async function sendBookingConfirmationEmail(bookingId: string) {
  const { supabase } = await requireStaff()

  const { data: booking } = await supabase
    .from('bookings')
    .select('*, package:packages(*, destination:destinations(*)), user:profiles!bookings_user_id_fkey(*)')
    .eq('id', bookingId)
    .single()

  if (!booking) return { error: 'Booking not found' }

  const serviceClient = await createServiceClient()
  const { data: authUser } = await serviceClient.auth.admin.getUserById(booking.user_id)
  if (!authUser?.user?.email) return { error: 'Customer email not found' }

  try {
    const { sendBookingConfirmation } = await import('@/lib/resend/emails')
    const { tripEndDateIsoForBooking, packageDurationShortLabel } = await import('@/lib/package-trip-calendar')
    const pkg = booking.package as import('@/types').Package | null
    const usr = booking.user as { full_name?: string } | null

    const cal = {
      duration_days: Math.max(1, Number(pkg?.duration_days) || 1),
      departure_dates: pkg?.departure_dates,
      return_dates: pkg?.return_dates,
    }
    const returnDateIso = tripEndDateIsoForBooking(booking.travel_date, cal)

    await sendBookingConfirmation({
      customerEmail: authUser.user.email,
      customerName: usr?.full_name || 'Traveler',
      packageTitle: pkg?.title || 'Trip',
      destination: pkg?.destination ? `${pkg.destination.name}, ${pkg.destination.state}` : '',
      travelDate: booking.travel_date,
      returnDateIso,
      guests: booking.guests,
      totalAmount: booking.total_amount_paise,
      confirmationCode: booking.confirmation_code || '',
      durationSummary: pkg ? packageDurationShortLabel(pkg) : `${cal.duration_days} days`,
    })

    return { success: true }
  } catch (err) {
    console.error('Send confirmation error:', err)
    return { error: 'Failed to send email' }
  }
}

// ── Team Management ──────────────────────────────────────────

export async function getTeamMembers() {
  await requireAdmin()
  const supabase = createServiceRoleClient()

  await syncTeamMemberProfileRoles()

  const { data, error } = await supabase
    .from('team_members')
    .select('*, profile:profiles!team_members_user_id_fkey(*)')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('getTeamMembers error:', error)
  }

  return data || []
}

export async function addTeamMember(
  identifier: string, // email or username
  role: UserRole,
  notes?: string,
  customPermissions?: string[],
) {
  const { user } = await requireAdmin()
  const supabase = createServiceRoleClient()

  if (role === 'user') return { error: 'Cannot add a "user" role to team' }
  if (role === 'custom' && (!customPermissions || customPermissions.length === 0)) {
    return { error: 'Please select at least one permission for a Custom role.' }
  }

  // Find user by email or username
  let targetUserId: string | null = null

  // Try username first
  const { data: byUsername } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', identifier.toLowerCase().trim())
    .single()

  if (byUsername) {
    targetUserId = byUsername.id
  } else {
    // Try by email via service client
    const serviceClient = await createServiceClient()
    const { data: { users } } = await serviceClient.auth.admin.listUsers()
    const found = users?.find(u => u.email?.toLowerCase() === identifier.toLowerCase().trim())
    if (found) {
      targetUserId = found.id
    }
  }

  if (!targetUserId) {
    return { error: `User not found with identifier "${identifier}". They must sign up first.` }
  }

  // Update profile role
  const { error: roleErr } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', targetUserId)

  if (roleErr) return { error: roleErr.message }

  // Upsert team member record
  const { error } = await supabase
    .from('team_members')
    .upsert({
      user_id: targetUserId,
      role,
      added_by: user.id,
      is_active: true,
      notes: notes || null,
      custom_permissions: role === 'custom' ? (customPermissions ?? []) : [],
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

  if (error) return { error: error.message }

  await supabase.from('notifications').insert({
    user_id: targetUserId,
    type: 'system',
    title: 'You were added to the UnSOLO team',
    body: `Your staff role is now ${ROLE_LABELS[role]}. Open the admin panel to access your assigned tools.`,
    link: '/admin',
  })

  await logAuditEvent(user.id, 'add_team_member', 'team_member', targetUserId, {
    assigned_role: role,
    identifier,
    notes: notes || null,
  })

  return { success: true }
}

export async function removeTeamMember(teamMemberId: string) {
  const { user } = await requireAdmin()
  const supabase = createServiceRoleClient()

  // Get user_id first
  const { data: member } = await supabase
    .from('team_members')
    .select('user_id')
    .eq('id', teamMemberId)
    .single()

  if (!member) return { error: 'Team member not found' }

  // Reset role to user
  await supabase
    .from('profiles')
    .update({ role: 'user' })
    .eq('id', member.user_id)

  // Deactivate team member
  const { error } = await supabase
    .from('team_members')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', teamMemberId)

  if (error) return { error: error.message }

  await supabase.from('notifications').insert({
    user_id: member.user_id,
    type: 'system',
    title: 'Your team access was updated',
    body: 'Your staff assignment was removed and your account is back on standard user access.',
    link: '/',
  })

  await logAuditEvent(user.id, 'remove_team_member', 'team_member', teamMemberId, {
    removed_user_id: member.user_id,
  })

  return { success: true }
}

// ── Custom Date Requests Management ──────────────────────────

export async function getAdminCustomRequests(status?: string) {
  await requireStaff() // verify auth
  const { createClient: createSvc } = await import('@supabase/supabase-js')
  const supabase = createSvc(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // Fetch requests without joins first (joins may fail with service client)
  const baseQuery = supabase
    .from('custom_date_requests')
    .select('*')
    .order('created_at', { ascending: false })

  if (status && status !== 'all') {
    baseQuery.eq('status', status)
  }

  const { data: requests, error } = await baseQuery
  if (error) { console.error('Custom requests query error:', error.message); return [] }
  if (!requests || requests.length === 0) return []

  // Enrich with user and package data
  const userIds = [...new Set(requests.map(r => r.user_id).filter(Boolean))]
  const packageIds = [...new Set(requests.map(r => r.package_id).filter(Boolean))]

  const [{ data: users }, { data: packages }] = await Promise.all([
    userIds.length > 0 ? supabase.from('profiles').select('id, username, full_name, avatar_url').in('id', userIds) : Promise.resolve({ data: [] }),
    packageIds.length > 0 ? supabase.from('packages').select('id, title').in('id', packageIds) : Promise.resolve({ data: [] }),
  ])

  const userMap = new Map((users || []).map(u => [u.id, u]))
  const pkgMap = new Map((packages || []).map(p => [p.id, p]))

  return requests.map(r => ({
    ...r,
    user: userMap.get(r.user_id) || null,
    package: pkgMap.get(r.package_id) || null,
  }))
}

export async function updateCustomRequestStatus(requestId: string, status: 'approved' | 'rejected', notes?: string) {
  const { supabase } = await requireStaff()

  const { error } = await supabase
    .from('custom_date_requests')
    .update({
      status,
      admin_notes: notes || null,
    })
    .eq('id', requestId)

  if (error) return { error: error.message }
  return { success: true }
}

// ── Staff POC list (for dropdown) ────────────────────────────

export async function getStaffMembers() {
  const { supabase } = await requireStaff()

  const { data } = await supabase
    .from('profiles')
    .select('id, username, full_name, role')
    .in('role', ['admin', 'social_media_manager', 'field_person', 'chat_responder'])

  return data || []
}

// ── Package Management ───────────────────────────────────────

export async function getAdminPackages() {
  const { supabase } = await requireStaff()

  const { data } = await supabase
    .from('packages')
    .select('*, destination:destinations(*)')
    .is('archived_at', null)
    .order('created_at', { ascending: false })

  return data || []
}

export async function getDestinations() {
  const { supabase } = await requireStaff()
  const { data } = await supabase.from('destinations').select('*').order('name')
  return data || []
}

export async function createPackage(formData: {
  title: string
  slug: string
  destination_id: string
  description: string
  short_description: string
  price_paise: number
  compare_at_price_paise?: number | null
  price_variants?: PriceVariant[] | null
  duration_days: number
  trip_days: number
  trip_nights: number
  exclude_first_day_travel: boolean
  departure_time: 'morning' | 'evening'
  return_time: 'morning' | 'evening'
  max_group_size: number
  difficulty: string
  includes: string[]
  images: string[]
  departure_dates: string[]
  return_dates: string[]
  is_featured: boolean
  join_preferences?: JoinPreferences | null
}) {
  const { supabase } = await requireAdmin()

  const tiers =
    formData.price_variants && formData.price_variants.length >= 2 ? formData.price_variants : null
  const price_paise = tiers ? minPricePaiseFromVariants(tiers) : formData.price_paise

  const { error } = await supabase.from('packages').insert({
    ...formData,
    price_paise,
    compare_at_price_paise: formData.compare_at_price_paise ?? null,
    price_variants: tiers,
    is_active: true,
  })

  if (error) return { error: error.message }
  return { success: true }
}

export async function updatePackage(
  packageId: string,
  updates: {
    title?: string
    slug?: string
    destination_id?: string
    description?: string
    short_description?: string
    price_paise?: number
    compare_at_price_paise?: number | null
    price_variants?: PriceVariant[] | null
    duration_days?: number
    trip_days?: number
    trip_nights?: number
    exclude_first_day_travel?: boolean
    departure_time?: 'morning' | 'evening'
    return_time?: 'morning' | 'evening'
    max_group_size?: number
    difficulty?: string
    includes?: string[]
    images?: string[]
    departure_dates?: string[]
    return_dates?: string[]
    is_featured?: boolean
    is_active?: boolean
    join_preferences?: JoinPreferences | null
  },
) {
  const { supabase } = await requireAdmin()

  const payload = { ...updates }
  if (updates.price_variants !== undefined) {
    const tiers =
      updates.price_variants && updates.price_variants.length >= 2 ? updates.price_variants : null
    payload.price_variants = tiers
    if (tiers) {
      payload.price_paise = minPricePaiseFromVariants(tiers)
    } else if (updates.price_paise != null) {
      payload.price_paise = updates.price_paise
    }
  }

  const { error } = await supabase
    .from('packages')
    .update(payload)
    .eq('id', packageId)

  if (error) return { error: error.message }
  const { revalidatePath } = await import('next/cache')
  revalidatePath('/')
  revalidatePath('/admin/community-trips')
  return { success: true }
}

export async function togglePackageActive(packageId: string, isActive: boolean) {
  const { supabase } = await requireAdmin()

  const { error } = await supabase
    .from('packages')
    .update({ is_active: isActive })
    .eq('id', packageId)

  if (error) return { error: error.message }
  return { success: true }
}

export async function deletePackage(packageId: string) {
  const { supabase } = await requireAdmin()

  async function archivePackage() {
    const { data: pkg } = await supabase
      .from('packages')
      .select('slug, title')
      .eq('id', packageId)
      .single()

    const archivedSlug = `${pkg?.slug || 'package'}-archived-${Date.now().toString(36)}`
    const { error } = await supabase
      .from('packages')
      .update({
        archived_at: new Date().toISOString(),
        is_active: false,
        moderation_status: 'rejected',
        slug: archivedSlug,
        title: `[Archived] ${pkg?.title || 'Package'}`,
      })
      .eq('id', packageId)

    if (error) return { error: error.message }
    const { revalidatePath } = await import('next/cache')
    revalidatePath('/')
    revalidatePath('/admin/packages')
    revalidatePath('/admin/community-trips')
    return { success: true as const, archived: true as const }
  }

  // Check for active bookings
  const { count } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('package_id', packageId)
    .in('status', ['pending', 'confirmed'])

  if (count && count > 0) {
    return { error: `Cannot delete: ${count} active booking(s) exist for this package. Deactivate it instead.` }
  }

  const { count: totalBookings } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('package_id', packageId)

  if (totalBookings && totalBookings > 0) {
    return archivePackage()
  }

  const { error } = await supabase
    .from('packages')
    .delete()
    .eq('id', packageId)

  if (error) {
    if (error.message.includes('violates foreign key constraint')) {
      return archivePackage()
    }
    return { error: error.message }
  }
  return { success: true }
}

export async function createDestination(name: string, state: string, description?: string, imageUrl?: string) {
  const { supabase } = await requireAdmin()

  // Check if destination already exists (case-insensitive name + state)
  const trimName = name.trim()
  const trimState = state.trim()
  const { data: existing } = await supabase
    .from('destinations')
    .select('id, name, state')
    .ilike('name', trimName)
    .ilike('state', trimState)
    .limit(1)
    .maybeSingle()

  if (existing) {
    return { success: true, id: existing.id, name: existing.name, state: existing.state }
  }

  const slug = `${name}-${state}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

  const { data, error } = await supabase.from('destinations').insert({
    name: name.trim(),
    state: state.trim(),
    country: 'India',
    slug,
    description: description || null,
    image_url: imageUrl || null,
  }).select('id, name, state').single()

  if (error) {
    if (error.message.includes('duplicate') || error.message.includes('unique')) {
      return { error: `"${name.trim()}, ${state.trim()}" already exists. Please select it from the dropdown.` }
    }
    return { error: error.message }
  }
  return { success: true, id: data.id, name: data.name, state: data.state }
}

// ── Includes Options Management ─────────────────────────────

export async function getIncludesOptions() {
  const { supabase } = await requireStaff()
  const { data } = await supabase
    .from('includes_options')
    .select('*')
    .order('label')
  return data || []
}

export async function addIncludesOption(label: string) {
  const { supabase } = await requireAdmin()
  const trimmed = label.trim()
  if (!trimmed) return { error: 'Label is required' }

  const { error } = await supabase
    .from('includes_options')
    .insert({ label: trimmed })

  if (error) {
    if (error.message.includes('duplicate')) return { error: 'This option already exists' }
    return { error: error.message }
  }
  return { success: true }
}

// ── Check admin access ───────────────────────────────────────

export async function checkAdminAccess() {
  const { supabase, user } = await getActionAuth()
  if (!user) return { allowed: false, role: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const staffRoles: UserRole[] = ['admin', 'social_media_manager', 'field_person', 'chat_responder']
  const role = (profile?.role || 'user') as UserRole
  return {
    allowed: staffRoles.includes(role),
    role,
  }
}

// ── Discount Management ──────────────────────────────────────

export async function getDiscountOffers() {
  const { supabase } = await requireAdmin()
  const { data } = await supabase
    .from('discount_offers')
    .select(`
      *,
      host:profiles!discount_offers_scope_host_id_fkey(id, username, full_name),
      package:packages!discount_offers_scope_package_id_fkey(id, title, slug),
      service_listing:service_listings!discount_offers_scope_service_listing_id_fkey(id, title, slug, type)
    `)
    .order('created_at', { ascending: false })
  return data || []
}

async function resolveDiscountScopeInput(
  supabase: Awaited<ReturnType<typeof createClient>>,
  scopeMode: string,
  hostUsernameRaw: string | null,
  packageSlugRaw: string | null,
  serviceListingSlugRaw: string | null,
) {
  const hostUsername = hostUsernameRaw?.trim().toLowerCase() || ''
  const packageSlug = packageSlugRaw?.trim() || ''
  const serviceListingSlug = serviceListingSlugRaw?.trim() || ''
  let scopeHostId: string | null = null
  let scopePackageId: string | null = null
  let scopeServiceListingId: string | null = null

  if (scopeMode === 'host') {
    if (!hostUsername) return { error: 'Enter a host username for host-scoped coupons.' }
    const { data: host } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', hostUsername)
      .single()
    if (!host) return { error: `Host @${hostUsername} not found.` }
    scopeHostId = host.id
  }

  if (scopeMode === 'package') {
    if (!packageSlug) return { error: 'Enter a trip slug for trip-specific coupons.' }
    const { data: pkg } = await supabase
      .from('packages')
      .select('id')
      .eq('slug', packageSlug)
      .single()
    if (!pkg) return { error: `Trip slug "${packageSlug}" not found.` }
    scopePackageId = pkg.id
  }

  if (scopeMode === 'service_listing') {
    if (!serviceListingSlug) return { error: 'Enter a listing slug for listing-specific coupons.' }
    const { data: listing } = await supabase
      .from('service_listings')
      .select('id')
      .eq('slug', serviceListingSlug)
      .single()
    if (!listing) return { error: `Listing slug "${serviceListingSlug}" not found.` }
    scopeServiceListingId = listing.id
  }

  return {
    scopeHostId,
    scopePackageId,
    scopeServiceListingId,
  }
}

export async function createDiscountOffer(formData: FormData) {
  const { supabase, user } = await requireAdmin()

  const name = formData.get('name') as string
  const type = formData.get('type') as string
  const discountInput = (formData.get('discountRupees') as string) || (formData.get('discountPaise') as string)
  const discountPaise = parseInt(discountInput) * (formData.get('discountRupees') ? 100 : 1)
  const minTrips = parseInt(formData.get('minTrips') as string) || 0
  const promoCode = (formData.get('promoCode') as string)?.toUpperCase().trim() || null
  const maxUses = formData.get('maxUses') ? parseInt(formData.get('maxUses') as string) : null
  const validUntil = formData.get('validUntil') as string || null
  const checkoutVisibility = ((formData.get('checkoutVisibility') as string) || 'auto').trim()
  const scopeListingType = ((formData.get('scopeListingType') as string) || 'all').trim()
  const scopeMode = ((formData.get('scopeMode') as string) || 'global').trim()

  if (!name || !type || !discountPaise || discountPaise <= 0) {
    return { error: 'Name, type, and discount amount are required' }
  }
  if (!['auto', 'manual_only'].includes(checkoutVisibility)) {
    return { error: 'Invalid checkout visibility.' }
  }
  if (!['all', 'trips', 'stays', 'activities', 'rentals', 'getting_around'].includes(scopeListingType)) {
    return { error: 'Invalid listing type scope.' }
  }
  if (!['global', 'host', 'package', 'service_listing'].includes(scopeMode)) {
    return { error: 'Invalid coupon scope.' }
  }

  const scopeResolution = await resolveDiscountScopeInput(
    supabase,
    scopeMode,
    formData.get('hostUsername') as string | null,
    formData.get('packageSlug') as string | null,
    formData.get('serviceListingSlug') as string | null,
  )
  if ('error' in scopeResolution) return scopeResolution

  const { error } = await supabase.from('discount_offers').insert({
    name,
    type,
    discount_paise: discountPaise,
    min_trips: minTrips,
    promo_code: promoCode,
    max_uses: maxUses,
    valid_until: validUntil || null,
    checkout_visibility: checkoutVisibility,
    scope_listing_type: scopeListingType,
    scope_host_id: scopeResolution.scopeHostId,
    scope_package_id: scopeResolution.scopePackageId,
    scope_service_listing_id: scopeResolution.scopeServiceListingId,
    created_by: user.id,
  })

  if (error) return { error: error.message }

  await logAuditEvent(user.id, 'discount_created', 'discount_offer', name, { type, discountPaise })

  const { revalidatePath } = await import('next/cache')
  revalidatePath('/admin/discounts')
  return { success: true }
}

export async function toggleDiscountOffer(offerId: string, isActive: boolean) {
  const { supabase, user } = await requireAdmin()

  await supabase
    .from('discount_offers')
    .update({ is_active: isActive })
    .eq('id', offerId)

  await logAuditEvent(user.id, isActive ? 'discount_activated' : 'discount_deactivated', 'discount_offer', offerId)

  const { revalidatePath } = await import('next/cache')
  revalidatePath('/admin/discounts')
  return { success: true }
}

export async function editDiscountOffer(offerId: string, formData: FormData) {
  const { supabase, user } = await requireAdmin()

  const updates: Record<string, unknown> = {}
  const name = formData.get('name') as string
  const discountRupees = formData.get('discountRupees') as string
  const promoCode = (formData.get('promoCode') as string)?.toUpperCase().trim()
  const maxUses = formData.get('maxUses') as string
  const validUntil = formData.get('validUntil') as string
  const checkoutVisibility = ((formData.get('checkoutVisibility') as string) || 'auto').trim()
  const scopeListingType = ((formData.get('scopeListingType') as string) || 'all').trim()
  const scopeMode = ((formData.get('scopeMode') as string) || 'global').trim()

  if (name) updates.name = name
  if (discountRupees) updates.discount_paise = parseInt(discountRupees) * 100
  updates.promo_code = promoCode || null
  updates.max_uses = maxUses ? parseInt(maxUses) : null
  updates.valid_until = validUntil || null
  updates.checkout_visibility = checkoutVisibility
  updates.scope_listing_type = scopeListingType

  const scopeResolution = await resolveDiscountScopeInput(
    supabase,
    scopeMode,
    formData.get('hostUsername') as string | null,
    formData.get('packageSlug') as string | null,
    formData.get('serviceListingSlug') as string | null,
  )
  if ('error' in scopeResolution) return scopeResolution
  updates.scope_host_id = scopeResolution.scopeHostId
  updates.scope_package_id = scopeResolution.scopePackageId
  updates.scope_service_listing_id = scopeResolution.scopeServiceListingId

  const { error } = await supabase
    .from('discount_offers')
    .update(updates)
    .eq('id', offerId)

  if (error) return { error: error.message }

  await logAuditEvent(user.id, 'discount_edited', 'discount_offer', offerId, updates)

  const { revalidatePath } = await import('next/cache')
  revalidatePath('/admin/discounts')
  return { success: true }
}

export async function grantUserCredits(username: string, amountPaise: number, reason: string) {
  const { user } = await requireAdmin()
  const svcSupabase = await createServiceClient()

  const { data: targetUser } = await svcSupabase
    .from('profiles')
    .select('id, referral_credits_paise, full_name')
    .ilike('username', username)
    .single()

  if (!targetUser) return { error: `User @${username} not found` }

  await svcSupabase
    .from('profiles')
    .update({ referral_credits_paise: (targetUser.referral_credits_paise || 0) + amountPaise })
    .eq('id', targetUser.id)

  // Notify the user
  await svcSupabase.from('notifications').insert({
    user_id: targetUser.id,
    type: 'booking',
    title: 'Credits Added!',
    body: `You received ₹${(amountPaise / 100).toLocaleString('en-IN')} in credits. ${reason}`,
    link: '/profile',
  })

  await logAuditEvent(user.id, 'credits_granted', 'profile', targetUser.id, { amountPaise, reason, username })

  return { success: true, userName: targetUser.full_name || username }
}

// Validate promo code at checkout
export async function validatePromoCode(code: string, context?: PromoScopeContext) {
  const supabase = (await import('@/lib/supabase/server')).createClient
  const supa = await supabase()
  const effectiveContext = context ?? { listingType: 'trips' as const }
  const result = await validateScopedPromoCode(supa, code, effectiveContext)
  if ('error' in result) return result
  return {
    valid: true,
    discountPaise: result.discountPaise,
    name: result.name,
    offerId: result.offerId,
  }
}

// ── Community Trip Moderation ────────────────────────────────

export async function moderateCommunityTrip(tripId: string, approve: boolean, reason?: string) {
  const { supabase, user } = await requireAdmin()

  const { data: trip } = await supabase
    .from('packages')
    .select('host_id, title, host:profiles!packages_host_id_fkey(id, full_name, username)')
    .eq('id', tripId)
    .single()

  if (!trip || !trip.host_id) return { error: 'Community trip not found' }

  const newStatus = approve ? 'approved' : 'rejected'

  const updatePayload: Record<string, unknown> = {
    moderation_status: newStatus,
    is_active: approve, // Only active if approved
  }
  if (approve) {
    // Stamp first_approved_at on the very first approval; never overwrite it
    // on subsequent re-approvals (edits that bounced to pending).
    const { data: existing } = await supabase
      .from('packages')
      .select('first_approved_at')
      .eq('id', tripId)
      .single()
    if (!existing?.first_approved_at) {
      updatePayload.first_approved_at = new Date().toISOString()
    }
  }

  await supabase
    .from('packages')
    .update(updatePayload)
    .eq('id', tripId)

  // Notify host
  const svcSupabase = await createServiceClient()
  const host = trip.host as unknown as { id: string; full_name: string | null; username: string }

  await svcSupabase.from('notifications').insert({
    user_id: host.id,
    type: 'booking',
    title: approve ? 'Trip Approved!' : 'Trip Not Approved',
    body: approve
      ? `Your trip "${trip.title}" has been approved and is now live on UnSOLO!`
      : `Your trip "${trip.title}" was not approved.${reason ? ` Reason: ${reason}` : ''} You can edit and resubmit.`,
    link: '/host',
  })

  // Audit log
  await logAuditEvent(user.id, approve ? 'approve_community_trip' : 'reject_community_trip', 'package', tripId, { reason })

  const { revalidatePath } = await import('next/cache')
  revalidatePath('/admin/community-trips')
  revalidatePath('/')
  revalidatePath('/host')
  return { success: true }
}

// ── Community chat rooms (general) — admin + social_media_manager ─────────

async function requireCommunityChatStaff() {
  const { supabase, user } = await getActionAuth()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const role = profile?.role as UserRole
  if (role !== 'admin' && role !== 'social_media_manager') {
    throw new Error('Unauthorized — admin or social team only')
  }
  return { user }
}

export type CommunityChatRoomRow = {
  id: string
  name: string
  type: string
  description: string | null
  image_url: string | null
  is_active: boolean
  created_at: string
  package_id: string | null
}

export async function getCommunityChatRoomsAdmin(): Promise<{ rooms: CommunityChatRoomRow[]; error?: string }> {
  try {
    await requireCommunityChatStaff()
  } catch (e) {
    return { rooms: [], error: e instanceof Error ? e.message : 'Unauthorized' }
  }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('chat_rooms')
    .select('id, name, type, description, image_url, is_active, created_at, package_id')
    .eq('type', 'general')
    .order('name')
  if (error) return { rooms: [], error: error.message }
  return { rooms: (data || []) as CommunityChatRoomRow[] }
}

export async function createCommunityChatRoomAdmin(input: {
  name: string
  description?: string | null
  image_url?: string | null
}) {
  try {
    const { user } = await requireCommunityChatStaff()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('chat_rooms')
      .insert({
        name: input.name.trim(),
        type: 'general',
        description: input.description?.trim() || null,
        image_url: input.image_url?.trim() || null,
        is_active: true,
        created_by: user.id,
      })
      .select('id')
      .single()
    if (error) return { error: error.message }
    await logAuditEvent(user.id, 'create_community_chat_room', 'chat_room', data.id, { name: input.name })
    const { revalidatePath } = await import('next/cache')
    revalidatePath('/community')
    revalidatePath('/admin/community-chats')
    return { success: true, id: data.id }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unauthorized' }
  }
}

export async function updateCommunityChatRoomAdmin(
  roomId: string,
  input: {
    name?: string
    description?: string | null
    image_url?: string | null
    is_active?: boolean
  },
) {
  try {
    const { user } = await requireCommunityChatStaff()
    const supabase = await createClient()
    const patch: Record<string, unknown> = {}
    if (input.name !== undefined) patch.name = input.name.trim()
    if (input.description !== undefined) patch.description = input.description?.trim() || null
    if (input.image_url !== undefined) patch.image_url = input.image_url?.trim() || null
    if (input.is_active !== undefined) patch.is_active = input.is_active
    const { data: updatedRows, error } = await supabase
      .from('chat_rooms')
      .update(patch)
      .eq('id', roomId)
      .eq('type', 'general')
      .select('id')
    if (error) return { error: error.message }
    if (!updatedRows?.length) return { error: 'No rows updated — check permissions or room id' }
    await logAuditEvent(user.id, 'update_community_chat_room', 'chat_room', roomId, patch)
    const { revalidatePath } = await import('next/cache')
    revalidatePath('/community')
    revalidatePath('/admin/community-chats')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unauthorized' }
  }
}

export async function deleteCommunityChatRoomAdmin(roomId: string) {
  try {
    const { user } = await requireAdmin()
    const supabase = await createClient()
    const { data: deletedRows, error } = await supabase.from('chat_rooms').delete().eq('id', roomId).eq('type', 'general').select('id')
    if (error) return { error: error.message }
    if (!deletedRows?.length) return { error: 'Delete failed — check permissions or room id' }
    await logAuditEvent(user.id, 'delete_community_chat_room', 'chat_room', roomId, {})
    const { revalidatePath } = await import('next/cache')
    revalidatePath('/community')
    revalidatePath('/admin/community-chats')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unauthorized' }
  }
}
