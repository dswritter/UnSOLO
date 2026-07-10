'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getActionAuth } from '@/lib/auth/action-auth'
import { adminUpdateBookingPriceTier } from '@/actions/booking'

const STAFF_ROLES = ['admin', 'super_admin', 'social_media_manager', 'field_person', 'chat_responder']

type TravellerInput = { name: string; age?: number | null; gender?: string | null }

type ActorInfo = {
  booking: {
    id: string
    user_id: string
    status: string
    guests: number | null
    quantity: number | null
    package_id: string | null
    package: { title?: string | null; host_id?: string | null } | null
    service_listing: { title?: string | null; host_id?: string | null } | null
  }
  isStaff: boolean
  isOwner: boolean
  isHost: boolean
}

async function resolveActor(
  svc: ReturnType<typeof createServiceRoleClient>,
  bookingId: string,
  userId: string,
): Promise<ActorInfo | { error: string }> {
  const { data: booking } = await svc
    .from('bookings')
    .select('id, user_id, status, guests, quantity, package_id, package:packages(title, host_id), service_listing:service_listings(title, host_id)')
    .eq('id', bookingId)
    .single()
  if (!booking) return { error: 'Booking not found' }

  const { data: profile } = await svc.from('profiles').select('role').eq('id', userId).single()
  const isStaff = !!profile && STAFF_ROLES.includes(profile.role)
  const hostId =
    ((booking.package as { host_id?: string | null } | null)?.host_id) ??
    ((booking.service_listing as { host_id?: string | null } | null)?.host_id) ??
    null
  return {
    booking: booking as ActorInfo['booking'],
    isStaff,
    isOwner: booking.user_id === userId,
    isHost: !!hostId && hostId === userId,
  }
}

function bookingTitle(b: ActorInfo['booking']): string {
  return b.package?.title || b.service_listing?.title || 'your booking'
}

async function notifyHost(
  svc: ReturnType<typeof createServiceRoleClient>,
  b: ActorInfo['booking'],
  body: string,
) {
  const hostId = b.package?.host_id ?? b.service_listing?.host_id ?? null
  if (!hostId) return
  await svc.from('notifications').insert({
    user_id: hostId,
    type: 'booking',
    title: 'Change requested on a booking',
    body,
    link: '/host',
  })
}

/** Traveller submits corrected names/ages/genders for their confirmed booking. */
export async function requestTravellerEdit(bookingId: string, travellers: TravellerInput[], note?: string) {
  const { user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }
  const svc = createServiceRoleClient()
  const actor = await resolveActor(svc, bookingId, user.id)
  if ('error' in actor) return { error: actor.error }
  if (!actor.isOwner) return { error: 'Only the person who booked can request a change.' }
  if (actor.booking.status !== 'confirmed') return { error: 'Only confirmed bookings can be changed.' }

  const expected = actor.booking.guests || actor.booking.quantity || 1
  const cleaned = travellers
    .map((t) => ({
      name: (t.name || '').trim(),
      age: t.age == null || Number.isNaN(Number(t.age)) ? null : Number(t.age),
      gender: t.gender ? String(t.gender).toLowerCase() : null,
    }))
    .filter((t) => t.name)
  if (cleaned.length !== expected) {
    return { error: `Please provide details for all ${expected} traveller${expected === 1 ? '' : 's'}.` }
  }

  const { error } = await svc.from('booking_change_requests').insert({
    booking_id: bookingId,
    kind: 'travellers',
    payload: { travellers: cleaned },
    note: note?.trim() || null,
    requested_by: user.id,
  })
  if (error) return { error: error.message }

  await notifyHost(svc, actor.booking, `Traveller details change requested for "${bookingTitle(actor.booking)}".`)
  revalidatePath('/bookings')
  return { success: true }
}

/** Traveller requests the whole booking move to another price tier. */
export async function requestTierChange(bookingId: string, variantIndex: number, note?: string) {
  const { user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }
  if (!Number.isInteger(variantIndex) || variantIndex < 0) return { error: 'Invalid price tier.' }
  const svc = createServiceRoleClient()
  const actor = await resolveActor(svc, bookingId, user.id)
  if ('error' in actor) return { error: actor.error }
  if (!actor.isOwner) return { error: 'Only the person who booked can request a change.' }
  if (actor.booking.status !== 'confirmed') return { error: 'Only confirmed bookings can be changed.' }

  const { error } = await svc.from('booking_change_requests').insert({
    booking_id: bookingId,
    kind: 'tier',
    payload: { variantIndex },
    note: note?.trim() || null,
    requested_by: user.id,
  })
  if (error) return { error: error.message }

  await notifyHost(svc, actor.booking, `A price-tier change was requested for "${bookingTitle(actor.booking)}".`)
  revalidatePath('/bookings')
  return { success: true }
}

