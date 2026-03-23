import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import crypto from 'crypto'
import { createServiceClient } from '@/lib/supabase/server'
import { generateConfirmationCode } from '@/lib/utils'

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

  if (event.event === 'payment.captured') {
    const payment = event.payload.payment.entity
    const orderId = payment.order_id

    // Check if booking already confirmed (by client-side flow)
    const { data: existing } = await supabase
      .from('bookings')
      .select('status')
      .eq('stripe_session_id', orderId)
      .single()

    if (existing?.status === 'confirmed') {
      // Already handled by client-side confirmPayment
      return NextResponse.json({ received: true })
    }

    // Fallback: confirm booking via webhook
    const confirmationCode = generateConfirmationCode()
    await supabase
      .from('bookings')
      .update({
        status: 'confirmed',
        stripe_payment_intent: payment.id,
        confirmation_code: confirmationCode,
      })
      .eq('stripe_session_id', orderId)

    console.log(`Webhook confirmed booking for order ${orderId}: ${confirmationCode}`)
  }

  if (event.event === 'payment.failed') {
    const payment = event.payload.payment.entity
    await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('stripe_session_id', payment.order_id)
  }

  // Auto-update refund status when Razorpay processes refund
  if (event.event === 'refund.processed') {
    const refund = event.payload.refund.entity
    const paymentId = refund.payment_id

    // Find booking by payment ID
    const { data: booking } = await supabase
      .from('bookings')
      .select('id, user_id, package:packages(title)')
      .eq('stripe_payment_intent', paymentId)
      .single()

    if (booking) {
      // Mark refund as completed
      await supabase
        .from('bookings')
        .update({
          refund_status: 'completed',
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', booking.id)

      const pkgTitle = (booking.package as unknown as { title: string })?.title || 'your trip'

      // Notify customer
      await supabase.from('notifications').insert({
        user_id: booking.user_id,
        type: 'booking',
        title: 'Refund Completed',
        body: `Your refund for ${pkgTitle} has been processed. It will reflect in your account within 5-7 business days.`,
        link: '/bookings',
      })

      // Notify admins
      const { data: admins } = await supabase
        .from('profiles')
        .select('id')
        .in('role', ['admin'])
      for (const admin of admins || []) {
        await supabase.from('notifications').insert({
          user_id: admin.id,
          type: 'booking',
          title: 'Refund Processed',
          body: `Razorpay processed refund for ${pkgTitle} (₹${(refund.amount / 100).toLocaleString('en-IN')})`,
          link: '/admin/bookings',
        })
      }
    }
  }

  return NextResponse.json({ received: true })
}
