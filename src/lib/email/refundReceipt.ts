import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Send the "refund processed" receipt email to the customer and record when it was
 * sent on the row (so admins/hosts can see it went out and we don't double-send).
 * Best-effort: never throws, and the `refund_email_sent_at` write no-ops if that
 * column (migration 093) isn't applied yet.
 */
export async function sendRefundReceiptAndRecord(
  client: SupabaseClient,
  opts: {
    table: 'bookings' | 'booking_partial_cancellations'
    id: string
    userId: string
    tripTitle: string
    netRefundPaise: number
    amountPaidPaise?: number
    partial?: boolean
    travellersLabel?: string
  },
): Promise<boolean> {
  try {
    const { data: prof } = await client
      .from('profiles')
      .select('email, full_name')
      .eq('id', opts.userId)
      .maybeSingle()
    const email = (prof as { email?: string | null } | null)?.email
    if (!email || !email.trim()) return false

    const { sendRefundProcessedEmail } = await import('@/lib/resend/emails')
    const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://unsolo.in'
    await sendRefundProcessedEmail({
      to: email,
      travelerName: (prof as { full_name?: string | null }).full_name || 'there',
      tripTitle: opts.tripTitle,
      netRefundPaise: opts.netRefundPaise,
      amountPaidPaise: opts.amountPaidPaise,
      partial: opts.partial,
      travellersLabel: opts.travellersLabel,
      bookingsUrl: `${site}/bookings`,
    })
    await client.from(opts.table).update({ refund_email_sent_at: new Date().toISOString() }).eq('id', opts.id)
    return true
  } catch {
    return false
  }
}
