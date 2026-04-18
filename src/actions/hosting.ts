'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { PLATFORM_FEE_PERCENT, JOIN_PAYMENT_DEADLINE_HOURS } from '@/lib/constants'
import {
  minPricePaiseFromVariants,
  type PriceVariant,
} from '@/lib/package-pricing'

// ── Host trip management ────────────────────────────────────

export async function toggleHostTripActive(tripId: string) {
  const { supabase, user } = await requireHost()

  const { data: trip } = await supabase
    .from('packages')
    .select('is_active, host_id')
    .eq('id', tripId)
    .eq('host_id', user.id)
    .single()

  if (!trip) return { error: 'Trip not found' }

  const { error } = await supabase
    .from('packages')
    .update({ is_active: !trip.is_active })
    .eq('id', tripId)
    .eq('host_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/host')
  return { success: true, is_active: !trip.is_active }
}

// ── Helpers ─────────────────────────────────────────────────

async function requireHost() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_host, is_phone_verified, is_email_verified')
    .eq('id', user.id)
    .single()
  if (!profile?.is_host) throw new Error('Host verification required')
  return { supabase, user }
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60) + '-' + Date.now().toString(36)
}

// ── Trip Creation ───────────────────────────────────────────

export async function createHostedTrip(formData: {
  title: string
  destination_id: string
  description: string
  short_description?: string
  price_paise: number
  price_variants?: PriceVariant[] | null
  /** Max inclusive calendar span across all dep/return pairs (bookings, filters). */
  duration_days: number
  trip_days: number
  trip_nights: number
  exclude_first_day_travel: boolean
  departure_time: 'morning' | 'evening'
  return_time: 'morning' | 'evening'
  departure_dates: string[]
  return_dates: string[]
  max_group_size: number
  difficulty: string
  includes: string[]
  images: string[]
  join_preferences: {
    min_age?: number
    max_age?: number
    gender_preference?: 'men' | 'women' | 'all'
    min_trips_completed?: number
    interest_tags?: string[]
  }
}) {
  const { supabase, user } = await requireHost()

  const slug = generateSlug(formData.title)

  const tiers = formData.price_variants?.length ? formData.price_variants : null
  const price_paise = tiers?.length ? minPricePaiseFromVariants(tiers) : formData.price_paise

  const { data: trip, error } = await supabase
    .from('packages')
    .insert({
      title: formData.title,
      slug,
      destination_id: formData.destination_id,
      description: formData.description,
      short_description: formData.short_description || '',
      price_paise,
      price_variants: tiers,
      duration_days: formData.duration_days,
      trip_days: formData.trip_days,
      trip_nights: formData.trip_nights,
      exclude_first_day_travel: formData.exclude_first_day_travel,
      departure_time: formData.departure_time,
      return_time: formData.return_time,
      departure_dates: formData.departure_dates,
      return_dates: formData.return_dates,
      max_group_size: formData.max_group_size,
      difficulty: formData.difficulty,
      includes: formData.includes,
      images: formData.images,
      host_id: user.id,
      moderation_status: 'pending',
      is_active: false, // Activated after admin approval
      join_preferences: formData.join_preferences,
    })
    .select('slug')
    .single()

  if (error) return { error: error.message }

  // Notify admins about new community trip for moderation
  const { createClient: createSC } = await import('@supabase/supabase-js')
  const svcSupabase = createSC(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: host } = await supabase.from('profiles').select('full_name, username').eq('id', user.id).single()
  const hostName = host?.full_name || host?.username || 'A host'

  const { data: admins } = await svcSupabase.from('profiles').select('id').in('role', ['admin'])
  for (const admin of admins || []) {
    await svcSupabase.from('notifications').insert({
      user_id: admin.id,
      type: 'booking',
      title: 'New Community Trip for Review',
      body: `${hostName} submitted "${formData.title}" for moderation.`,
      link: '/admin/community-trips',
    })
  }

  revalidatePath('/host')
  revalidatePath('/explore')
  return { success: true, slug: trip?.slug }
}

