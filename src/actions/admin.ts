'use server'

import { createClient, createServiceClient, createServiceRoleClient } from '@/lib/supabase/server'
import { getActionAuth } from '@/lib/auth/action-auth'
import { ROLE_LABELS, type JoinPreferences, type UserRole } from '@/types'
import { minPricePaiseFromVariants, type PriceVariant } from '@/lib/package-pricing'
import {
  validateScopedPromoCode,
  type PromoScopeContext,
  type PromoAmountContext,
} from '@/lib/checkout-promos'

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

  // Read profile + membership via service-role so RLS on team_members can't
  // silently hide a staff member's own role from them.
  const svc = createServiceRoleClient()
  const [{ data: profile }, { data: membership }] = await Promise.all([
    svc.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    svc
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
    throw new Error(
      `Unauthorized — no staff role found. profile.role=${profile?.role ?? 'null'}, membership=${membership ? `role=${membership.role},active=${membership.is_active}` : 'null'}`,
    )
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
    .select('*, package:packages(*, destination:destinations(*)), service_listing:service_listings(id, title, type), service_listing_item:service_listing_items(name), user:profiles!bookings_user_id_fkey(*), poc:profiles!bookings_assigned_poc_fkey(*)')
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

  // Assigning a registered member clears any outsider POC.
  const { error } = await supabase
    .from('bookings')
    .update({ assigned_poc: pocUserId, poc_external_name: null, poc_external_phone: null })
    .eq('id', bookingId)

  if (error) return { error: error.message }
  return { success: true }
}

/** Assign any registered UnSOLO member as POC, by username or id. */
export async function assignMemberPOC(bookingId: string, usernameOrId: string) {
  const { supabase, user } = await requireAdmin()
  const handle = usernameOrId.trim().replace(/^@/, '')
  if (!handle) return { error: 'Enter a username' }

  const svc = createServiceRoleClient()
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(handle)
  const { data: member } = isUuid
    ? await svc.from('profiles').select('id, username, full_name').eq('id', handle).maybeSingle()
    : await svc.from('profiles').select('id, username, full_name').ilike('username', handle).maybeSingle()
  if (!member) return { error: `No UnSOLO member @${handle}` }

  const { error } = await supabase
    .from('bookings')
    .update({ assigned_poc: member.id, poc_external_name: null, poc_external_phone: null })
    .eq('id', bookingId)
  if (error) return { error: error.message }
  await logAuditEvent(user.id, 'assign_poc', 'booking', bookingId, { poc: member.username, pocId: member.id })
  return { success: true, name: member.full_name || member.username }
}

/** Live search for any registered member (POC autocomplete). */
export async function searchMembersForPOC(query: string) {
  await requireAdmin()
  const q = query.trim().replace(/^@/, '')
  if (q.length < 2) return { members: [] as { id: string; username: string | null; full_name: string | null }[] }
  const svc = createServiceRoleClient()
  const { data } = await svc
    .from('profiles')
    .select('id, username, full_name')
    .or(`username.ilike.%${q}%,full_name.ilike.%${q}%`)
    .limit(8)
  return { members: (data || []) as { id: string; username: string | null; full_name: string | null }[] }
}

/** Assign an outsider (no UnSOLO account) as POC — name + phone only. */
export async function assignExternalPOC(bookingId: string, name: string, phone: string) {
  const { supabase, user } = await requireAdmin()
  const cleanName = name.trim()
  const cleanPhone = phone.trim()
  if (!cleanName) return { error: 'Enter the POC name' }
  if (cleanPhone.replace(/\D/g, '').length < 10) return { error: 'Enter a valid phone number' }

  const { error } = await supabase
    .from('bookings')
    .update({ assigned_poc: null, poc_external_name: cleanName, poc_external_phone: cleanPhone })
    .eq('id', bookingId)
  if (error) return { error: error.message }
  await logAuditEvent(user.id, 'assign_poc_external', 'booking', bookingId, { name: cleanName, phone: cleanPhone })
  return { success: true, name: cleanName }
}

export async function updateBookingStatus(bookingId: string, status: string) {
  const { supabase } = await requireAdmin()

  const { error } = await supabase
    .from('bookings')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', bookingId)

  if (error) return { error: error.message }

  // Email the customer a status-appropriate note on completion / cancellation.
  if (status === 'completed' || status === 'cancelled') {
    try {
      const svc = createServiceRoleClient()
      const { data: b } = await svc
        .from('bookings')
        .select('user_id, confirmation_code, admin_cancellation_note, package:packages(title), service_listing:service_listings(title)')
        .eq('id', bookingId)
        .single()
      if (b) {
        const { data: authUser } = await svc.auth.admin.getUserById(b.user_id as string)
        const email = authUser?.user?.email
        if (email) {
          const { data: prof } = await svc.from('profiles').select('full_name').eq('id', b.user_id).single()
          const { APP_URL } = await import('@/lib/constants')
          const title = (b.package as { title?: string } | null)?.title
            || (b.service_listing as { title?: string } | null)?.title
            || 'your trip'
          const common = {
            customerEmail: email,
            customerName: prof?.full_name || 'there',
            packageTitle: title,
            confirmationCode: (b.confirmation_code as string | null) || '',
            bookingsUrl: `${APP_URL}/bookings`,
          }
          const emails = await import('@/lib/resend/emails')
          if (status === 'completed') await emails.sendBookingCompletedEmail(common)
          else await emails.sendBookingCancelledEmail({ ...common, note: (b.admin_cancellation_note as string | null) ?? null })
        }
      }
    } catch {
      /* email is non-critical */
    }
  }

  return { success: true }
}

/** Send a short custom message (a "minor update") to the customer — not a full receipt. */
export async function sendBookingMessage(bookingId: string, message: string) {
  await requireStaff()
  const msg = message.trim()
  if (!msg) return { error: 'Enter a message' }
  if (msg.length > 2000) return { error: 'Message is too long' }

  const svc = createServiceRoleClient()
  const { data: b } = await svc
    .from('bookings')
    .select('user_id, confirmation_code, package:packages(title), service_listing:service_listings(title)')
    .eq('id', bookingId)
    .single()
  if (!b) return { error: 'Booking not found' }

  const { data: authUser } = await svc.auth.admin.getUserById(b.user_id as string)
  const email = authUser?.user?.email
  if (!email) return { error: 'Customer email not found' }
  const { data: prof } = await svc.from('profiles').select('full_name').eq('id', b.user_id).single()
  const title = (b.package as { title?: string } | null)?.title
    || (b.service_listing as { title?: string } | null)?.title
    || 'your trip'

  try {
    const { sendBookingMessageEmail } = await import('@/lib/resend/emails')
    await sendBookingMessageEmail({
      customerEmail: email,
      customerName: prof?.full_name || 'there',
      packageTitle: title,
      confirmationCode: (b.confirmation_code as string | null) || '',
      message: msg,
    })
  } catch {
    return { error: 'Failed to send the message' }
  }
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

export async function adminDeleteBooking(bookingId: string) {
  const { supabase, user } = await requireAdmin()

  // Only allow deletion of cancelled or pending bookings
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, status, payment_status')
    .eq('id', bookingId)
    .single()

  if (!booking) return { error: 'Booking not found' }
  if (!['cancelled', 'pending'].includes(booking.status)) {
    return { error: 'Only cancelled or pending bookings can be deleted' }
  }

  // Bookings have no DELETE RLS policy, so the session client silently deletes
  // 0 rows (the row reappears on refresh). Use the service-role client and
  // confirm a row was actually removed before reporting success.
  const svc = createServiceRoleClient()
  const { data: deleted, error } = await svc
    .from('bookings')
    .delete()
    .eq('id', bookingId)
    .select('id')
  if (error) return { error: error.message }
  if (!deleted?.length) return { error: 'Delete failed — the booking could not be removed.' }

  await logAuditEvent(user.id, 'DELETE_BOOKING', 'booking', bookingId, {
    status: booking.status,
  })

  return { success: true }
}

// ── Share POC details with customer via email ────────────────

export async function sharePOCWithCustomer(bookingId: string) {
  const { supabase } = await requireStaff()

  const { data: booking } = await supabase
    .from('bookings')
    .select('*, package:packages(title), user:profiles!bookings_user_id_fkey(full_name, username), poc:profiles!bookings_assigned_poc_fkey(full_name, username, phone_number)')
    .eq('id', bookingId)
    .single()

  if (!booking) return { error: 'Booking not found' }

  const memberPoc = booking.poc as { full_name?: string; username?: string; phone_number?: string | null } | null
  const externalName = booking.poc_external_name as string | null
  const externalPhone = booking.poc_external_phone as string | null
  if (!memberPoc && !externalName) return { error: 'No POC assigned to this booking' }

  // Get customer email from auth
  const serviceClient = await createServiceClient()
  const { data: authUser } = await serviceClient.auth.admin.getUserById(booking.user_id)
  if (!authUser?.user?.email) return { error: 'Customer email not found' }

  const { APP_URL } = await import('@/lib/constants')
  const pocUsername = memberPoc?.username || ''

  try {
    const { sendPOCDetails } = await import('@/lib/resend/emails')
    await sendPOCDetails({
      customerEmail: authUser.user.email,
      customerName: (booking.user as { full_name?: string })?.full_name || 'Traveler',
      packageTitle: (booking.package as { title?: string })?.title || 'Trip',
      confirmationCode: booking.confirmation_code || '',
      travelDate: booking.travel_date,
      pocName: memberPoc?.full_name || externalName || 'Team Member',
      pocUsername,
      pocPhone: memberPoc ? memberPoc.phone_number ?? null : externalPhone,
      // Outsiders have no UnSOLO account, so no in-app chat link.
      unsoloChatUrl: pocUsername ? `${APP_URL}/profile/${pocUsername}` : null,
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

  // Pull both relationships — only one of them will resolve depending on
  // whether the booking is a package trip or a service listing.
  const { data: booking } = await supabase
    .from('bookings')
    .select(
      `*,
       package:packages(*, destination:destinations(*)),
       service_listing:service_listings(*),
       service_listing_item:service_listing_items(name),
       user:profiles!bookings_user_id_fkey(*)`,
    )
    .eq('id', bookingId)
    .single()

  if (!booking) return { error: 'Booking not found' }

  const serviceClient = await createServiceClient()
  const { data: authUser } = await serviceClient.auth.admin.getUserById(booking.user_id)
  if (!authUser?.user?.email) return { error: 'Customer email not found' }

  const usr = booking.user as { full_name?: string } | null
  const isServiceBooking = booking.booking_type === 'service' || !!booking.service_listing_id

  try {
    if (isServiceBooking) {
      // Service-listing booking — route to the service email template.
      const listing = booking.service_listing as
        | { title: string; type: string; location: string }
        | null
      if (!listing) return { error: 'Service listing not found for this booking' }

      const { sendServiceBookingConfirmedEmail } = await import('@/lib/resend/emails')
      await sendServiceBookingConfirmedEmail({
        customerEmail: authUser.user.email,
        customerName: usr?.full_name,
        listingTitle: listing.title,
        listingType: listing.type,
        location: listing.location,
        checkInDate: booking.check_in_date ?? '',
        checkOutDate: booking.check_out_date ?? undefined,
        quantity: booking.quantity ?? 1,
        amountPaise: booking.amount_paise ?? booking.total_amount_paise ?? 0,
        bookingId: booking.id,
        itemName: (booking.service_listing_item as { name?: string } | null)?.name ?? null,
      })
      return { success: true }
    }

    // Package (trip) booking — send the full receipt (host/POC, trip + chat
    // links, WhatsApp, pay-remaining) via the shared builder.
    const { sendTripBookingReceipt } = await import('@/lib/email/tripReceipt')
    await sendTripBookingReceipt(booking.id)

    return { success: true }
  } catch (err) {
    console.error('Send confirmation error:', err)
    const message = err instanceof Error ? err.message : 'Failed to send email'
    return { error: `Failed to send email: ${message}` }
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
  await requireStaff()
  // Service-role read — destinations are admin-managed reference data and RLS
  // may not permit non-admin staff to read directly.
  const svc = createServiceRoleClient()
  const { data } = await svc.from('destinations').select('*').order('name')
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

/** Permanently removes a package / community trip row regardless of bookings. */
export async function hardDeletePackage(packageId: string) {
  const { supabase, user } = await requireAdmin()

  // Null out package_id on existing bookings first so FK doesn't block
  await supabase.from('bookings').update({ package_id: null }).eq('package_id', packageId)

  const { error } = await supabase.from('packages').delete().eq('id', packageId)
  if (error) return { error: error.message }

  await logAuditEvent(user.id, 'HARD_DELETE_PACKAGE', 'package', packageId)

  const { revalidatePath } = await import('next/cache')
  revalidatePath('/')
  revalidatePath('/admin/packages')
  revalidatePath('/admin/community-trips')
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

/**
 * Reads the discount-kind inputs from a discount-offer form and returns the
 * column values to write, or an error. Shared by create + edit.
 * - fixed       → discount_paise (₹ × 100)
 * - percent     → discount_percent (1..100) + optional discount_percent_cap_paise
 * - free_guests → free_guest_count (≥1); pay for (n − count)
 */
function parseDiscountKindFields(formData: FormData):
  | {
      discount_kind: 'fixed' | 'percent' | 'free_guests'
      discount_paise: number | null
      discount_percent: number | null
      discount_percent_cap_paise: number | null
      free_guest_count: number
      free_guests_min_group: number
    }
  | { error: string } {
  const discountKind = ((formData.get('discountKind') as string) || 'fixed').trim()
  if (!['fixed', 'percent', 'free_guests'].includes(discountKind)) {
    return { error: 'Invalid discount kind.' }
  }

  const base = {
    discount_kind: discountKind as 'fixed' | 'percent' | 'free_guests',
    discount_paise: null as number | null,
    discount_percent: null as number | null,
    discount_percent_cap_paise: null as number | null,
    free_guest_count: 1,
    free_guests_min_group: 1,
  }

  if (discountKind === 'fixed') {
    const discountInput =
      (formData.get('discountRupees') as string) || (formData.get('discountPaise') as string)
    const discountPaise = parseInt(discountInput) * (formData.get('discountRupees') ? 100 : 1)
    if (!discountPaise || discountPaise <= 0) {
      return { error: 'Enter a discount amount in ₹.' }
    }
    return { ...base, discount_paise: discountPaise }
  }

  if (discountKind === 'percent') {
    const percent = parseInt(formData.get('discountPercent') as string)
    if (!percent || percent < 1 || percent > 100) {
      return { error: 'Enter a percentage between 1 and 100.' }
    }
    const capInput = formData.get('discountPercentCap') as string
    const capPaise = capInput ? parseInt(capInput) * 100 : null
    if (capPaise != null && capPaise <= 0) {
      return { error: 'Max cap must be greater than ₹0.' }
    }
    return { ...base, discount_percent: percent, discount_percent_cap_paise: capPaise }
  }

  // free_guests
  const freeCount = parseInt(formData.get('freeGuestCount') as string) || 1
  const minGroup = parseInt(formData.get('freeGuestsMinGroup') as string) || 1
  if (freeCount < 1) {
    return { error: 'Free guests must be at least 1.' }
  }
  if (minGroup < 1) {
    return { error: 'Minimum total guests must be at least 1.' }
  }
  if (freeCount >= minGroup) {
    return { error: 'Minimum total guests must be greater than the number of free guests.' }
  }
  return { ...base, free_guest_count: freeCount, free_guests_min_group: minGroup }
}

export async function createDiscountOffer(formData: FormData) {
  const { supabase, user } = await requireAdmin()

  const name = formData.get('name') as string
  const type = formData.get('type') as string
  const minTrips = parseInt(formData.get('minTrips') as string) || 0
  const promoCode = (formData.get('promoCode') as string)?.toUpperCase().trim() || null
  const maxUses = formData.get('maxUses') ? parseInt(formData.get('maxUses') as string) : null
  const validUntil = formData.get('validUntil') as string || null
  const checkoutVisibility = ((formData.get('checkoutVisibility') as string) || 'auto').trim()
  const scopeListingType = ((formData.get('scopeListingType') as string) || 'all').trim()
  const scopeMode = ((formData.get('scopeMode') as string) || 'global').trim()

  if (!name || !type) {
    return { error: 'Name and type are required' }
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

  const discountFields = parseDiscountKindFields(formData)
  if ('error' in discountFields) return discountFields

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
    ...discountFields,
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

  await logAuditEvent(user.id, 'discount_created', 'discount_offer', name, { type, ...discountFields })

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
  const promoCode = (formData.get('promoCode') as string)?.toUpperCase().trim()
  const maxUses = formData.get('maxUses') as string
  const validUntil = formData.get('validUntil') as string
  const checkoutVisibility = ((formData.get('checkoutVisibility') as string) || 'auto').trim()
  const scopeListingType = ((formData.get('scopeListingType') as string) || 'all').trim()
  const scopeMode = ((formData.get('scopeMode') as string) || 'global').trim()

  if (name) updates.name = name

  const discountFields = parseDiscountKindFields(formData)
  if ('error' in discountFields) return discountFields
  Object.assign(updates, discountFields)

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
export async function validatePromoCode(
  code: string,
  context?: PromoScopeContext,
  amount?: PromoAmountContext,
) {
  const supabase = (await import('@/lib/supabase/server')).createClient
  const supa = await supabase()
  const effectiveContext = context ?? { listingType: 'trips' as const }
  const result = await validateScopedPromoCode(supa, code, effectiveContext, amount)
  if ('error' in result) return result
  return {
    valid: true,
    discountPaise: result.discountPaise,
    spec: result.spec,
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

// ── Recover bookings paid on Razorpay but missing in the DB ──────────────────
// During a window where the bookings insert failed (e.g. a migration not yet
// applied), travelers were charged but no booking row was written — invisible
// to them and the host. scan reports those orphaned captured payments; recover
// rebuilds a confirmed booking from the Razorpay order notes (idempotent).

export type OrphanedPayment = {
  paymentId: string
  orderId: string
  amountPaise: number
  email: string | null
  contact: string | null
  capturedAt: number
  notes: Record<string, string>
}

export async function scanOrphanedRazorpayPayments(sinceDays = 14) {
  await requireAdmin()
  const { razorpay } = await import('@/lib/razorpay/client')
  const svc = createServiceRoleClient()
  const from = Math.floor((Date.now() - sinceDays * 86400000) / 1000)

  let items: Record<string, unknown>[]
  try {
    const res = (await razorpay.payments.all({ from, count: 100 })) as unknown as { items?: Record<string, unknown>[] }
    items = res.items || []
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not list Razorpay payments' }
  }

  const orphans: OrphanedPayment[] = []
  for (const p of items) {
    if (p.status !== 'captured' || !p.order_id) continue
    const orderId = String(p.order_id)
    const { data: existing } = await svc
      .from('bookings')
      .select('id')
      .or(`stripe_session_id.eq.${orderId},balance_razorpay_order_id.eq.${orderId}`)
      .maybeSingle()
    if (existing) continue

    let notes: Record<string, string> = {}
    try {
      const order = await razorpay.orders.fetch(orderId)
      notes = (order.notes as Record<string, string>) || {}
    } catch {
      /* notes are best-effort */
    }
    orphans.push({
      paymentId: String(p.id),
      orderId,
      amountPaise: Number(p.amount),
      email: p.email ? String(p.email) : null,
      contact: p.contact ? String(p.contact) : null,
      capturedAt: Number(p.created_at),
      notes,
    })
  }
  return { orphans }
}

export async function recoverBookingFromRazorpayOrder(orderId: string) {
  const { user: admin } = await requireAdmin()
  const { razorpay } = await import('@/lib/razorpay/client')
  const svc = createServiceRoleClient()

  // Idempotent — skip if a booking already exists for this order.
  const { data: existing } = await svc
    .from('bookings')
    .select('id')
    .or(`stripe_session_id.eq.${orderId},balance_razorpay_order_id.eq.${orderId}`)
    .maybeSingle()
  if (existing) return { info: 'A booking already exists for this order', bookingId: existing.id }

  let order: { notes?: Record<string, string> | null }
  let paymentItems: Record<string, unknown>[]
  try {
    order = (await razorpay.orders.fetch(orderId)) as unknown as { notes?: Record<string, string> | null }
    const pays = (await razorpay.orders.fetchPayments(orderId)) as unknown as { items?: Record<string, unknown>[] }
    paymentItems = pays.items || []
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not fetch the Razorpay order' }
  }

  const captured = paymentItems.find((p) => p.status === 'captured')
  if (!captured) return { error: 'No captured payment found for this order' }

  const notes = order.notes || {}
  if (notes.balance === 'true') {
    return { error: 'This is a balance payment for an existing booking — recover the original booking order instead.' }
  }
  const userId = notes.userId
  const packageId = notes.packageId
  const travelDate = notes.travelDate
  const guests = Math.max(1, parseInt(notes.guests || '1', 10) || 1)
  if (!userId || !packageId || !travelDate) {
    return { error: 'Order notes are missing user/package/date — rebuild this booking manually.' }
  }

  const { data: pkg } = await svc
    .from('packages')
    .select('price_paise, title')
    .eq('id', packageId)
    .single()
  if (!pkg) return { error: 'Package not found for this order' }

  const total = (pkg.price_paise || 0) * guests
  const paid = Number(captured.amount)
  const deposit = Math.min(paid, total || paid)
  const fullyPaid = total > 0 ? paid >= total : true

  const { generateConfirmationCode } = await import('@/lib/utils')
  const confirmationCode = generateConfirmationCode()

  const { data: booking, error } = await svc
    .from('bookings')
    .insert({
      user_id: userId,
      package_id: packageId,
      status: 'confirmed',
      travel_date: travelDate,
      guests,
      total_amount_paise: total || paid,
      gross_paise: total || paid,
      deposit_paise: deposit,
      discount_paise: 0,
      stripe_session_id: orderId,
      stripe_payment_intent: String(captured.id),
      confirmation_code: confirmationCode,
    })
    .select('id')
    .single()
  if (error || !booking) return { error: error?.message || 'Could not create booking' }

  await svc.from('notifications').insert({
    user_id: userId,
    type: 'booking',
    title: 'Your booking is confirmed',
    body: `We've restored your booking for ${pkg.title || 'your trip'} (#${confirmationCode}).${fullyPaid ? '' : ' Pay the remaining balance anytime from My Trips.'}`,
    link: '/bookings',
  })

  await logAuditEvent(admin.id, 'recover_booking_from_payment', 'booking', booking.id, {
    orderId, paymentId: String(captured.id), paid, total, fullyPaid,
  })

  // Send the recovered traveler the full receipt too.
  const { sendTripBookingReceipt } = await import('@/lib/email/tripReceipt')
  await sendTripBookingReceipt(booking.id)

  return { success: true, bookingId: booking.id, fullyPaid, balanceDuePaise: Math.max(0, (total || paid) - deposit) }
}

// ── Trip group chats (staff visibility + membership management) ──────────────

export type AdminTripGroup = {
  roomId: string
  name: string
  image: string | null
  packageId: string | null
  packageSlug: string | null
  memberCount: number
  createdAt: string
}

/** Every trip group chat, for staff. Uses the service role so all rooms are visible. */
export async function getAllTripChatGroups(): Promise<{ groups?: AdminTripGroup[]; error?: string }> {
  await requireStaff()
  const svc = createServiceRoleClient()
  const { data, error } = await svc
    .from('chat_rooms')
    .select('id, name, image_url, package_id, created_at, package:packages(slug, title, images), members:chat_room_members(count)')
    .eq('type', 'trip')
    .order('created_at', { ascending: false })
  if (error) return { error: error.message }

  const groups: AdminTripGroup[] = (data || []).map((r) => {
    const pkg = r.package as { slug?: string; title?: string; images?: string[] } | null
    const memberCount = Array.isArray(r.members) ? Number((r.members[0] as { count?: number })?.count ?? 0) : 0
    return {
      roomId: String(r.id),
      name: pkg?.title || String(r.name || 'Trip Chat'),
      image: (r.image_url as string | null) || (pkg?.images?.[0] ?? null),
      packageId: (r.package_id as string | null) ?? null,
      packageSlug: pkg?.slug ?? null,
      memberCount,
      createdAt: String(r.created_at),
    }
  })
  return { groups }
}

/** Add any user (by username) to a trip group chat. Allowed for any staff role. */
export async function adminAddUserToTripChat(roomId: string, username: string) {
  const { user } = await requireStaff()
  const handle = username.trim().replace(/^@/, '')
  if (!handle) return { error: 'Enter a username' }

  const svc = createServiceRoleClient()
  const { data: room } = await svc.from('chat_rooms').select('id, type').eq('id', roomId).eq('type', 'trip').maybeSingle()
  if (!room) return { error: 'Trip group not found' }

  const { data: target } = await svc.from('profiles').select('id, username').ilike('username', handle).maybeSingle()
  if (!target) return { error: `User @${handle} not found` }

  const { error } = await svc
    .from('chat_room_members')
    .upsert({ room_id: roomId, user_id: target.id }, { onConflict: 'room_id,user_id' })
  if (error) return { error: error.message }

  await logAuditEvent(user.id, 'add_user_to_trip_chat', 'chat_room', roomId, { username: target.username })
  return { success: true, username: target.username }
}
