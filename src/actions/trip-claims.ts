'use server'

import { revalidatePath } from 'next/cache'
import { getActionAuth } from '@/lib/auth/action-auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { ensureTripChatRoom, addTripChatMember } from '@/lib/chat/tripChatMembership'
import type { TripTravellerClaim, Booking } from '@/types'

const STAFF_ROLES = ['admin', 'super_admin', 'social_media_manager', 'field_person', 'chat_responder']
const BOOKING_SELECT =
  '*, package:packages(*, destination:destinations(*)), service_listings(*), service_listing_item:service_listing_items(name), poc:profiles!bookings_assigned_poc_fkey(full_name, username, phone_number)'

type Svc = ReturnType<typeof createServiceRoleClient>

/** Look up a completed booking for this package by confirmation code (case/whitespace tolerant). */
async function findCompletedBookingByCode(svc: Svc, packageId: string, code: string) {
  const normalized = code.trim().toUpperCase()
  if (!normalized) return null
  const { data } = await svc
    .from('bookings')
    .select('id, user_id, package_id, status, confirmation_code, traveller_details, travel_date')
    .eq('package_id', packageId)
    .eq('status', 'completed')
    .not('confirmation_code', 'is', null)
    .ilike('confirmation_code', normalized)
    .maybeSingle()
  return data
}

