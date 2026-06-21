'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getActionAuth } from '@/lib/auth/action-auth'

type Traveller = { name?: string; age?: number | string | null; gender?: string | null }

const STAFF_ROLES = ['admin', 'super_admin', 'social_media_manager', 'field_person', 'chat_responder']

type Svc = ReturnType<typeof createServiceRoleClient>

/** Resolve who the caller is relative to a booking: staff, the booker, or the host. */
async function resolveActor(svc: Svc, bookingId: string, userId: string) {
  const { data: booking } = await svc
    .from('bookings')
    .select('*, package:packages(id, title, host_id)')
    .eq('id', bookingId)
    .single()
  if (!booking) return { error: 'Booking not found' as const }

  const { data: profile } = await svc.from('profiles').select('role').eq('id', userId).single()
  const isStaff = !!profile && STAFF_ROLES.includes(profile.role)
  const isOwner = booking.user_id === userId
  const hostId = (booking.package as { host_id?: string | null } | null)?.host_id || null
  const isHost = !!hostId && hostId === userId

  return { booking, isStaff, isOwner, isHost }
}

/** Per-person figures for cancelling `count` travellers from a booking. */
function perPersonFigures(booking: { total_amount_paise: number; deposit_paise?: number | null; guests: number }, count: number) {
  const total = booking.total_amount_paise || 0
  const collected = booking.deposit_paise || 0
  const guests = Math.max(1, booking.guests || 1)
  const perPersonValue = Math.round(total / guests)
  const perPersonCollected = Math.round(collected / guests)
  const cancelledValue = perPersonValue * count
  const collectedForCancelled = Math.min(collected, perPersonCollected * count)
  return { total, collected, guests, perPersonValue, perPersonCollected, cancelledValue, collectedForCancelled }
}

/**
 * Preview the pro-rata refund for cancelling some travellers — does NOT mutate.
 * Default refund = collected share of the cancelled seats × the current refund
 * tier %, capped at what those seats actually paid. Editable by admin/host.
 */
export async function quotePartialRefund(bookingId: string, travellerIndexes: number[]) {
  const { user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }
  const svc = createServiceRoleClient()
  const actor = await resolveActor(svc, bookingId, user.id)
  if ('error' in actor) return { error: actor.error }
  if (!actor.isStaff && !actor.isOwner && !actor.isHost) return { error: 'Unauthorized' }

  const count = travellerIndexes.length
  if (count <= 0) return { error: 'Select at least one traveller.' }
  if (count >= (actor.booking.guests || 1)) {
    return { error: 'You cannot cancel everyone here — use a full booking cancellation instead.' }
  }

  const fig = perPersonFigures(actor.booking, count)

  // Tier % from the existing refund-tier logic (based on days to travel + category).
  let tierPercent = 100
  try {
    const { quoteCancellationRefund } = await import('@/actions/cancellation-refund')
    const q = await quoteCancellationRefund(bookingId)
    if (!('error' in q)) tierPercent = q.tierPercent
  } catch { /* fall back to 100% */ }

  const autoRefundPaise = Math.min(
    fig.collectedForCancelled,
    Math.round(fig.collectedForCancelled * (tierPercent / 100)),
  )

  return {
    guestsCancelled: count,
    perPersonValuePaise: fig.perPersonValue,
    cancelledValuePaise: fig.cancelledValue,
    collectedForCancelledPaise: fig.collectedForCancelled,
    maxRefundPaise: fig.collectedForCancelled,
    tierPercent,
    autoRefundPaise,
  }
}

/**
 * Traveller-initiated request to drop some of their party. Creates a 'requested'
 * record; the booking is untouched until admin/host approve it.
 */
