'use server'

import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { UserRole } from '@/types'

// ── Helpers ──────────────────────────────────────────────────

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

async function requireStaff() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const staffRoles: UserRole[] = ['admin', 'social_media_manager', 'field_person', 'chat_responder']
  if (!profile || !staffRoles.includes(profile.role as UserRole)) {
    throw new Error('Unauthorized — staff only')
  }
  return { supabase, user, role: profile.role as UserRole }
}

// ── Dashboard Stats ──────────────────────────────────────────

export async function getAdminDashboardStats() {
  const { supabase } = await requireStaff()

  const [
    { count: totalUsers },
    { count: totalBookings },
    { count: confirmedBookings },
    { count: pendingRequests },
    { count: teamCount },
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('bookings').select('*', { count: 'exact', head: true }),
    supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('status', 'confirmed'),
    supabase.from('custom_date_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('team_members').select('*', { count: 'exact', head: true }).eq('is_active', true),
  ])

  // Revenue from confirmed bookings
  const { data: revenueData } = await supabase
    .from('bookings')
    .select('total_amount_paise')
    .eq('status', 'confirmed')

  const totalRevenue = (revenueData || []).reduce((sum, b) => sum + b.total_amount_paise, 0)

  return {
    totalUsers: totalUsers || 0,
    totalBookings: totalBookings || 0,
    confirmedBookings: confirmedBookings || 0,
    pendingRequests: pendingRequests || 0,
    teamCount: teamCount || 0,
    totalRevenue,
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
    const pkg = booking.package as { title?: string; duration_days?: number; destination?: { name?: string; state?: string } } | null
    const usr = booking.user as { full_name?: string } | null

    await sendBookingConfirmation({
      customerEmail: authUser.user.email,
      customerName: usr?.full_name || 'Traveler',
      packageTitle: pkg?.title || 'Trip',
      destination: pkg?.destination ? `${pkg.destination.name}, ${pkg.destination.state}` : '',
      travelDate: booking.travel_date,
      guests: booking.guests,
      totalAmount: booking.total_amount_paise,
      confirmationCode: booking.confirmation_code || '',
      durationDays: pkg?.duration_days || 0,
    })

    return { success: true }
  } catch (err) {
    console.error('Send confirmation error:', err)
    return { error: 'Failed to send email' }
  }
}

// ── Team Management ──────────────────────────────────────────

export async function getTeamMembers() {
  const { supabase } = await requireAdmin()

  const { data } = await supabase
    .from('team_members')
    .select('*, profile:profiles(*)')
    .order('created_at', { ascending: false })

  return data || []
}

export async function addTeamMember(
  identifier: string, // email or username
  role: UserRole,
  notes?: string,
) {
  const { supabase, user } = await requireAdmin()

  if (role === 'user') return { error: 'Cannot add a "user" role to team' }

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
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

  if (error) return { error: error.message }
  return { success: true }
}

export async function removeTeamMember(teamMemberId: string) {
  const { supabase } = await requireAdmin()

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
  return { success: true }
}

// ── Custom Date Requests Management ──────────────────────────

export async function getAdminCustomRequests(status?: string) {
  const { supabase } = await requireStaff()

  let query = supabase
    .from('custom_date_requests')
    .select('*, user:profiles(*), package:packages(title)')
    .order('created_at', { ascending: false })

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  const { data } = await query
  return data || []
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
  duration_days: number
  max_group_size: number
  difficulty: string
  includes: string[]
  images: string[]
  departure_dates: string[]
  is_featured: boolean
}) {
  const { supabase } = await requireAdmin()

  const { error } = await supabase.from('packages').insert({
    ...formData,
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
    duration_days?: number
    max_group_size?: number
    difficulty?: string
    includes?: string[]
    images?: string[]
    departure_dates?: string[]
    is_featured?: boolean
    is_active?: boolean
  },
) {
  const { supabase } = await requireAdmin()

  const { error } = await supabase
    .from('packages')
    .update(updates)
    .eq('id', packageId)

  if (error) return { error: error.message }
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

export async function createDestination(name: string, state: string, description?: string, imageUrl?: string) {
  const { supabase } = await requireAdmin()

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

  const { error } = await supabase.from('destinations').insert({
    name,
    state,
    country: 'India',
    slug,
    description: description || null,
    image_url: imageUrl || null,
  })

  if (error) return { error: error.message }
  return { success: true }
}

// ── Check admin access ───────────────────────────────────────

export async function checkAdminAccess() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
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
