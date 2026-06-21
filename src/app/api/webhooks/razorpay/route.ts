import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import crypto from 'crypto'
import { createServiceClient } from '@/lib/supabase/server'
import { completeBookingFromWebhook } from '@/actions/booking'
import { removeUserFromPackageTripChat } from '@/lib/chat/tripChatMembership'

export async function POST(request: Request) {
  const body = await request.text()
  const headersList = await headers()
  const signature = headersList.get('x-razorpay-signature')

  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 })
  }

  // Verify webhook signature
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!)
    .update(body)
    .digest('hex')

  if (expectedSignature !== signature) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const event = JSON.parse(body)
  const supabase = await createServiceClient()

  // Idempotency: skip if we've already processed this webhook.
  const eventId = (event.id as string) || `${event.event}:${event.created_at}:${JSON.stringify(event.payload).slice(0, 64)}`
  const { error: dupErr } = await supabase
    .from('razorpay_webhook_events')
    .insert({ id: eventId, event_type: event.event, payload: event })
  if (dupErr && dupErr.code === '23505') {
    return NextResponse.json({ received: true, deduped: true })
  }

  // RazorpayX payout events — update host_earnings rows we released.
  if (
    event.event === 'payout.processed' ||
    event.event === 'payout.failed' ||
    event.event === 'payout.reversed'
  ) {
    const payout = event.payload.payout.entity as {
      id: string
      status: string
      utr?: string | null
      failure_reason?: string | null
      amount: number
    }

    const { data: earning } = await supabase
      .from('host_earnings')
      .select('id, host_id, host_paise, released_paise')
      .eq('razorpay_payout_id', payout.id)
      .maybeSingle()

    if (earning) {
      const releasedPaise = (earning.released_paise as number) || 0
      const hostPaise = earning.host_paise as number

      const patch: Record<string, unknown> = { payout_reference: payout.id }

      if (event.event === 'payout.processed') {
        patch.payout_status = releasedPaise >= hostPaise ? 'completed' : 'processed'
        patch.payout_date = new Date().toISOString()
        if (payout.utr) patch.payout_reference = payout.utr
      } else if (event.event === 'payout.failed') {
        patch.payout_status = 'failed'
        patch.failure_reason = payout.failure_reason || 'Payout failed'
        // Reverse the optimistic released counter and drop the dead payout id so the
        // earning shows as unpaid and the admin can cleanly re-release it. (H5)
        patch.released_paise = Math.max(0, releasedPaise - payout.amount)
        patch.razorpay_payout_id = null
      } else if (event.event === 'payout.reversed') {
        patch.payout_status = 'reversed'
        patch.failure_reason = payout.failure_reason || 'Payout reversed'
        patch.released_paise = Math.max(0, releasedPaise - payout.amount)
        patch.razorpay_payout_id = null
      }

      await supabase.from('host_earnings').update(patch).eq('id', earning.id)

      const amountLabel = '₹' + (payout.amount / 100).toLocaleString('en-IN')
      if (event.event === 'payout.processed') {
        await supabase.from('notifications').insert({
          user_id: earning.host_id,
          type: 'split_payment',
          title: 'Payout Received!',
          body: `Your payout of ${amountLabel} has been processed.${payout.utr ? ` UTR: ${payout.utr}` : ''}`,
          link: '/host',
        })
      } else {
        const { data: admins } = await supabase.from('profiles').select('id').in('role', ['admin'])
        for (const admin of admins || []) {
          await supabase.from('notifications').insert({
            user_id: admin.id,
            type: 'booking',
            title: event.event === 'payout.failed' ? 'Host Payout Failed' : 'Host Payout Reversed',
            body: `RazorpayX ${event.event.replace('payout.', '')} for ${amountLabel}. ${payout.failure_reason || ''}`.trim(),
            link: '/admin/community-trips',
          })
        }
      }
    }

    return NextResponse.json({ received: true })
  }

  if (event.event === 'payment.captured') {
    const payment = event.payload.payment.entity
    const orderId = payment.order_id

    // Idempotent fallback: credit the deposit, confirm the booking, and run the
    // post-payment effects (host earnings, receipt, etc.). If the client-side
    // confirmPayment already ran, the shared apply step short-circuits, so this is
    // safe to call unconditionally. Handles both initial and balance orders.
    try {
      await completeBookingFromWebhook(orderId, payment.id, Number(payment.amount) || 0)
    } catch (err) {
      console.error('completeBookingFromWebhook failed', err)
    }

    return NextResponse.json({ received: true })
  }

  if (event.event === 'payment.failed') {
    const payment = event.payload.payment.entity
    const orderId = payment.order_id

    // Find and cancel the booking
    const { data: failedBooking } = await supabase
      .from('bookings')
      .select('id, user_id, package_id, package:packages(title)')
      .eq('stripe_session_id', orderId)
      .single()

    await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('stripe_session_id', orderId)

    if (failedBooking?.user_id && failedBooking.package_id) {
      await removeUserFromPackageTripChat(supabase, failedBooking.user_id, failedBooking.package_id)
    }

    // Notify customer about failed payment
    if (failedBooking) {
      const pkgTitle = (failedBooking.package as unknown as { title: string })?.title || 'your trip'
      await supabase.from('notifications').insert({
        user_id: failedBooking.user_id,
        type: 'booking',
        title: 'Payment Failed',
        body: `Your payment for ${pkgTitle} failed. Please try booking again.`,
        link: '/?search=1',
      })
    }
  }

  // Refund settled (processed or failed). Route by the refund's OWN id so a
  // partial-cancellation refund updates only that partial record — it must NOT
  // cancel the whole booking the way a full-cancellation refund does. Falls back to
  // matching the booking by payment id for legacy refunds with no stored refund id.
  if (event.event === 'refund.processed' || event.event === 'refund.failed') {
    const refund = event.payload.refund.entity as { id: string; payment_id: string; amount: number }
    const refundId = refund.id
    const paymentId = refund.payment_id
    const actualPaise = Number(refund.amount) || 0
    const isProcessed = event.event === 'refund.processed'
    const now = new Date().toISOString()

    const notifyAdmins = async (title: string, body: string) => {
      const { data: admins } = await supabase.from('profiles').select('id').in('role', ['admin'])
      for (const admin of admins || []) {
        await supabase.from('notifications').insert({ user_id: admin.id, type: 'booking', title, body, link: '/admin/bookings' })
      }
    }

    // 1) Partial-cancellation refund (matched by the refund's own id).
    const { data: pc } = await supabase
      .from('booking_partial_cancellations')
      .select('*')
      .eq('refund_razorpay_id', refundId)
      .maybeSingle()

    if (pc) {
      const pcWasCompleted = pc.refund_status === 'completed'
      await supabase
        .from('booking_partial_cancellations')
        .update({ refund_status: isProcessed ? 'completed' : 'failed' })
        .eq('id', pc.id)
      if (isProcessed) {
        // Best-effort (column from migration 091) — never blocks the status update.
        await supabase.from('booking_partial_cancellations').update({ refund_completed_paise: actualPaise }).eq('id', pc.id)
      }
      const { data: pcBooking } = await supabase
        .from('bookings')
        .select('user_id, package:packages(title)')
        .eq('id', pc.booking_id)
        .maybeSingle()
      const pcTitle = (pcBooking?.package as unknown as { title: string })?.title || 'your trip'
      if (pcBooking?.user_id) {
        await supabase.from('notifications').insert({
          user_id: pcBooking.user_id,
          type: 'booking',
          title: isProcessed ? 'Refund Completed' : 'Refund Failed',
          body: isProcessed
            ? `Your partial refund for ${pcTitle} has been processed. It will reflect in your account within 5-7 business days.`
            : `A partial refund for ${pcTitle} could not be processed. Our team will follow up.`,
          link: '/bookings',
        })
      }
      if (!isProcessed) await notifyAdmins('Partial Refund Failed!', `Razorpay partial refund failed for ${pcTitle}. Manual intervention needed.`)
      else if (actualPaise < (pc.refund_amount_paise || 0)) {
        await notifyAdmins('Partial Refund Short', `Razorpay refunded ₹${(actualPaise / 100).toLocaleString('en-IN')} for ${pcTitle}, less than the ₹${((pc.refund_amount_paise || 0) / 100).toLocaleString('en-IN')} requested. Check and top up manually if needed.`)
      }
      // Auto-send the refund receipt (once) now that it's confirmed credited.
      if (isProcessed && !pcWasCompleted && !pc.refund_email_sent_at && pcBooking?.user_id) {
        const travellers = Array.isArray(pc.travellers) ? (pc.travellers as Array<{ name?: string }>) : []
        const travellersLabel = travellers.map((t) => t?.name).filter(Boolean).join(', ') || undefined
        const { sendRefundReceiptAndRecord } = await import('@/lib/email/refundReceipt')
        await sendRefundReceiptAndRecord(supabase, {
          table: 'booking_partial_cancellations',
          id: pc.id,
          userId: pcBooking.user_id,
          tripTitle: pcTitle,
          netRefundPaise: actualPaise,
          partial: true,
          travellersLabel,
        })
      }
      return NextResponse.json({ received: true })
    }

    // 2) Full-cancellation refund — prefer the refund id, fall back to payment id.
    // select('*') keeps deposit_paise / refund_email_sent_at resilient if their
    // migrations aren't applied yet.
    let booking = (
      await supabase
        .from('bookings')
        .select('*, package:packages(title)')
        .eq('refund_razorpay_id', refundId)
        .maybeSingle()
    ).data
    if (!booking) {
      // Payment-id fallback (legacy cancellation refunds with no stored refund id).
      // Only treat it as a cancellation refund when the booking is actually in a
      // cancellation state — otherwise this is an overpayment / non-cancellation
      // refund against the same payment and must NOT cancel the booking.
      const cand = (
        await supabase
          .from('bookings')
          .select('*, package:packages(title)')
          .eq('stripe_payment_intent', paymentId)
          .maybeSingle()
      ).data
      const inCancelState = !!cand && (
        cand.status === 'cancelled' ||
        ['approved', 'self_service', 'requested'].includes(cand.cancellation_status as string) ||
        ['pending', 'processing'].includes(cand.refund_status as string)
      )
      if (inCancelState) booking = cand
    }

    if (booking) {
      const pkgTitle = (booking.package as unknown as { title: string })?.title || 'your trip'
      const wasCompleted = booking.refund_status === 'completed'
      if (isProcessed) {
        await supabase
          .from('bookings')
          .update({ refund_status: 'completed', status: 'cancelled', updated_at: now })
          .eq('id', booking.id)
        await supabase.from('bookings').update({ refund_completed_paise: actualPaise }).eq('id', booking.id) // best-effort (091)
        if (booking.user_id && booking.package_id) {
          await removeUserFromPackageTripChat(supabase, booking.user_id, booking.package_id)
        }
        if (booking.user_id) {
          await supabase.from('notifications').insert({
            user_id: booking.user_id,
            type: 'booking',
            title: 'Refund Completed',
            body: `Your refund for ${pkgTitle} has been processed. It will reflect in your account within 5-7 business days.`,
            link: '/bookings',
          })
        }
        await notifyAdmins('Refund Processed', `Razorpay processed refund for ${pkgTitle} (₹${(actualPaise / 100).toLocaleString('en-IN')})`)
        if (actualPaise < (booking.refund_amount_paise || 0)) {
          await notifyAdmins('Refund Short', `Razorpay refunded ₹${(actualPaise / 100).toLocaleString('en-IN')} for ${pkgTitle}, less than the ₹${((booking.refund_amount_paise || 0) / 100).toLocaleString('en-IN')} requested. Check and top up manually if needed.`)
        }
        // Auto-send the refund receipt (once) now that it's confirmed credited.
        if (!wasCompleted && !booking.refund_email_sent_at && booking.user_id) {
          const { sendRefundReceiptAndRecord } = await import('@/lib/email/refundReceipt')
          await sendRefundReceiptAndRecord(supabase, {
            table: 'bookings',
            id: booking.id,
            userId: booking.user_id,
            tripTitle: pkgTitle,
            netRefundPaise: actualPaise,
            amountPaidPaise: typeof booking.deposit_paise === 'number' ? booking.deposit_paise : undefined,
          })
        }
      } else {
        await supabase.from('bookings').update({ refund_status: 'failed', updated_at: now }).eq('id', booking.id)
        await notifyAdmins('Refund Failed!', `Razorpay refund failed for ${pkgTitle}. Manual intervention needed.`)
      }
    }

    return NextResponse.json({ received: true })
  }

  return NextResponse.json({ received: true })
}