export async function requestPartialCancellation(
  bookingId: string,
  travellerIndexes: number[],
  reason: string,
) {
  const { user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }
  const svc = createServiceRoleClient()
  const actor = await resolveActor(svc, bookingId, user.id)
  if ('error' in actor) return { error: actor.error }
  if (!actor.isOwner) return { error: 'Only the person who booked can request this.' }

  const booking = actor.booking
  if (booking.status !== 'confirmed') {
    return { error: 'Only confirmed bookings can be partially cancelled.' }
  }

  const current: Traveller[] = Array.isArray(booking.traveller_details) ? booking.traveller_details : []
  const count = travellerIndexes.length
  if (count <= 0) return { error: 'Select at least one traveller to cancel.' }
  if (count >= (booking.guests || 1)) {
    return { error: 'You cannot cancel everyone — please request a full cancellation instead.' }
  }

  // Account for other still-pending requests so queued partials can't sum past the
  // party size (each would individually pass the check above).
  const { data: pendingRows } = await svc
    .from('booking_partial_cancellations')
    .select('guests_cancelled')
    .eq('booking_id', bookingId)
    .eq('status', 'requested')
  const alreadyRequested = (pendingRows || []).reduce((n, r) => n + (r.guests_cancelled || 0), 0)
  if (count + alreadyRequested >= (booking.guests || 1)) {
    return { error: 'Combined with your pending request(s) this would cancel everyone — please request a full cancellation instead.' }
  }

  // Snapshot the selected travellers (fall back to a generic label if unnamed).
  const snapshot = travellerIndexes
    .map((i) => current[i])
    .filter(Boolean)
    .map((t, k) => ({ name: t?.name || `Guest ${travellerIndexes[k] + 1}`, age: t?.age ?? null, gender: t?.gender ?? null }))
  const travellers = snapshot.length ? snapshot : travellerIndexes.map((i) => ({ name: `Guest ${i + 1}`, age: null, gender: null }))

  const { data: row, error } = await svc
    .from('booking_partial_cancellations')
    .insert({
      booking_id: bookingId,
      travellers,
      guests_cancelled: count,
      status: 'requested',
      refund_status: 'none',
      reason: reason?.trim() || null,
      requested_by: user.id,
    })
    .select('id')
    .single()
  if (error || !row) return { error: error?.message || 'Could not submit request' }

  // Notify staff + host.
  await notifyPartialRequest(svc, booking, travellers, reason?.trim() || '')

  revalidatePath('/bookings')
  revalidatePath('/admin/bookings')
  return { success: true }
}

async function notifyPartialRequest(
  svc: Svc,
  booking: { package_id?: string | null; user_id: string; package?: unknown },
  travellers: Traveller[],
  reason: string,
) {
  try {
    const pkgTitle = (booking.package as { title?: string } | null)?.title || 'a trip'
    const names = travellers.map((t) => t.name).filter(Boolean).join(', ')
    const reasonLine = reason ? ` Reason: ${reason.slice(0, 160)}` : ''
    const body = `A traveller asked to cancel ${travellers.length} person(s) (${names}) from "${pkgTitle}".${reasonLine}`

    const { data: admins } = await svc.from('profiles').select('id').eq('role', 'admin')
    for (const a of admins || []) {
      await svc.from('notifications').insert({
        user_id: a.id, type: 'booking', title: 'Partial cancellation requested', body, link: '/admin/bookings',
      })
    }
    const hostId = (booking.package as { host_id?: string | null } | null)?.host_id
    if (hostId) {
      await svc.from('notifications').insert({
        user_id: hostId, type: 'booking', title: 'Partial cancellation requested', body, link: '/host',
      })
    }
  } catch { /* non-critical */ }
}

/** Remove the first occurrence of each snapshot traveller from the current list. */
function removeTravellers(current: Traveller[], toRemove: Traveller[]): Traveller[] {
  const remaining = [...current]
  const norm = (s?: string | null) => (s || '').trim().toLowerCase()
  const ageEq = (a: Traveller['age'], b: Traveller['age']) => String(a ?? '') === String(b ?? '')

  for (const r of toRemove) {
    // 1) Exact identity, tolerant of case/whitespace.
    let idx = remaining.findIndex(
      (t) => norm(t?.name) === norm(r?.name) && ageEq(t?.age, r?.age) && norm(t?.gender) === norm(r?.gender),
    )
    // 2) Name-only match (age/gender may have been edited since the snapshot).
    if (idx < 0 && norm(r?.name)) {
      idx = remaining.findIndex((t) => norm(t?.name) === norm(r?.name))
    }
    // 3) No match — the traveller list was edited after this request was made.
    // Drop a trailing traveller but NEVER index 0 (the lead booker). This keeps the
    // seat count correct without silently deleting the organiser or an arbitrary
    // wrong person from the front of the list. (PC11)
    if (idx < 0) {
      idx = remaining.length - 1
      if (idx < 1) continue // only the lead remains — leave it intact
    }
    remaining.splice(idx, 1)
  }
  return remaining
}