export async function updateHostedTrip(tripId: string, updates: Record<string, unknown>) {
  const { supabase, user } = await requireHost()

  // Verify ownership
  const { data: trip } = await supabase
    .from('packages')
    .select('host_id, moderation_status, title')
    .eq('id', tripId)
    .single()

  if (!trip || trip.host_id !== user.id) return { error: 'Not your trip' }

  // If trip was approved, edits require re-approval but trip stays visible
  const wasApproved = trip.moderation_status === 'approved'
  if (wasApproved) {
    updates.moderation_status = 'pending'
    // Keep is_active = true so trip stays visible to users during re-review
    // Only first-time creation hides until approved
  }

  const { error } = await supabase
    .from('packages')
    .update(updates)
    .eq('id', tripId)
    .eq('host_id', user.id)

  if (error) return { error: error.message }

  // Notify admins if edit needs re-approval
  if (wasApproved) {
    const { createClient: createSC } = await import('@supabase/supabase-js')
    const svcSupabase = createSC(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data: host } = await supabase.from('profiles').select('full_name, username').eq('id', user.id).single()
    const hostName = host?.full_name || host?.username || 'A host'
    const { data: admins } = await svcSupabase.from('profiles').select('id').in('role', ['admin'])
    for (const admin of admins || []) {
      await svcSupabase.from('notifications').insert({
        user_id: admin.id,
        type: 'booking',
        title: 'Trip Edit Needs Review',
        body: `${hostName} edited "${trip.title}" (was approved). Review changes and re-approve.`,
        link: '/admin/community-trips',
      })
    }
  }

  revalidatePath('/host')
  revalidatePath('/explore')
  return { success: true, needsReapproval: wasApproved }
}