/** Mirrors the leaderboard/achievement bump in actions/profile.ts submitReview — run once a review actually goes public. */
async function bumpReviewStatsForUser(svc: Svc, userId: string) {
  const { data: scores } = await svc.from('leaderboard_scores').select('*').eq('user_id', userId).single()
  if (scores) {
    await svc
      .from('leaderboard_scores')
      .update({ reviews_written: (scores.reviews_written || 0) + 1, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
  }
  const { count } = await svc.from('reviews').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'approved')
  if (count && count >= 5) await svc.from('user_achievements').upsert({ user_id: userId, achievement_key: 'reviewer_5' })
  if (count && count >= 10) await svc.from('user_achievements').upsert({ user_id: userId, achievement_key: 'storyteller' })
}

async function notifyTripClaimSubmitted(
  svc: Svc,
  opts: { claimantId: string; claimantName: string; bookerId: string; hostId: string | null; tripTitle: string },
) {
  const recipients = new Map<string, 'booker' | 'host' | 'staff'>()
  if (opts.bookerId && opts.bookerId !== opts.claimantId) recipients.set(opts.bookerId, 'booker')
  if (opts.hostId && opts.hostId !== opts.claimantId && !recipients.has(opts.hostId)) recipients.set(opts.hostId, 'host')

  const { data: admins } = await svc.from('profiles').select('id').eq('role', 'admin')
  const { data: staff } = await svc.from('team_members').select('user_id, role, custom_permissions').eq('is_active', true)
  const staffIds = (staff || [])
    .filter((m) => m.role === 'admin' || (m.role === 'custom' && Array.isArray(m.custom_permissions) && (m.custom_permissions as string[]).includes('trip_claims')))
    .map((m) => m.user_id as string)
  for (const a of admins || []) if (a.id !== opts.claimantId && !recipients.has(a.id)) recipients.set(a.id, 'staff')
  for (const id of staffIds) if (id !== opts.claimantId && !recipients.has(id)) recipients.set(id, 'staff')

  if (recipients.size === 0) return
  const body = `${opts.claimantName} says they were on "${opts.tripTitle}" (booked by someone else) and wants to join — review and approve or deny.`
  await svc.from('notifications').insert(
    [...recipients.entries()].map(([uid, role]) => ({
      user_id: uid,
      type: 'booking' as const,
      title: 'Trip companion wants to join',
      body,
      link: role === 'booker' ? '/bookings' : role === 'host' ? '/host' : '/admin/trip-claims',
    })),
  )
}

/**
 * Find (or resurrect a denied) claim for this booking+claimant, or create a new
 * pending one. Shared by submitTripClaim and submitCompanionReview.
 * `isNewSubmission` is true only when this call actually moved the row into
 * 'pending' (fresh insert or resurrected-from-denied) — false when a pending or
 * approved claim already existed, so callers don't re-notify unnecessarily.
 */
async function findOrCreateClaim(
  svc: Svc,
  booking: { id: string; package_id: string; user_id: string },
  claimantId: string,
  code: string,
  claimedTravellerName: string | undefined,
  linkedReviewId: string | null,
): Promise<{ claim: TripTravellerClaim; isNewSubmission: boolean } | { error: string }> {
  const { data: existing } = await svc
    .from('trip_traveller_claims')
    .select('*')
    .eq('booking_id', booking.id)
    .eq('claimant_id', claimantId)
    .maybeSingle()

  if (existing) {
    if (existing.status !== 'denied') {
      return { claim: existing as TripTravellerClaim, isNewSubmission: false }
    }
    const { data: updated, error } = await svc
      .from('trip_traveller_claims')
      .update({
        status: 'pending',
        confirmation_code_entered: code,
        claimed_traveller_name: claimedTravellerName || existing.claimed_traveller_name,
        resolved_by: null,
        resolved_by_role: null,
        resolved_at: null,
        denial_reason: null,
        linked_review_id: linkedReviewId ?? existing.linked_review_id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select('*')
      .single()
    if (error || !updated) return { error: error?.message || 'Could not resubmit request' }
    return { claim: updated as TripTravellerClaim, isNewSubmission: true }
  }

  const { data: created, error } = await svc
    .from('trip_traveller_claims')
    .insert({
      booking_id: booking.id,
      package_id: booking.package_id,
      claimant_id: claimantId,
      confirmation_code_entered: code,
      claimed_traveller_name: claimedTravellerName || null,
      linked_review_id: linkedReviewId,
    })
    .select('*')
    .single()
  if (error || !created) return { error: error?.message || 'Could not submit request' }
  return { claim: created as TripTravellerClaim, isNewSubmission: true }
}

/**
 * Companion (not the booking's account holder) requests to be recognized as
 * having been on a trip — grants trip-chat access + full booking visibility
 * once approved by the booker, the trip's host, or an admin/staff member.
 * Does not touch guest counts, traveller_details, or any money field.
 */
export async function submitTripClaim(packageId: string, confirmationCode: string, claimedTravellerName?: string) {
  const { user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }
  if (!confirmationCode?.trim()) return { error: 'Enter the booking confirmation code.' }

  const svc = createServiceRoleClient()
  const booking = await findCompletedBookingByCode(svc, packageId, confirmationCode)
  if (!booking) return { error: 'No completed booking for this trip matches that confirmation code.' }
  if (booking.user_id === user.id) return { error: 'This is your own booking — it already appears in My Bookings.' }

  const result = await findOrCreateClaim(svc, booking, user.id, confirmationCode.trim().toUpperCase(), claimedTravellerName, null)
  if ('error' in result) return { error: result.error }
  if (result.claim.status === 'approved') return { success: true as const, alreadyApproved: true }
  if (!result.isNewSubmission) return { success: true as const, alreadyPending: true }

  const { data: pkg } = await svc.from('packages').select('title, host_id').eq('id', packageId).single()
  const { data: claimantProfile } = await svc.from('profiles').select('full_name, username').eq('id', user.id).single()
  const claimantName = claimantProfile?.full_name || claimantProfile?.username || 'Someone'

  await notifyTripClaimSubmitted(svc, {
    claimantId: user.id, claimantName, bookerId: booking.user_id, hostId: pkg?.host_id ?? null, tripTitle: pkg?.title || 'this trip',
  })

  revalidatePath('/bookings'); revalidatePath(`/host/${packageId}`); revalidatePath('/admin/trip-claims')
  return { success: true as const }
}

/**
 * Companion review: requires the booking's confirmation code, which ALSO
 * creates (or attaches to) the trip-claim request — one action does both jobs.
 * If it turns out to be the caller's own booking, submits directly via the
 * normal (instant, no moderation) path. If the caller is already an approved
 * companion on this booking, the review publishes instantly too.
 */
export async function submitCompanionReview(
  packageId: string,
  confirmationCode: string,
  ratingDestination: number,
  ratingExperience: number,
  title: string,
  body: string,
) {
  const { user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }
  if (!confirmationCode?.trim()) return { error: 'Enter the booking confirmation code to verify you were on this trip.' }
  if (ratingDestination < 1 || ratingDestination > 5 || ratingExperience < 1 || ratingExperience > 5) {
    return { error: 'Please rate both categories.' }
  }

  const svc = createServiceRoleClient()
  const booking = await findCompletedBookingByCode(svc, packageId, confirmationCode)
  if (!booking) return { error: 'No completed booking for this trip matches that confirmation code.' }

  if (booking.user_id === user.id) {
    const { submitReview } = await import('./profile')
    return submitReview(booking.id, packageId, ratingDestination, ratingExperience, title, body)
  }

  const { data: existingClaim } = await svc
    .from('trip_traveller_claims')
    .select('status')
    .eq('booking_id', booking.id)
    .eq('claimant_id', user.id)
    .maybeSingle()
  const alreadyApproved = existingClaim?.status === 'approved'

  const { data: existingReview } = await svc
    .from('reviews')
    .select('id, status')
    .eq('booking_id', booking.id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (existingReview && existingReview.status !== 'denied') {
    return { error: existingReview.status === 'pending' ? 'Your review is already awaiting approval.' : 'You have already reviewed this trip.' }
  }

  const avgRating = Math.round((ratingDestination + ratingExperience) / 2)
  const reviewPayload = {
    rating: avgRating,
    rating_destination: ratingDestination,
    rating_experience: ratingExperience,
    title: title || null,
    body: body || null,
    status: alreadyApproved ? 'approved' : 'pending',
    denial_reason: null,
  }

  let reviewId: string
  if (existingReview) {
    const { data: updated, error } = await svc.from('reviews').update(reviewPayload).eq('id', existingReview.id).select('id').single()
    if (error || !updated) return { error: error?.message || 'Could not submit review' }
    reviewId = updated.id
  } else {
    const { data: created, error } = await svc
      .from('reviews')
      .insert({ booking_id: booking.id, user_id: user.id, package_id: packageId, ...reviewPayload })
      .select('id')
      .single()
    if (error || !created) return { error: error?.message || 'Could not submit review' }
    reviewId = created.id
  }

  if (alreadyApproved) {
    await bumpReviewStatsForUser(svc, user.id)
    revalidatePath('/packages')
    return { success: true as const, published: true }
  }

  const claimResult = await findOrCreateClaim(svc, booking, user.id, confirmationCode.trim().toUpperCase(), undefined, reviewId)
  if ('error' in claimResult) return { error: claimResult.error }

  if (claimResult.isNewSubmission) {
    const { data: pkg } = await svc.from('packages').select('title, host_id').eq('id', packageId).single()
    const { data: claimantProfile } = await svc.from('profiles').select('full_name, username').eq('id', user.id).single()
    const claimantName = claimantProfile?.full_name || claimantProfile?.username || 'Someone'
    await notifyTripClaimSubmitted(svc, {
      claimantId: user.id, claimantName, bookerId: booking.user_id, hostId: pkg?.host_id ?? null, tripTitle: pkg?.title || 'this trip',
    })
  }

  revalidatePath('/bookings'); revalidatePath(`/host/${packageId}`); revalidatePath('/admin/trip-claims')
  return { success: true as const, published: false }
}

/**
 * Booker, host, or admin/staff approves or denies a pending trip claim —
 * whoever acts first wins (atomic claim on status='pending' so the other two
 * can't double-process it; their pending lists exclude it the moment it
 * resolves, since those lists only ever query status='pending').
 */
export async function processTripClaim(claimId: string, approve: boolean, note?: string) {
  const { user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }

  const svc = createServiceRoleClient()
  const { data: claim } = await svc.from('trip_traveller_claims').select('*').eq('id', claimId).single()
  if (!claim) return { error: 'Request not found' }
  if (claim.status !== 'pending') return { error: 'This request has already been resolved.' }

  const { data: booking } = await svc.from('bookings').select('id, user_id, package_id').eq('id', claim.booking_id).single()
  if (!booking) return { error: 'Booking not found' }
  const { data: pkg } = await svc.from('packages').select('id, title, host_id').eq('id', claim.package_id).single()

  const { data: profile } = await svc.from('profiles').select('role').eq('id', user.id).single()
  const isStaff = !!profile && STAFF_ROLES.includes(profile.role)
  const isHost = !!pkg?.host_id && pkg.host_id === user.id
  const isBooker = booking.user_id === user.id
  const role: 'admin' | 'host' | 'booker' | null = isStaff ? 'admin' : isHost ? 'host' : isBooker ? 'booker' : null
  if (!role) return { error: 'Only the trip host, the person who booked, or an admin can do this.' }

  const nowIso = new Date().toISOString()
  const { data: claimed } = await svc
    .from('trip_traveller_claims')
    .update({
      status: approve ? 'approved' : 'denied',
      resolved_by: user.id,
      resolved_by_role: role,
      resolved_at: nowIso,
      denial_reason: approve ? null : (note?.trim() || null),
      updated_at: nowIso,
    })
    .eq('id', claimId)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle()
  if (!claimed) return { error: 'This request has already been resolved by someone else.' }

  const tripTitle = pkg?.title || 'this trip'

  if (approve) {
    const roomId = await ensureTripChatRoom(svc, claim.package_id)
    if (roomId) await addTripChatMember(svc, roomId, claim.claimant_id)

    if (claim.linked_review_id) {
      await svc.from('reviews').update({ status: 'approved', denial_reason: null }).eq('id', claim.linked_review_id)
      await bumpReviewStatsForUser(svc, claim.claimant_id)
    }

    await svc.from('notifications').insert({
      user_id: claim.claimant_id,
      type: 'booking',
      title: 'You joined the trip!',
      body: `You've been recognized as a traveller on "${tripTitle}". You can now see the booking details and join the trip chat.${claim.linked_review_id ? ' Your review is now live.' : ''}`,
      link: '/bookings',
    })
  } else {
    if (claim.linked_review_id) {
      await svc.from('reviews').update({ status: 'denied', denial_reason: note?.trim() || null }).eq('id', claim.linked_review_id)
    }
    await svc.from('notifications').insert({
      user_id: claim.claimant_id,
      type: 'booking',
      title: 'Trip request declined',
      body: `Your request to join "${tripTitle}" was declined.${note?.trim() ? ` Reason: ${note.trim()}` : ''} You can try again with the correct confirmation code.`,
      link: '/bookings',
    })
  }

  revalidatePath('/bookings'); revalidatePath(`/host/${claim.package_id}`); revalidatePath('/admin/trip-claims')
  return { success: true }
}

type ClaimWithClaimant = TripTravellerClaim & {
  claimant: { username: string | null; full_name: string | null; avatar_url: string | null } | null
}

/** Pending claims on bookings the current user made — for the "My Bookings" approval section. */
export async function getPendingClaimsForBookingsIOwn(): Promise<ClaimWithClaimant[]> {
  const { user } = await getActionAuth()
  if (!user) return []
  const svc = createServiceRoleClient()
  const { data: myBookings } = await svc.from('bookings').select('id').eq('user_id', user.id)
  const ids = (myBookings || []).map((b) => b.id)
  if (!ids.length) return []
  const { data } = await svc
    .from('trip_traveller_claims')
    .select('*, claimant:profiles!trip_traveller_claims_claimant_id_fkey(username, full_name, avatar_url)')
    .in('booking_id', ids)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  return (data || []) as unknown as ClaimWithClaimant[]
}

/** Pending claims for a specific trip — host (or admin) approval section on the host trip page. */
export async function getPendingClaimsForTrip(tripId: string): Promise<ClaimWithClaimant[]> {
  const { user } = await getActionAuth()
  if (!user) return []
  const svc = createServiceRoleClient()
  const { data: profile } = await svc.from('profiles').select('role').eq('id', user.id).single()
  const isStaff = !!profile && STAFF_ROLES.includes(profile.role)
  const { data: pkg } = await svc.from('packages').select('host_id').eq('id', tripId).single()
  if (!isStaff && pkg?.host_id !== user.id) return []
  const { data } = await svc
    .from('trip_traveller_claims')
    .select('*, claimant:profiles!trip_traveller_claims_claimant_id_fkey(username, full_name, avatar_url)')
    .eq('package_id', tripId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  return (data || []) as unknown as ClaimWithClaimant[]
}

/** All pending claims platform-wide — for the admin moderation page (permission-gated by the caller). */
export async function getAdminPendingTripClaims(): Promise<
  (ClaimWithClaimant & { booking: { confirmation_code: string | null }; package: { title: string; slug: string } | null })[]
> {
  const { user } = await getActionAuth()
  if (!user) return []
  const svc = createServiceRoleClient()
  const { data } = await svc
    .from('trip_traveller_claims')
    .select(
      '*, claimant:profiles!trip_traveller_claims_claimant_id_fkey(username, full_name, avatar_url), booking:bookings(confirmation_code), package:packages(title, slug)',
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  return (data || []) as unknown as (ClaimWithClaimant & { booking: { confirmation_code: string | null }; package: { title: string; slug: string } | null })[]
}

/** Bookings the current user didn't make themselves but has an APPROVED claim on — same visibility as the booker. */
export async function getMyClaimedBookings(): Promise<Booking[]> {
  const { user } = await getActionAuth()
  if (!user) return []
  const svc = createServiceRoleClient()
  const { data: approved } = await svc
    .from('trip_traveller_claims')
    .select('booking_id')
    .eq('claimant_id', user.id)
    .eq('status', 'approved')
  const bookingIds = (approved || []).map((c) => c.booking_id)
  if (!bookingIds.length) return []
  const { data } = await svc.from('bookings').select(BOOKING_SELECT).in('id', bookingIds).order('created_at', { ascending: false })
  return (data || []) as unknown as Booking[]
}