/** Host/staff approves (applies) or denies a pending change request. */
export async function processBookingChangeRequest(requestId: string, approve: boolean, adminNote?: string) {
  const { user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }
  const svc = createServiceRoleClient()

  const { data: req } = await svc.from('booking_change_requests').select('*').eq('id', requestId).single()
  if (!req) return { error: 'Request not found' }
  if (req.status !== 'requested') return { error: 'This request has already been processed.' }

  const actor = await resolveActor(svc, req.booking_id, user.id)
  if ('error' in actor) return { error: actor.error }
  if (!actor.isStaff && !actor.isHost) return { error: 'Unauthorized' }

  if (!approve) {
    const { error } = await svc
      .from('booking_change_requests')
      .update({ status: 'denied', admin_note: adminNote?.trim() || null, processed_by: user.id, processed_at: new Date().toISOString() })
      .eq('id', requestId)
      .eq('status', 'requested')
    if (error) return { error: error.message }
    await svc.from('notifications').insert({
      user_id: actor.booking.user_id,
      type: 'booking',
      title: 'Change request declined',
      body: `Your requested change to "${bookingTitle(actor.booking)}" was declined${adminNote?.trim() ? `: ${adminNote.trim()}` : '.'}`,
      link: '/bookings',
    })
    try {
      const { logAuditEvent } = await import('@/actions/admin')
      await logAuditEvent(user.id, 'CHANGE_REQUEST_DENIED', 'booking', req.booking_id, { requestId, kind: req.kind })
    } catch { /* non-critical */ }
    revalidatePath('/bookings'); revalidatePath('/admin/bookings'); revalidatePath('/host')
    return { success: true }
  }

  // Apply
  if (req.kind === 'travellers') {
    const travellers = (req.payload as { travellers?: TravellerInput[] })?.travellers
    if (!Array.isArray(travellers) || travellers.length === 0) return { error: 'This request has no traveller details.' }
    const expected = actor.booking.guests || actor.booking.quantity || 1
    if (travellers.length !== expected) return { error: 'Traveller count no longer matches the booking.' }
    const { error } = await svc.from('bookings').update({ traveller_details: travellers, updated_at: new Date().toISOString() }).eq('id', req.booking_id)
    if (error) return { error: error.message }
  } else if (req.kind === 'tier') {
    const variantIndex = (req.payload as { variantIndex?: number })?.variantIndex
    if (typeof variantIndex !== 'number') return { error: 'This request has no target tier.' }
    // Reuses the shared re-tier path (staff- or host-authorised): recomputes
    // gross/coupon/total and notifies the booker, including any overpayment.
    const res = await adminUpdateBookingPriceTier(req.booking_id, variantIndex)
    if ('error' in res) return { error: res.error }
  }

  const { error: stErr } = await svc
    .from('booking_change_requests')
    .update({ status: 'approved', admin_note: adminNote?.trim() || null, processed_by: user.id, processed_at: new Date().toISOString() })
    .eq('id', requestId)
    .eq('status', 'requested')
  if (stErr) return { error: stErr.message }

  // The tier path already notifies the booker about totals; only the traveller
  // path needs its own confirmation here.
  if (req.kind === 'travellers') {
    await svc.from('notifications').insert({
      user_id: actor.booking.user_id,
      type: 'booking',
      title: 'Traveller details updated',
      body: `Your traveller details for "${bookingTitle(actor.booking)}" were updated.`,
      link: '/bookings',
    })
  }

  try {
    const { logAuditEvent } = await import('@/actions/admin')
    await logAuditEvent(user.id, 'CHANGE_REQUEST_APPROVED', 'booking', req.booking_id, { requestId, kind: req.kind })
  } catch { /* non-critical */ }

  revalidatePath('/bookings'); revalidatePath('/admin/bookings'); revalidatePath('/host')
  return { success: true }
}
