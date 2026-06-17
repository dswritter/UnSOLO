import { createServiceRoleClient } from '@/lib/supabase/server'
import { ensureTripChatRoom } from '@/lib/chat/tripChatMembership'
import { getSupportWhatsappNumber, resolveWhatsappNumber } from '@/lib/platform-settings'
import { sendBookingConfirmation } from '@/lib/resend/emails'
import { APP_URL } from '@/lib/constants'

/** Contact details shown on a trip receipt: host's WhatsApp for community trips, else UnSOLO support. */
async function resolveTripReceiptContact(
  svc: ReturnType<typeof createServiceRoleClient>,
  pkg: { host_id?: string | null; whatsapp_number?: string | null } | null,
): Promise<{ whatsappNumber: string; whatsappLabel: string }> {
  const support = await getSupportWhatsappNumber()
  if (pkg?.host_id) {
    const { data: host } = await svc.from('profiles').select('phone_number').eq('id', pkg.host_id).single()
    // Prefer the host's own number, then a per-listing override, then platform support.
    const number = resolveWhatsappNumber(host?.phone_number, resolveWhatsappNumber(pkg.whatsapp_number, support))
    return { whatsappNumber: number, whatsappLabel: 'Message your host on WhatsApp' }
  }
  const number = resolveWhatsappNumber(pkg?.whatsapp_number, support)
  return { whatsappNumber: number, whatsappLabel: 'Chat with UnSOLO on WhatsApp' }
}

/**
 * Send the full trip booking receipt to the customer — trip-details link, host
 * & coordinator (POC) contacts, group-chat link, UnSOLO/host WhatsApp, and (for
 * token bookings) a pay-remaining CTA. Self-contained: reads everything by
 * booking id and derives the paid/balance split from the row, so every caller
 * (confirmation pipelines + admin resend) sends the same email.
 *
 * Plain server lib (not a server action) — must not be exposed to clients.
 */
export async function sendTripBookingReceipt(bookingId: string): Promise<void> {
  try {
    const svc = createServiceRoleClient()
    const { data: booking } = await svc
      .from('bookings')
      .select('*, package:packages(*, destination:destinations(*))')
      .eq('id', bookingId)
      .single()
    if (!booking) return
    const pkg = booking.package as {
      title?: string
      slug?: string
      duration_days?: number
      duration_nights?: number
      host_id?: string | null
      whatsapp_number?: string | null
      destination?: { name?: string; state?: string }
    } | null
    if (!pkg) return

    const { data: authUser } = await svc.auth.admin.getUserById(booking.user_id as string)
    const email = authUser?.user?.email?.trim()
    if (!email) return

    const { data: bookerProfile } = await svc
      .from('profiles').select('full_name').eq('id', booking.user_id).single()

    let hostName: string | null = null
    let hostContact: string | null = null
    if (pkg.host_id) {
      const { data: host } = await svc
        .from('profiles').select('full_name, phone_number').eq('id', pkg.host_id).single()
      hostName = host?.full_name ?? null
      hostContact = host?.phone_number ?? null
    }

    let pocName: string | null = null
    let pocContact: string | null = null
    if (booking.assigned_poc) {
      const { data: poc } = await svc
        .from('profiles').select('full_name, phone_number').eq('id', booking.assigned_poc).single()
      pocName = poc?.full_name ?? null
      pocContact = poc?.phone_number ?? null
    }

    const total = booking.total_amount_paise as number
    const paid = (booking.deposit_paise as number | null) ?? total
    const balanceDue = Math.max(0, total - paid)

    const travelDate = (booking.travel_date as string | null) || ''
    const durationDays = pkg.duration_days ?? 1
    const returnDateIso = travelDate
      ? (() => {
          const d = new Date(travelDate + 'T12:00:00')
          d.setDate(d.getDate() + durationDays - 1)
          return d.toISOString().slice(0, 10)
        })()
      : ''
    const durationSummary = [
      pkg.duration_days ? `${pkg.duration_days} day${pkg.duration_days !== 1 ? 's' : ''}` : null,
      pkg.duration_nights ? `${pkg.duration_nights} night${pkg.duration_nights !== 1 ? 's' : ''}` : null,
    ].filter(Boolean).join(' · ')
    const destination = [pkg.destination?.name, pkg.destination?.state].filter(Boolean).join(', ')

    const tripUrl = pkg.slug ? `${APP_URL}/packages/${pkg.slug}` : undefined
    const roomId = await ensureTripChatRoom(svc, booking.package_id as string)
    const tripChatUrl = roomId ? `${APP_URL}/tribe/${roomId}` : `${APP_URL}/bookings`

    const contact = await resolveTripReceiptContact(svc, pkg)
    await sendBookingConfirmation({
      customerEmail: email,
      customerName: bookerProfile?.full_name || 'there',
      packageTitle: pkg.title || 'your trip',
      destination: destination || 'India',
      travelDate,
      returnDateIso,
      guests: (booking.guests as number | null) ?? 1,
      totalAmount: total,
      confirmationCode: (booking.confirmation_code as string | null) || '',
      durationSummary: durationSummary || `${durationDays} days`,
      receiptNo: (booking.stripe_payment_intent as string | null) || (booking.confirmation_code as string | null) || undefined,
      amountPaidPaise: paid,
      balanceDuePaise: balanceDue,
      payRemainingUrl: balanceDue > 0 ? `${APP_URL}/bookings` : undefined,
      contactWhatsappNumber: contact.whatsappNumber,
      contactWhatsappLabel: contact.whatsappLabel,
      tripChatUrl,
      tripUrl,
      hostName,
      hostContact,
      pocName,
      pocContact,
      travellers: (booking.traveller_details as { name: string; age: number; gender: string }[] | null) ?? null,
    })
  } catch {
    /* non-critical — booking is already confirmed */
  }
}