/**
 * Admin/host approve or deny a partial cancellation. On approval the booking's
 * guests, traveller_details, total and collected amounts are reduced and the
 * refund is queued (admin/host then initiate it via Razorpay).
 *
 * Accounting: total_amount_paise is reduced proportionally to remaining guests;
 * deposit_paise (the cash-collected figure the dashboard reports as earnings) is
 * reduced by the refunded amount and clamped to the new total. Any forfeited
 * tier penalty on a fully-paid booking is dropped from earnings (conservative).
 */
export async function processPartialCancellation(
  partialId: string,
  approve: boolean,
  refundAmountPaise?: number,
  adminNote?: string,
) {
  const { user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }
  const svc = createServiceRoleClient()

  const { data: pc } = await svc
    .from('booking_partial_cancellations')
    .select('*')
    .eq('id', partialId)
    .single()
  if (!pc) return { error: 'Request not found' }
  if (pc.status !== 'requested') return { error: 'This request has already been processed.' }

  const actor = await resolveActor(svc, pc.booking_id, user.id)
  if ('error' in actor) return { error: actor.error }
  if (!actor.isStaff && !actor.isHost) return { error: 'Only an admin or the host can do this.' }

  if (!approve) {
    await svc
      .from('booking_partial_cancellations')
      .update({ status: 'denied', admin_note: adminNote?.trim() || null, processed_by: user.id, processed_at: new Date().toISOString() })
      .eq('id', partialId)
    await notifyTravellerOutcome(svc, actor.booking, false, 0)
    revalidatePath('/bookings'); revalidatePath('/admin/bookings')
    return { success: true }
  }

  return applyApprovedPartialCancellation(svc, pc, actor.booking, refundAmountPaise, adminNote, user.id)
}

/**
 * Admin/host one-step partial cancellation (no prior traveller request): creates
 * an approved record and applies it immediately.
 */
export async function adminPartialCancel(
  bookingId: string,
  travellerIndexes: number[],
  refundAmountPaise: number,
  adminNote?: string,
) {
  const { user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }
  const svc = createServiceRoleClient()
  const actor = await resolveActor(svc, bookingId, user.id)
  if ('error' in actor) return { error: actor.error }
  if (!actor.isStaff && !actor.isHost) return { error: 'Only an admin or the host can do this.' }

  const booking = actor.booking
  if (booking.status !== 'confirmed') return { error: 'Only confirmed bookings can be partially cancelled.' }
  const current: Traveller[] = Array.isArray(booking.traveller_details) ? booking.traveller_details : []
  const count = travellerIndexes.length
  if (count <= 0) return { error: 'Select at least one traveller.' }
  if (count >= (booking.guests || 1)) return { error: 'You cannot cancel everyone here — use a full cancellation.' }

  const travellers = travellerIndexes
    .map((i) => current[i])
    .map((t, k) => ({ name: t?.name || `Guest ${travellerIndexes[k] + 1}`, age: t?.age ?? null, gender: t?.gender ?? null }))

  const { data: row, error } = await svc
    .from('booking_partial_cancellations')
    .insert({
      booking_id: bookingId,
      travellers,
      guests_cancelled: count,
      status: 'requested',
      refund_status: 'none',
      requested_by: user.id,
    })
    .select('*')
    .single()
  if (error || !row) return { error: error?.message || 'Could not create cancellation' }

  return applyApprovedPartialCancellation(svc, row, booking, refundAmountPaise, adminNote, user.id)
}

