'use server'

import { revalidatePath } from 'next/cache'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { STAFF_ROLES } from '@/lib/auth/admin-permissions'
import { hasAdminPermission, type AdminPermissionKey, type UserRole } from '@/types'
import { refundAcrossPayments } from '@/lib/refunds/razorpay'
import { planDepositSettlement } from '@/lib/rental-deposit'

/** Verified identity (Auth round-trip) — this action moves money. */
async function requireBookingsStaff() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Not authenticated')
  const svc = createServiceRoleClient()
  const [{ data: profile }, { data: membership }] = await Promise.all([
    svc.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    svc.from('team_members').select('role, is_active, custom_permissions').eq('user_id', user.id).maybeSingle(),
  ])
  const role: UserRole | null = profile?.role && STAFF_ROLES.includes(profile.role as UserRole)
    ? profile.role as UserRole
    : membership?.is_active && STAFF_ROLES.includes(membership.role as UserRole) ? membership.role as UserRole : null
  const perms: AdminPermissionKey[] = role === 'custom' && membership?.is_active && Array.isArray(membership.custom_permissions)
    ? membership.custom_permissions : []
  if (!role || !hasAdminPermission(role, perms, 'bookings')) throw new Error('Unauthorized')
  return { svc, user }
}

async function findHostEarning(svc: ReturnType<typeof createServiceRoleClient>, bookingId: string, orderId: string | null) {
  const { data: own } = await svc.from('host_earnings').select('id, host_paise').eq('booking_id', bookingId).maybeSingle()
  if (own) return own as { id: string; host_paise: number }
  if (!orderId) return null
  const { data: siblings } = await svc.from('bookings').select('id').eq('razorpay_order_id', orderId)
  const ids = (siblings ?? []).map(b => b.id as string).filter(id => id !== bookingId)
  if (ids.length === 0) return null
  const { data: shared } = await svc.from('host_earnings').select('id, host_paise').in('booking_id', ids).limit(1).maybeSingle()
  return (shared as { id: string; host_paise: number } | null) ?? null
}

/**
 * After the rental, return the held security deposit, optionally keeping part of
 * it (damage, late return, fuel…). The kept amount is credited to the host.
 */
export async function settleRentalSecurityDeposit(bookingId: string, retainPaise: number, note?: string):
  Promise<{ success: true; refundPaise: number } | { error: string }> {
  let ctx: Awaited<ReturnType<typeof requireBookingsStaff>>
  try { ctx = await requireBookingsStaff() } catch (e) { return { error: e instanceof Error ? e.message : 'Unauthorized' } }
  const { svc, user } = ctx

  const { data: booking } = await svc.from('bookings').select('*').eq('id', bookingId).maybeSingle()
  if (!booking) return { error: 'Booking not found' }
  if (booking.security_deposit_status !== 'held') return { error: 'This deposit has already been settled' }
  if (booking.status !== 'confirmed' && booking.status !== 'completed') return { error: 'Only confirmed rentals can be settled' }

  const plan = planDepositSettlement(booking.security_deposit_paise ?? 0, retainPaise, note)
  if ('error' in plan) return plan
  const paymentId: string | null = booking.razorpay_payment_id ?? booking.stripe_payment_intent ?? null
  if (plan.refundPaise > 0 && !paymentId) return { error: 'No captured payment found to refund against' }

  // Resolve where kept money goes before touching anything. A rental cart writes one
  // host_earnings row (on its first booking) shared by every booking in the order.
  let earning: { id: string; host_paise: number } | null = null
  if (plan.retainPaise > 0) {
    earning = await findHostEarning(svc, bookingId, booking.razorpay_order_id ?? null)
    if (!earning && booking.service_listing_id) {
      const { data: listing } = await svc.from('service_listings').select('host_id').eq('id', booking.service_listing_id).maybeSingle()
      if (listing?.host_id) return { error: 'Host earnings for this booking were not found; cannot credit the kept amount' }
    }
  }

  // Claim the deposit first so concurrent clicks can't refund it twice.
  const settledAt = new Date().toISOString()
  const { data: claimed } = await svc.from('bookings')
    .update({
      security_deposit_status: plan.status,
      security_deposit_refunded_paise: plan.refundPaise,
      security_deposit_note: note?.trim() || null,
      security_deposit_settled_at: settledAt,
    })
    .eq('id', bookingId).eq('security_deposit_status', 'held')
    .select('id').maybeSingle()
  if (!claimed) return { error: 'This deposit has already been settled' }

  if (plan.refundPaise > 0) {
    const refund = await refundAcrossPayments([{ id: paymentId!, amount: plan.refundPaise }], plan.refundPaise, {
      booking_id: bookingId, reason: 'Rental security deposit',
    })
    if (!refund.ok) {
      await svc.from('bookings').update({
        security_deposit_status: 'held', security_deposit_refunded_paise: null, security_deposit_note: null, security_deposit_settled_at: null,
      }).eq('id', bookingId)
      return { error: refund.error }
    }
  }

  if (earning) {
    // Kept deposit compensates the host directly (no platform fee); re-read so concurrent settlements of a shared cart row both count.
    const { data: latest } = await svc.from('host_earnings').select('host_paise').eq('id', earning.id).maybeSingle()
    await svc.from('host_earnings').update({ host_paise: (latest?.host_paise ?? earning.host_paise) + plan.retainPaise }).eq('id', earning.id)
  }

  await svc.from('audit_logs').insert({
    admin_id: user.id, action: 'SETTLE_RENTAL_DEPOSIT', target_type: 'booking', target_id: bookingId,
    details: { refund_paise: plan.refundPaise, retained_paise: plan.retainPaise, note: note?.trim() || null },
  })
  try {
    const amount = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`
    await svc.from('notifications').insert({
      user_id: booking.user_id,
      type: 'booking',
      title: 'Security deposit settled',
      body: plan.retainPaise > 0
        ? `${amount(plan.refundPaise)} of your deposit is being refunded; ${amount(plan.retainPaise)} was kept: ${note?.trim()}`
        : `Your ${amount(plan.refundPaise)} security deposit is being refunded. It reaches your account in 5–7 business days.`,
      link: '/bookings',
    })
  } catch { /* non-critical */ }

  revalidatePath('/admin/bookings')
  revalidatePath('/bookings')
  return { success: true, refundPaise: plan.refundPaise }
}