export async function cancelHostedTrip(tripId: string) {
  const { supabase, user } = await requireHost()

  const { data: trip } = await supabase
    .from('packages')
    .select('host_id, title')
    .eq('id', tripId)
    .single()

  if (!trip || trip.host_id !== user.id) return { error: 'Not your trip' }

  // Deactivate the trip
  await supabase.from('packages').update({ is_active: false }).eq('id', tripId)

  // Notify all approved joiners
  const { data: requests } = await supabase
    .from('join_requests')
    .select('user_id')
    .eq('trip_id', tripId)
    .eq('status', 'approved')

  const { createClient: createSC } = await import('@supabase/supabase-js')
  const svcSupabase = createSC(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  for (const req of requests || []) {
    await svcSupabase.from('notifications').insert({
      user_id: req.user_id,
      type: 'booking',
      title: 'Trip Cancelled by Host',
      body: `The host cancelled "${trip.title}". Any payments will be refunded.`,
      link: '/bookings',
    })
  }

  revalidatePath('/host')
  revalidatePath('/explore')
  return { success: true }
}

// ── Host Dashboard ──────────────────────────────────────────

export async function getMyHostedTrips() {
  const { supabase, user } = await requireHost()

  const { data: trips } = await supabase
    .from('packages')
    .select('*, destination:destinations(name, state)')
    .eq('host_id', user.id)
    .order('created_at', { ascending: false })

  // Get request counts per trip
  const result = []
  for (const trip of trips || []) {
    const { count: pendingCount } = await supabase
      .from('join_requests')
      .select('*', { count: 'exact', head: true })
      .eq('trip_id', trip.id)
      .eq('status', 'pending')

    const { count: approvedCount } = await supabase
      .from('join_requests')
      .select('*', { count: 'exact', head: true })
      .eq('trip_id', trip.id)
      .eq('status', 'approved')

    result.push({
      ...trip,
      pending_requests: pendingCount || 0,
      approved_requests: approvedCount || 0,
    })
  }

  return result
}

export async function getHostDashboardStats() {
  const { supabase, user } = await requireHost()

  const { count: totalTrips } = await supabase
    .from('packages')
    .select('*', { count: 'exact', head: true })
    .eq('host_id', user.id)

  const { count: activeTrips } = await supabase
    .from('packages')
    .select('*', { count: 'exact', head: true })
    .eq('host_id', user.id)
    .eq('is_active', true)

  const { count: pendingRequests } = await supabase
    .from('join_requests')
    .select('*, trip:packages!inner(host_id)', { count: 'exact', head: true })
    .eq('trip.host_id', user.id)
    .eq('status', 'pending')

  const { data: earnings } = await supabase
    .from('host_earnings')
    .select('host_paise, payout_status')
    .eq('host_id', user.id)

  const totalEarned = (earnings || []).reduce((sum, e) => sum + e.host_paise, 0)
  const pendingPayout = (earnings || []).filter(e => e.payout_status === 'pending').reduce((sum, e) => sum + e.host_paise, 0)

  return {
    totalTrips: totalTrips || 0,
    activeTrips: activeTrips || 0,
    pendingRequests: pendingRequests || 0,
    totalEarned,
    pendingPayout,
  }
}

// ── Join Requests ───────────────────────────────────────────

export async function requestToJoin(tripId: string, message: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Get the trip
  const { data: trip } = await supabase
    .from('packages')
    .select('*, host:profiles!packages_host_id_fkey(id, full_name, username)')
    .eq('id', tripId)
    .single()

  if (!trip || !trip.host_id) return { error: 'Trip not found' }
  if (!trip.is_active) return { error: 'This trip is no longer available' }
  if (trip.moderation_status !== 'approved') return { error: 'Trip not yet approved' }
  if (trip.host_id === user.id) return { error: 'Cannot join your own trip' }

  // Check if already requested
  const { data: existing } = await supabase
    .from('join_requests')
    .select('id, status')
    .eq('trip_id', tripId)
    .eq('user_id', user.id)
    .single()

  if (existing) {
    if (existing.status === 'pending') return { error: 'You already have a pending request' }
    if (existing.status === 'approved') return { error: 'You are already approved for this trip' }
  }

  // Check join preferences
  const prefs = (trip.join_preferences || {}) as {
    min_age?: number; max_age?: number; gender_preference?: string;
    min_trips_completed?: number; interest_tags?: string[]
  }

  // Get user profile for preference checks
  const { data: profile } = await supabase
    .from('profiles')
    .select('date_of_birth')
    .eq('id', user.id)
    .single()

  // Age check
  if (prefs.min_age || prefs.max_age) {
    if (!profile?.date_of_birth) return { error: 'Please set your date of birth in profile to join this trip' }
    const age = Math.floor((Date.now() - new Date(profile.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    if (prefs.min_age && age < prefs.min_age) return { error: `This trip requires minimum age ${prefs.min_age}` }
    if (prefs.max_age && age > prefs.max_age) return { error: `This trip requires maximum age ${prefs.max_age}` }
  }

  // Min trips check
  if (prefs.min_trips_completed) {
    const { data: score } = await supabase
      .from('leaderboard_scores')
      .select('trips_completed')
      .eq('user_id', user.id)
      .single()
    if ((score?.trips_completed || 0) < prefs.min_trips_completed) {
      return { error: `This trip requires at least ${prefs.min_trips_completed} completed trips` }
    }
  }

  // Insert request
  const { error } = await supabase.from('join_requests').insert({
    trip_id: tripId,
    user_id: user.id,
    message,
    status: 'pending',
  })

  if (error) return { error: error.message }

  // Notify host
  const { data: requester } = await supabase.from('profiles').select('full_name, username').eq('id', user.id).single()
  const requesterName = requester?.full_name || requester?.username || 'Someone'

  const { createClient: createSC } = await import('@supabase/supabase-js')
  const svcSupabase = createSC(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  await svcSupabase.from('notifications').insert({
    user_id: trip.host_id,
    type: 'group_invite',
    title: 'New Join Request!',
    body: `${requesterName} wants to join "${trip.title}"`,
    link: `/host/${tripId}`,
  })

  revalidatePath(`/host/${tripId}`)
  return { success: true }
}

export async function getJoinRequestsForTrip(tripId: string) {
  const { supabase, user } = await requireHost()

  // Verify ownership
  const { data: trip } = await supabase
    .from('packages')
    .select('host_id')
    .eq('id', tripId)
    .single()

  if (!trip || trip.host_id !== user.id) return []

  const { data: requests } = await supabase
    .from('join_requests')
    .select('*, user:profiles(id, username, full_name, avatar_url, bio, location, date_of_birth)')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: false })

  // Get trip counts for each requester
  const result = []
  for (const req of requests || []) {
    const { data: score } = await supabase
      .from('leaderboard_scores')
      .select('trips_completed, total_score')
      .eq('user_id', req.user_id)
      .single()

    result.push({
      ...req,
      trips_completed: score?.trips_completed || 0,
      total_score: score?.total_score || 0,
    })
  }

  return result
}

export async function approveJoinRequest(requestId: string) {
  const { supabase, user } = await requireHost()

  const { data: request } = await supabase
    .from('join_requests')
    .select('*, trip:packages(host_id, title, slug)')
    .eq('id', requestId)
    .single()

  if (!request) return { error: 'Request not found' }
  const trip = request.trip as unknown as { host_id: string; title: string; slug: string }
  if (trip.host_id !== user.id) return { error: 'Not your trip' }

  const deadline = new Date(Date.now() + JOIN_PAYMENT_DEADLINE_HOURS * 60 * 60 * 1000).toISOString()

  await supabase
    .from('join_requests')
    .update({ status: 'approved', payment_deadline: deadline, updated_at: new Date().toISOString() })
    .eq('id', requestId)

  // Notify traveler
  const { createClient: createSC } = await import('@supabase/supabase-js')
  const svcSupabase = createSC(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  await svcSupabase.from('notifications').insert({
    user_id: request.user_id,
    type: 'group_invite',
    title: 'Request Approved!',
    body: `You&apos;ve been approved to join "${trip.title}". Complete payment within ${JOIN_PAYMENT_DEADLINE_HOURS} hours.`,
    link: `/packages/${trip.slug}`,
  })

  revalidatePath(`/host/${request.trip_id}`)
  return { success: true }
}

export async function rejectJoinRequest(requestId: string, reason?: string) {
  const { supabase, user } = await requireHost()

  const { data: request } = await supabase
    .from('join_requests')
    .select('*, trip:packages(host_id, title)')
    .eq('id', requestId)
    .single()

  if (!request) return { error: 'Request not found' }
  const trip = request.trip as unknown as { host_id: string; title: string }
  if (trip.host_id !== user.id) return { error: 'Not your trip' }

  await supabase
    .from('join_requests')
    .update({ status: 'rejected', host_response: reason || null, updated_at: new Date().toISOString() })
    .eq('id', requestId)

  // Notify traveler
  const { createClient: createSC } = await import('@supabase/supabase-js')
  const svcSupabase = createSC(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  await svcSupabase.from('notifications').insert({
    user_id: request.user_id,
    type: 'booking',
    title: 'Join Request Update',
    body: reason
      ? `Your request to join "${trip.title}" was not approved. Reason: ${reason}`
      : `Your request to join "${trip.title}" was not approved.`,
    link: '/explore',
  })

  revalidatePath(`/host/${request.trip_id}`)
  return { success: true }
}

// ── Public Data for Create Form ──────────────────────────────

export async function getDestinationsPublic() {
  const supabase = await createClient()
  const { data } = await supabase.from('destinations').select('id, name, state').order('name')
  return data || []
}

export async function getIncludesOptionsPublic() {
  const supabase = await createClient()
  const { data } = await supabase.from('includes_options').select('id, label').order('label')
  return data || []
}

export async function getHostTripDetail(tripId: string) {
  const { supabase, user } = await requireHost()

  const { data: trip } = await supabase
    .from('packages')
    .select('*, destination:destinations(name, state)')
    .eq('id', tripId)
    .eq('host_id', user.id)
    .single()

  if (!trip) return null
  return trip
}

export async function checkIsHost() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { authenticated: false, isHost: false }
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_host')
    .eq('id', user.id)
    .single()
  return { authenticated: true, isHost: !!profile?.is_host }
}

// ── Earnings ────────────────────────────────────────────────

export async function getHostEarnings() {
  const { supabase, user } = await requireHost()

  const { data } = await supabase
    .from('host_earnings')
    .select('*, booking:bookings(travel_date, package:packages(title))')
    .eq('host_id', user.id)
    .order('created_at', { ascending: false })

  return data || []
}

// ── Resubmit rejected trip for review ────────────────────────
export async function resubmitTrip(tripId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: trip } = await supabase
    .from('packages')
    .select('host_id, moderation_status, title')
    .eq('id', tripId)
    .single()

  if (!trip) return { error: 'Trip not found' }
  if (trip.host_id !== user.id) return { error: 'Not your trip' }
  if (trip.moderation_status !== 'rejected') return { error: 'Only rejected trips can be resubmitted' }

  await supabase
    .from('packages')
    .update({ moderation_status: 'pending' })
    .eq('id', tripId)

  // Notify admins
  const { createClient: createSC } = await import('@supabase/supabase-js')
  const svcSupabase = createSC(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: admins } = await svcSupabase.from('profiles').select('id').in('role', ['admin'])
  for (const admin of admins || []) {
    await svcSupabase.from('notifications').insert({
      user_id: admin.id,
      type: 'booking',
      title: 'Trip Resubmitted for Review',
      body: `Host resubmitted "${trip.title}" after making changes.`,
      link: '/admin/community-trips',
    })
  }

  revalidatePath('/host')
  revalidatePath('/admin/community-trips')
  return { success: true }
}