type PartialRow = {
  id: string
  booking_id: string
  travellers: Traveller[]
  guests_cancelled: number
}
type BookingRow = {
  id: string
  user_id: string
  status: string
  guests: number
  total_amount_paise: number
  deposit_paise?: number | null
  traveller_details?: Traveller[] | null
  package?: unknown
}

async function applyApprovedPartialCancellation(
  svc: Svc,
  pc: PartialRow,
  booking: BookingRow,
  refundAmountPaise: number | undefined,
  adminNote: string | undefined,
  processedBy: string,
) {
  // Only an active (confirmed) booking can be partially cancelled. This blocks a
  // lingering 'requested' partial from being approved AFTER the whole booking was
  // already cancelled/refunded — which would otherwise reduce it again and issue a
  // second refund (double refund).
  if (booking.status !== 'confirmed') {
    return { error: 'This booking is no longer active — it may already have been cancelled or completed.' }
  }

  const guestsNow = booking.guests || 1
  const count = pc.guests_cancelled
  if (count <= 0) return { error: 'Nothing to cancel.' }
  // Must always leave at least one traveller, and never cancel more seats than
  // currently remain. Because each approval reduces booking.guests, this also caps
  // the TOTAL cancelled across stacked partial cancellations at the party size —
  // a request snapshotted when the party was larger is rejected here, not applied.
  if (count >= guestsNow) {
    return { error: `Only ${guestsNow - 1} of the ${guestsNow} remaining travellers can be partially cancelled — use a full cancellation instead.` }
  }
  const newGuests = guestsNow - count

  const fig = perPersonFigures(booking, count)
  const refund = Math.max(0, Math.min(refundAmountPaise ?? 0, fig.collectedForCancelled))
  const nowIso = new Date().toISOString()

  // Atomically claim the request (requested -> approved) BEFORE touching the
  // booking, so two concurrent approvals — or an approval racing a one-step admin
  // cancel — can't both apply and reduce the booking twice.
  const { data: claimed } = await svc
    .from('booking_partial_cancellations')
    .update({
      status: 'approved',
      refund_amount_paise: refund,
      refund_status: refund > 0 ? 'pending' : 'none',
      admin_note: adminNote?.trim() || null,
      processed_by: processedBy,
      processed_at: nowIso,
    })
    .eq('id', pc.id)
    .eq('status', 'requested')
    .select('id')
    .maybeSingle()
  if (!claimed) return { error: 'This request has already been processed.' }

  const current: Traveller[] = Array.isArray(booking.traveller_details) ? booking.traveller_details : []
  const newTravellers = current.length ? removeTravellers(current, pc.travellers) : current

  // Proportional new total for the remaining guests; collected drops by the refund.
  const newTotal = Math.round((booking.total_amount_paise || 0) * (newGuests / Math.max(1, booking.guests || 1)))
  const newDeposit = Math.max(0, Math.min((booking.deposit_paise || 0) - refund, newTotal))

  const { error: upErr } = await svc
    .from('bookings')
    .update({
      guests: newGuests,
      traveller_details: newTravellers,
      total_amount_paise: newTotal,
      deposit_paise: newDeposit,
      updated_at: nowIso,
    })
    .eq('id', booking.id)
  if (upErr) {
    // Booking update failed after we claimed the request — release the claim so it
    // can be retried rather than being stuck 'approved' with no booking change.
    await svc
      .from('booking_partial_cancellations')
      .update({ status: 'requested', refund_amount_paise: 0, refund_status: 'none', processed_by: null, processed_at: null })
      .eq('id', pc.id)
    return { error: upErr.message }
  }

  // Community trips: the host bears their fee-proportional share of the refund.
  if (refund > 0) {
    try {
      const { data: earning } = await svc
        .from('host_earnings')
        .select('id, host_paise, platform_fee_paise, host_refund_paise, platform_refund_paise')
        .eq('booking_id', booking.id)
        .maybeSingle()
      if (earning) {
        const denom = (earning.host_paise || 0) + (earning.platform_fee_paise || 0)
        const hostShare = denom > 0 ? Math.round(refund * ((earning.host_paise || 0) / denom)) : 0
        const platformShare = refund - hostShare
        await svc
          .from('host_earnings')
          .update({
            host_paise: Math.max(0, (earning.host_paise || 0) - hostShare),
            host_refund_paise: (earning.host_refund_paise || 0) + hostShare,
            platform_refund_paise: (earning.platform_refund_paise || 0) + platformShare,
          })
          .eq('id', earning.id)
      }
    } catch { /* non-critical */ }
  }

  await notifyTravellerOutcome(svc, booking, true, refund)

  revalidatePath('/bookings'); revalidatePath('/admin/bookings')
  return { success: true, refundPaise: refund, newGuests }
}

