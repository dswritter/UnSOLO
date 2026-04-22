'use server'

import { revalidatePath } from 'next/cache'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { APP_URL, JOIN_PAYMENT_DEADLINE_HOURS } from '@/lib/constants'
import {
  minPricePaiseFromVariants,
  type PriceVariant,
} from '@/lib/package-pricing'
import { tripDepartureDateKey } from '@/lib/package-trip-calendar'
import type { JoinPreferences } from '@/types'
import { getEmailFromAuthUser } from '@/lib/auth-email'

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

export async function toggleHostTripDateClosed(
  tripId: string,
  departureDateIso: string,
  closed: boolean,
) {
  const { supabase, user } = await requireHost()
  const dateKey = tripDepartureDateKey(departureDateIso)

  const { data: trip } = await supabase
    .from('packages')
    .select('id, slug, host_id, departure_dates, departure_dates_closed')
    .eq('id', tripId)
    .eq('host_id', user.id)
    .single()

  if (!trip) return { error: 'Trip not found' }

  const depKeys = new Set((trip.departure_dates || []).map(tripDepartureDateKey))
  if (!depKeys.has(dateKey)) return { error: 'That date is not a departure for this trip' }

  const prev = ((trip as { departure_dates_closed?: string[] | null }).departure_dates_closed || [])
    .map(tripDepartureDateKey)
  const set = new Set(prev)
  if (closed) set.add(dateKey)
  else set.delete(dateKey)
  const next = Array.from(set).sort()

  const { createClient: createSC } = await import('@supabase/supabase-js')
  const svcSupabase = createSC(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: updated, error } = await svcSupabase
    .from('packages')
    .update({ departure_dates_closed: next })
    .eq('id', tripId)
    .eq('host_id', user.id)
    .select('departure_dates_closed')
    .single()

  if (error) return { error: error.message }

  const out = (updated?.departure_dates_closed as string[] | null) ?? next

  revalidatePath('/host')
  revalidatePath('/explore')
  revalidatePath(`/packages/${trip.slug}`)
  revalidatePath(`/host/${tripId}`)

  return { success: true, departure_dates_closed: out }
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
  join_preferences: JoinPreferences
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

/** Changes to these columns on an approved trip do not reset moderation (no admin re-approval). */
const HOST_TRIP_OPERATIONAL_FIELDS = new Set([
  'departure_dates',
  'return_dates',
  'duration_days',
  'max_group_size',
  'trip_days',
  'trip_nights',
  'exclude_first_day_travel',
  'departure_time',
  'return_time',
  'departure_dates_closed',
])

function hostTripFieldChanged(prev: unknown, next: unknown): boolean {
  if (prev === next) return false
  if (prev == null && next == null) return false
  if (typeof prev === 'object' || typeof next === 'object') {
    return JSON.stringify(prev ?? null) !== JSON.stringify(next ?? null)
  }
  return prev !== next
}

export async function updateHostedTrip(tripId: string, updates: Record<string, unknown>) {
  const { supabase, user } = await requireHost()

  const { data: current } = await supabase
    .from('packages')
    .select('*')
    .eq('id', tripId)
    .eq('host_id', user.id)
    .single()

  if (!current) return { error: 'Trip not found' }

  const payload: Record<string, unknown> = { ...updates }
  for (const k of [
    'id',
    'slug',
    'host_id',
    'created_at',
    'stripe_price_id',
    'is_featured',
    'is_active',
    'moderation_status',
    'departure_dates_closed',
  ]) {
    delete payload[k]
  }

  if (payload.departure_dates !== undefined) {
    const nextDeps = Array.isArray(payload.departure_dates) ? (payload.departure_dates as string[]) : []
    const depKeySet = new Set(nextDeps.map(tripDepartureDateKey))
    const prevClosed = ((current as { departure_dates_closed?: string[] | null }).departure_dates_closed || [])
      .map(tripDepartureDateKey)
    payload.departure_dates_closed = prevClosed.filter(k => depKeySet.has(k))
  }

  let substantiveChange = false
  for (const key of Object.keys(payload)) {
    const nextVal = payload[key]
    const prevVal = (current as Record<string, unknown>)[key]
    if (!hostTripFieldChanged(prevVal, nextVal)) continue
    if (HOST_TRIP_OPERATIONAL_FIELDS.has(key)) continue
    substantiveChange = true
    break
  }

  const wasApproved = current.moderation_status === 'approved'
  const needsModerationReset = wasApproved && substantiveChange

  if (needsModerationReset) {
    payload.moderation_status = 'pending'
  }

  const { error } = await supabase
    .from('packages')
    .update(payload)
    .eq('id', tripId)
    .eq('host_id', user.id)

  if (error) return { error: error.message }

  if (needsModerationReset) {
    const { createClient: createSC } = await import('@supabase/supabase-js')
    const svcSupabase = createSC(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data: host } = await supabase.from('profiles').select('full_name, username').eq('id', user.id).single()
    const hostName = host?.full_name || host?.username || 'A host'
    const tripTitle = typeof payload.title === 'string' ? payload.title : current.title
    const { data: admins } = await svcSupabase.from('profiles').select('id').in('role', ['admin'])
    for (const admin of admins || []) {
      await svcSupabase.from('notifications').insert({
        user_id: admin.id,
        type: 'booking',
        title: 'Trip Edit Needs Review',
        body: `${hostName} edited "${tripTitle}" (was approved). Review changes and re-approve.`,
        link: '/admin/community-trips',
      })
    }
  }

  revalidatePath('/host')
  revalidatePath('/explore')
  revalidatePath(`/host/${tripId}`)
  revalidatePath(`/packages/${current.slug}`)
  return { success: true, needsReapproval: needsModerationReset }
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

  const todayStr = new Date().toISOString().split('T')[0]
  const closed = new Set(
    ((trip as { departure_dates_closed?: string[] | null }).departure_dates_closed || []).map(tripDepartureDateKey),
  )
  const deps = trip.departure_dates || []
  if (
    deps.length > 0 &&
    !deps.some((d: string) => {
      const k = tripDepartureDateKey(d)
      return k >= todayStr && !closed.has(k)
    })
  ) {
    return { error: 'This trip has no open departure dates at the moment.' }
  }

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

  const { error: updateError } = await supabase
    .from('join_requests')
    .update({ status: 'approved', payment_deadline: deadline, updated_at: new Date().toISOString() })
    .eq('id', requestId)

  if (updateError) {
    console.error('approveJoinRequest update:', updateError.message)
    return { error: updateError.message || 'Could not approve request' }
  }

  const { data: hostProfile } = await supabase
    .from('profiles')
    .select('full_name, username')
    .eq('id', user.id)
    .single()
  const hostName =
    (hostProfile?.full_name && hostProfile.full_name.trim()) ||
    hostProfile?.username?.trim() ||
    'Host'

  // Notify traveler — plain service client so auth.admin.getUserById works reliably
  const serviceClient = createServiceRoleClient()

  await serviceClient.from('notifications').insert({
    user_id: request.user_id,
    type: 'group_invite',
    title: 'Request Approved!',
    body: `${hostName} approved your request to join "${trip.title}". Complete payment within ${JOIN_PAYMENT_DEADLINE_HOURS} hours.`,
    link: `/packages/${trip.slug}`,
  })

  const { data: authTraveler, error: authTravelerError } = await serviceClient.auth.admin.getUserById(
    request.user_id,
  )
  if (authTravelerError) {
    console.error('approveJoinRequest getUserById:', authTravelerError.message)
  }

  const travelerEmail = getEmailFromAuthUser(authTraveler?.user)

  const { data: travelerProfile } = await serviceClient
    .from('profiles')
    .select('full_name, username')
    .eq('id', request.user_id)
    .single()
  const travelerDisplayName =
    (travelerProfile?.full_name && travelerProfile.full_name.trim()) ||
    travelerProfile?.username?.trim() ||
    null

  const base = APP_URL.replace(/\/$/, '')
  const packageUrl = `${base}/packages/${trip.slug}`
  const deadlineDate = new Date(deadline)
  const paymentDeadlineLabel = deadlineDate.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  let emailSent = false
  let emailWarning: string | undefined

  const rawKey = process.env.RESEND_API_KEY
  const hasResendKey =
    rawKey &&
    rawKey
      .trim()
      .replace(/^["']|["']$/g, '')
      .trim()
  if (!hasResendKey) {
    emailWarning = 'RESEND_API_KEY is not set — approval email was not sent.'
    console.warn('approveJoinRequest: RESEND_API_KEY missing')
  } else if (!travelerEmail) {
    emailWarning =
      'Traveler has no email on their account (e.g. phone-only signup). They were notified in the app only.'
    console.warn('approveJoinRequest: no traveler email for user', request.user_id)
  } else {
    try {
      const { sendJoinRequestApprovedEmail } = await import('@/lib/resend/emails')
      await sendJoinRequestApprovedEmail({
        travelerEmail,
        travelerName: travelerDisplayName,
        hostName,
        tripTitle: trip.title,
        packageUrl,
        paymentDeadlineHours: JOIN_PAYMENT_DEADLINE_HOURS,
        paymentDeadlineLabel,
      })
      emailSent = true
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('sendJoinRequestApprovedEmail failed:', err)
      emailWarning = `Email could not be sent: ${msg}`
    }
  }

  revalidatePath(`/host/${request.trip_id}`)
  return { success: true as const, emailSent, emailWarning }
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

/** Traveler withdraws a pending or approved (unpaid) join request; notifies host and staff. */
export async function withdrawJoinRequest(joinRequestId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: jr } = await supabase
    .from('join_requests')
    .select('id, status, trip_id, trip:packages(host_id, title)')
    .eq('id', joinRequestId)
    .eq('user_id', user.id)
    .single()

  if (!jr) return { error: 'Request not found' }
  if (jr.status !== 'pending' && jr.status !== 'approved') {
    return { error: 'This request cannot be withdrawn' }
  }

  const trip = jr.trip as unknown as { host_id: string; title: string }

  await supabase
    .from('bookings')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('package_id', jr.trip_id)
    .eq('status', 'pending')

  const { error } = await supabase
    .from('join_requests')
    .update({ status: 'withdrawn', updated_at: new Date().toISOString() })
    .eq('id', joinRequestId)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  const { data: customerProfile } = await supabase
    .from('profiles')
    .select('full_name, username')
    .eq('id', user.id)
    .single()
  const customerName = customerProfile?.full_name || customerProfile?.username || 'A traveler'

  const { createClient: createSC } = await import('@supabase/supabase-js')
  const svc = createSC(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  await svc.from('notifications').insert({
    user_id: trip.host_id,
    type: 'booking',
    title: 'Join request withdrawn',
    body: `${customerName} withdrew their request to join "${trip.title}".`,
    link: `/host/${jr.trip_id}`,
  })

  const { data: staff } = await svc
    .from('profiles')
    .select('id')
    .in('role', ['admin', 'social_media_manager', 'field_person', 'chat_responder'])

  for (const row of staff || []) {
    await svc.from('notifications').insert({
      user_id: row.id,
      type: 'booking',
      title: 'Join request withdrawn',
      body: `${customerName} withdrew a join request for ${trip.title}.`,
      link: '/admin/bookings',
    })
  }

  revalidatePath('/bookings')
  return { success: true as const }
}

// ── Public Data for Create Form ──────────────────────────────

/** Hosts cannot INSERT destinations via the anon client (RLS). Creates row with service role after host check. */
export async function createHostDestination(name: string, state: string) {
  const { supabase } = await requireHost()
  const trimName = name.trim()
  const trimState = state.trim()
  if (!trimName || !trimState) return { error: 'Destination name and state are required' }

  const { data: existing } = await supabase
    .from('destinations')
    .select('id, name, state')
    .ilike('name', trimName)
    .ilike('state', trimState)
    .maybeSingle()

  if (existing) {
    return { success: true as const, id: existing.id, name: existing.name, state: existing.state }
  }

  const { createClient: createSC } = await import('@supabase/supabase-js')
  const svcSupabase = createSC(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const baseSlug = `${trimName}-${trimState}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 72)

  let slug = baseSlug.length > 0 ? baseSlug : `dest-${Date.now().toString(36)}`

  const tryInsert = (s: string) =>
    svcSupabase
      .from('destinations')
      .insert({
        name: trimName,
        state: trimState,
        country: 'India',
        slug: s,
      })
      .select('id, name, state')
      .single()

  let { data, error } = await tryInsert(slug)
  if (error && (error.code === '23505' || error.message.toLowerCase().includes('unique'))) {
    slug = `${baseSlug.slice(0, 48)}-${Date.now().toString(36)}`.replace(/(^-|-$)/g, '')
    ;({ data, error } = await tryInsert(slug))
  }

  if (error) return { error: error.message }
  return { success: true as const, id: data!.id, name: data!.name, state: data!.state }
}

export async function getDestinationsPublic() {
  const supabase = await createClient()
  const { data } = await supabase.from('destinations').select('*').order('name')
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
