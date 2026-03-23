'use server'

import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { UserRole } from '@/types'

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

// ── Discount Management ──────────────────────────────────────

export async function getDiscountOffers() {
  const { supabase } = await requireAdmin()
  const { data } = await supabase
    .from('discount_offers')
    .select('*')
    .order('created_at', { ascending: false })
  return data || []
}

export async function createDiscountOffer(formData: FormData) {
  const { supabase, user } = await requireAdmin()

  const name = formData.get('name') as string
  const type = formData.get('type') as string
  const discountPaise = parseInt(formData.get('discountPaise') as string)
  const minTrips = parseInt(formData.get('minTrips') as string) || 0
  const promoCode = (formData.get('promoCode') as string)?.toUpperCase().trim() || null
  const maxUses = formData.get('maxUses') ? parseInt(formData.get('maxUses') as string) : null
  const validUntil = formData.get('validUntil') as string || null

  if (!name || !type || !discountPaise || discountPaise <= 0) {
    return { error: 'Name, type, and discount amount are required' }
  }

  const { error } = await supabase.from('discount_offers').insert({
    name,
    type,
    discount_paise: discountPaise,
    min_trips: minTrips,
    promo_code: promoCode,
    max_uses: maxUses,
    valid_until: validUntil || null,
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

  if (name) updates.name = name
  if (discountRupees) updates.discount_paise = parseInt(discountRupees) * 100
  if (promoCode) updates.promo_code = promoCode
  if (maxUses) updates.max_uses = parseInt(maxUses)
  if (validUntil) updates.valid_until = validUntil

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
export async function validatePromoCode(code: string) {
  const supabase = (await import('@/lib/supabase/server')).createClient
  const supa = await supabase()

  const { data: offer } = await supa
    .from('discount_offers')
    .select('*')
    .eq('promo_code', code.toUpperCase().trim())
    .eq('is_active', true)
    .single()

  if (!offer) return { error: 'Invalid promo code' }

  // Check max uses
  if (offer.max_uses && offer.used_count >= offer.max_uses) {
    return { error: 'This promo code has expired' }
  }

  // Check validity dates
  const now = new Date()
  if (offer.valid_until && new Date(offer.valid_until) < now) {
    return { error: 'This promo code has expired' }
  }

  return {
    valid: true,
    discountPaise: offer.discount_paise,
    name: offer.name,
    offerId: offer.id,
  }
}