async function notifyTravellerOutcome(
  svc: Svc,
  booking: { user_id: string; package?: unknown },
  approved: boolean,
  refundPaise: number,
) {
  try {
    const pkgTitle = (booking.package as { title?: string } | null)?.title || 'your trip'
    const body = approved
      ? refundPaise > 0
        ? `Your partial cancellation for "${pkgTitle}" was approved. A refund of ₹${(refundPaise / 100).toLocaleString('en-IN')} is being processed.`
        : `Your partial cancellation for "${pkgTitle}" was approved. No refund applies under the current policy.`
      : `Your partial cancellation request for "${pkgTitle}" was declined. Reach out to us if you have questions.`
    await svc.from('notifications').insert({
      user_id: booking.user_id, type: 'booking', title: approved ? 'Partial cancellation approved' : 'Partial cancellation declined', body, link: '/bookings',
    })
  } catch { /* non-critical */ }
}

/**
 * Refund a total across one or more captured Razorpay payments (token + balance
 * are separate payments, each refundable only up to its own capture). Internal —
 * deliberately not exported as a server action so it can't be invoked directly.
 */
async function refundAcrossPayments(
  payments: Array<{ id: string; amount: number }>,
  totalRefundPaise: number,
  notes: Record<string, string>,
): Promise<{ ok: true; refundIds: string[] } | { ok: false; error: string }> {
  const auth = `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')}`
  const refundIds: string[] = []
  let remaining = totalRefundPaise
  for (const p of payments) {
    if (remaining <= 0) break
    const amount = Math.min(remaining, p.amount || 0)
    if (amount <= 0) continue
    const resp = await fetch(`https://api.razorpay.com/v1/payments/${p.id}/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ amount, notes }),
    })
    const result = (await resp.json()) as { id?: string; error?: { description?: string } }
    if (!resp.ok) return { ok: false, error: result.error?.description || 'Razorpay refund failed' }
    if (result.id) refundIds.push(result.id)
    remaining -= amount
  }
  if (remaining > 0) {
    return { ok: false, error: `Refund exceeds captured payments by ₹${(remaining / 100).toLocaleString('en-IN')}.` }
  }
  return { ok: true, refundIds }
}

/** Initiate a Razorpay refund for an approved partial cancellation. */
export async function initiatePartialRefund(partialId: string) {
  const { user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }
  const svc = createServiceRoleClient()

  const { data: pc } = await svc
    .from('booking_partial_cancellations')
    .select('id, booking_id, refund_amount_paise, refund_status, status')
    .eq('id', partialId)
    .single()
  if (!pc) return { error: 'Request not found' }
  if (pc.status !== 'approved') return { error: 'Approve the cancellation first.' }
  if (!pc.refund_amount_paise || pc.refund_amount_paise <= 0) return { error: 'No refund amount set.' }
  if (pc.refund_status === 'processing' || pc.refund_status === 'completed') {
    return { error: 'Refund already initiated.' }
  }

  const actor = await resolveActor(svc, pc.booking_id, user.id)
  if ('error' in actor) return { error: actor.error }
  if (!actor.isStaff && !actor.isHost) return { error: 'Only an admin or the host can do this.' }

  const paymentsRaw = (actor.booking as { razorpay_payment_ids?: unknown }).razorpay_payment_ids
  const payments = Array.isArray(paymentsRaw) ? (paymentsRaw as Array<{ id: string; amount: number }>) : []
  const paymentId = actor.booking.stripe_payment_intent as string | null
  if (!paymentId && payments.length === 0) {
    // No captured online payment to refund against — mark for manual handling.
    await svc.from('booking_partial_cancellations').update({ refund_status: 'processing' }).eq('id', partialId)
    return { success: true, manual: true }
  }

  try {
    let primaryRefundId: string | null = null
    if (payments.length > 0) {
      // Spread the partial refund across the captured payments (token + balance). (BP3)
      const alloc = await refundAcrossPayments(payments, pc.refund_amount_paise, {
        booking_id: pc.booking_id,
        partial_cancellation_id: partialId,
        reason: 'Partial cancellation refund',
      })
      if (!alloc.ok) return { error: alloc.error }
      primaryRefundId = alloc.refundIds[0] ?? null
    } else {
      const response = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')}`,
        },
        body: JSON.stringify({
          amount: pc.refund_amount_paise,
          notes: { booking_id: pc.booking_id, partial_cancellation_id: partialId, reason: 'Partial cancellation refund' },
        }),
      })
      const result = (await response.json()) as { id?: string; error?: { description?: string } }
      if (!response.ok) return { error: result.error?.description || 'Razorpay refund failed' }
      primaryRefundId = result.id ?? null
    }

    await svc
      .from('booking_partial_cancellations')
      .update({ refund_status: 'processing', refund_razorpay_id: primaryRefundId })
      .eq('id', partialId)

    await svc.from('notifications').insert({
      user_id: actor.booking.user_id, type: 'booking', title: 'Refund initiated',
      body: `A refund of ₹${(pc.refund_amount_paise / 100).toLocaleString('en-IN')} has been initiated. It reaches your account in 5–7 business days.`,
      link: '/bookings',
    })

    revalidatePath('/admin/bookings'); revalidatePath('/bookings')
    return { success: true, refundId: primaryRefundId ?? undefined }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { error: `Refund failed: ${msg}` }
  }
}

/** Mark a partial refund as credited to the customer. */
export async function markPartialRefundComplete(partialId: string) {
  const { user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }
  const svc = createServiceRoleClient()

  // select('*') keeps this resilient to refund_completed_paise (migration 091).
  const { data: pc } = await svc
    .from('booking_partial_cancellations')
    .select('*')
    .eq('id', partialId)
    .single()
  if (!pc) return { error: 'Request not found' }
  if (pc.refund_status === 'completed') return { success: true, alreadyComplete: true }

  const actor = await resolveActor(svc, pc.booking_id, user.id)
  if ('error' in actor) return { error: actor.error }
  if (!actor.isStaff && !actor.isHost) return { error: 'Only an admin or the host can do this.' }

  await svc.from('booking_partial_cancellations').update({ refund_status: 'completed' }).eq('id', partialId)

  const creditedPaise = (pc.refund_completed_paise ?? pc.refund_amount_paise) || 0
  await svc.from('notifications').insert({
    user_id: actor.booking.user_id, type: 'booking', title: 'Refund completed',
    body: `Your refund of ₹${(creditedPaise / 100).toLocaleString('en-IN')} has been credited.`,
    link: '/bookings',
  })

  // Email a refund receipt with breakdown (best-effort).
  try {
    const { data: prof } = await svc.from('profiles').select('email, full_name').eq('id', actor.booking.user_id).maybeSingle()
    if (prof?.email?.trim()) {
      const travellers = Array.isArray(pc.travellers) ? (pc.travellers as Traveller[]) : []
      const travellersLabel = travellers.map((t) => t?.name).filter(Boolean).join(', ') || undefined
      const pkgTitle = (actor.booking.package as { title?: string } | null)?.title || 'your trip'
      const { sendRefundProcessedEmail } = await import('@/lib/resend/emails')
      const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://unsolo.in'
      await sendRefundProcessedEmail({
        to: prof.email,
        travelerName: prof.full_name || 'there',
        tripTitle: pkgTitle,
        netRefundPaise: creditedPaise,
        partial: true,
        travellersLabel,
        bookingsUrl: `${site}/bookings`,
      })
    }
  } catch { /* email optional */ }

  revalidatePath('/admin/bookings'); revalidatePath('/bookings')
  return { success: true }
}
