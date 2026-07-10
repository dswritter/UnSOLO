'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient, createServiceRoleClient } from '@/lib/supabase/server'
import { getActionAuth } from '@/lib/auth/action-auth'
import { razorpay } from '@/lib/razorpay/client'
import { refundAcrossPayments } from '@/lib/refunds/razorpay'
import { resolvePerPersonFromPackage, parsePriceVariants, recalcBookingTierTotals } from '@/lib/package-pricing'
import { computeBookingTotals } from '@/lib/booking/pricing'
import { recordPaymentLedger, upsertBookingRefund } from '@/lib/booking/ledger'
import { getPlatformFeePercent } from '@/lib/platform-settings'
import { splitHostEarning } from '@/lib/community-payment'
import { tripDepartureDateKey } from '@/lib/package-trip-calendar'
import { assertBookingOrderRateLimit } from '@/lib/server-rate-limit'
import { REFERRED_DISCOUNT_PAISE } from '@/lib/constants'
import { isCommunityDirectCheckout, isTokenDepositEnabled } from '@/lib/join-preferences'
import { ensureTripChatRoom, addTripChatMember } from '@/lib/chat/tripChatMembership'
import { sendTripBookingReceipt } from '@/lib/email/tripReceipt'
import {
  incrementPromoOfferUsed,
  validateScopedPromoCode,
  computeDiscountPaise,
  specFromRow,
  type PromoScopeContext,
  type PromoAmountContext,
} from '@/lib/checkout-promos'
import type { JoinPreferences } from '@/types'
import { z } from 'zod'

const customDateRequestEmailSchema = z.string().trim().max(254).email()

const RAZORPAY_MIN_PAISE = 100 // ₹1 — Razorpay minimum for INR

type SupabaseServer = Awaited<ReturnType<typeof createClient>>
type ServiceSupabase = Awaited<ReturnType<typeof createServiceClient>>

async function notifyAdminsRazorpayRefundFailed(
  svc: ServiceSupabase,
  input: { bookingId: string; tripTitle: string; refundAmountPaise: number; errorDescription: string },
) {
  try {
    const { data: admins } = await svc.from('profiles').select('id').eq('role', 'admin')
    const amt = `₹${(input.refundAmountPaise / 100).toLocaleString('en-IN')}`
    const shortErr = input.errorDescription.slice(0, 280)
    const body = `Razorpay refund failed for "${input.tripTitle}" (${amt}). ${shortErr} — check merchant balance / Razorpay dashboard. Booking ${input.bookingId.slice(0, 8)}…`
    for (const a of admins || []) {
      await svc.from('notifications').insert({
        user_id: a.id,
        type: 'booking',
        title: 'Razorpay refund failed',
        body,
        link: '/admin/bookings',
      })
    }
  } catch {
    /* non-critical */
  }
}

async function tryEmailHostNewBooking(
  svc: ServiceSupabase,
  hostId: string,
  input: { travelerDisplayName: string; tripTitle: string; hostAmountLabel: string; feePercent: number },
) {
  try {
    const { data: hostProf } = await svc.from('profiles').select('email, full_name').eq('id', hostId).maybeSingle()
    const to = hostProf?.email?.trim()
    if (!hostProf || !to) return
    const { sendHostNewBookingEmail } = await import('@/lib/resend/emails')
    const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://unsolo.in'
    await sendHostNewBookingEmail({
      to,
      hostName: hostProf.full_name,
      travelerName: input.travelerDisplayName,
      tripTitle: input.tripTitle,
      hostEarningsFormatted: input.hostAmountLabel,
      feePercent: input.feePercent,
      hostDashboardUrl: `${site}/host`,
    })
  } catch {
    /* non-critical */
  }
}

type TravellerDetailRow = { name: string; age: number; gender: 'male' | 'female' | 'other' }

/**
 * Validate per-traveller details against the guest count. Returns `null` when
 * none were supplied (older clients / non-trip flows), the cleaned array when
 * valid, or an error message.
 */
function sanitizeTravellerDetails(
  input: { name: string; age: number; gender: string }[] | undefined,
  guests: number,
): { value: TravellerDetailRow[] | null } | { error: string } {
  if (!input || input.length === 0) return { value: null }
  if (input.length !== guests) {
    return { error: 'Please fill details for every traveller' }
  }
  const cleaned: TravellerDetailRow[] = []
  for (let i = 0; i < input.length; i++) {
    const t = input[i]
    const name = (t?.name ?? '').toString().trim().slice(0, 100)
    const age = Number(t?.age)
    const gender = (t?.gender ?? '').toString()
    if (!name) return { error: `Enter the name for traveller ${i + 1}` }
    if (!Number.isInteger(age) || age < 1 || age > 120) {
      return { error: `Enter a valid age for traveller ${i + 1}` }
    }
    if (!['male', 'female', 'other'].includes(gender)) {
      return { error: `Select gender for traveller ${i + 1}` }
    }
    cleaned.push({ name, age, gender: gender as 'male' | 'female' | 'other' })
  }
  return { value: cleaned }
}

async function validatePromoForCheckout(
  supabase: SupabaseServer,
  code: string,
  context: PromoScopeContext,
  amount: PromoAmountContext,
): Promise<{ discountPaise: number; offerId: string } | { error: string }> {
  const result = await validateScopedPromoCode(supabase, code, context, amount)
  if ('error' in result) return result
  return { discountPaise: result.discountPaise, offerId: result.offerId }
}

async function referredDiscountForUser(
  supabase: SupabaseServer,
  userId: string,
): Promise<number> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('referred_by')
    .eq('id', userId)
    .single()
  if (!profile?.referred_by) return 0

  const { count } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('status', ['confirmed', 'completed'])

  if ((count ?? 0) > 0) return 0
  return REFERRED_DISCOUNT_PAISE
}

/** Wallet + Razorpay split (same rules as legacy wallet block). */
function walletAndRazorpayAmount(
  grossAfterPromoAndReferred: number,
  availableCredits: number,
  useWallet: boolean,
): { walletDeducted: number; razorpayAmount: number } {
  if (!useWallet || availableCredits <= 0) {
    return { walletDeducted: 0, razorpayAmount: grossAfterPromoAndReferred }
  }
  if (availableCredits >= grossAfterPromoAndReferred) {
    return { walletDeducted: grossAfterPromoAndReferred, razorpayAmount: 0 }
  }
  let walletDeducted = Math.min(
    availableCredits,
    Math.max(0, grossAfterPromoAndReferred - RAZORPAY_MIN_PAISE),
  )
  let razorpayAmount = grossAfterPromoAndReferred - walletDeducted
  if (razorpayAmount > 0 && razorpayAmount < RAZORPAY_MIN_PAISE) {
    walletDeducted = Math.min(availableCredits, grossAfterPromoAndReferred - RAZORPAY_MIN_PAISE)
    if (walletDeducted < 0) walletDeducted = 0
    razorpayAmount = grossAfterPromoAndReferred - walletDeducted
  }
  return { walletDeducted, razorpayAmount }
}

/** First token payment only: wallet, chat, achievements, admin — no promo increment, host earnings, or referral. */
async function runPartialTokenFirstPaymentEffects(
  supabase: SupabaseServer,
  userId: string,
  booking: Record<string, unknown> & {
    id: string
    package_id: string
    wallet_deducted_paise?: number | null
    total_amount_paise: number
    deposit_paise?: number | null
    promo_offer_id?: string | null
    package?: unknown
  },
  confirmationCode: string,
) {
  if (booking.wallet_deducted_paise && booking.wallet_deducted_paise > 0) {
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('referral_credits_paise')
      .eq('id', userId)
      .single()

    const currentCredits = userProfile?.referral_credits_paise || 0
    const newCredits = Math.max(0, currentCredits - booking.wallet_deducted_paise)
    await supabase.from('profiles').update({ referral_credits_paise: newCredits }).eq('id', userId)
  }

  // Trip chat: named after the trip, trip photo as icon, host included.
  const chatSvc = createServiceRoleClient()
  const roomId = await ensureTripChatRoom(chatSvc, booking.package_id)
  if (roomId) {
    await addTripChatMember(chatSvc, roomId, userId)

    const { data: joinerProfile } = await supabase
      .from('profiles')
      .select('username, full_name')
      .eq('id', userId)
      .single()
    const displayName = joinerProfile?.full_name || joinerProfile?.username || 'A new traveler'

    await chatSvc.from('messages').insert({
      room_id: roomId,
      user_id: null,
      content: `🎉 ${displayName} (@${joinerProfile?.username || 'traveler'}) has joined the trip!`,
      message_type: 'system',
    })
  }

  const pkgDetail = booking.package as { difficulty?: string } | null
  if (pkgDetail?.difficulty === 'challenging') {
    await supabase.from('user_achievements').upsert({
      user_id: userId,
      achievement_key: 'trailblazer',
    })
  }

  try {
    const { createClient: createSC } = await import('@supabase/supabase-js')
    const svcSupabase = createSC(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data: customerProfile } = await supabase
      .from('profiles')
      .select('full_name, username')
      .eq('id', userId)
      .single()
    const customerName = customerProfile?.full_name || customerProfile?.username || 'A user'
    const pkgName = (booking.package as { title?: string })?.title || 'a trip'
    const paid = booking.deposit_paise ?? 0
    const total = booking.total_amount_paise
    const amountFormatted = '₹' + (paid / 100).toLocaleString('en-IN')
    const totalFormatted = '₹' + (total / 100).toLocaleString('en-IN')

    const { data: admins } = await svcSupabase
      .from('profiles')
      .select('id')
      .in('role', ['admin', 'social_media_manager', 'field_person', 'chat_responder'])
    for (const admin of admins || []) {
      await svcSupabase.from('notifications').insert({
        user_id: admin.id,
        type: 'booking',
        title: 'Token payment received',
        body: `${customerName} paid ${amountFormatted} toward ${pkgName} (balance ${totalFormatted} total). Code: ${confirmationCode}`,
        link: '/admin/bookings',
      })
    }
  } catch {
    /* non-critical */
  }
}

/** Final payment on a token booking: promo increment, host earnings, referral (chat already done). */
async function runBalanceCompletionEffects(
  supabase: SupabaseServer,
  userId: string,
  booking: Record<string, unknown> & {
    id: string
    package_id: string
    total_amount_paise: number
    gross_paise?: number | null
    discount_paise?: number | null
    wallet_deducted_paise?: number | null
    promo_offer_id?: string | null
    package?: unknown
  },
  confirmationCode: string,
) {
  if (booking.promo_offer_id) {
    await incrementPromoOfferUsed(supabase, booking.promo_offer_id)
  }

  try {
    const pkg = booking.package as { host_id?: string } | null
    if (pkg?.host_id) {
      const feePercent = await getPlatformFeePercent()
      const grossPaise = booking.gross_paise
        ?? (booking.total_amount_paise + (booking.discount_paise || 0))
      const {
        hostPaise,
        platformGrossPaise,
        platformNetPaise,
        promoPaise,
        walletPaise,
      } = splitHostEarning({
        grossPaise,
        feePercent,
        promoPaise: booking.discount_paise || 0,
        walletPaise: booking.wallet_deducted_paise || 0,
      })

      const { createClient: createSC3 } = await import('@supabase/supabase-js')
      const svcSupa3 = createSC3(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

      await svcSupa3.from('host_earnings').insert({
        booking_id: booking.id,
        host_id: pkg.host_id,
        total_paise: grossPaise,
        platform_fee_paise: platformGrossPaise,
        platform_net_paise: platformNetPaise,
        promo_paise: promoPaise,
        wallet_paise: walletPaise,
        host_paise: hostPaise,
        payout_status: 'pending',
      })

      const hostAmount_fmt = '₹' + (hostPaise / 100).toLocaleString('en-IN')
      await svcSupa3.from('notifications').insert({
        user_id: pkg.host_id,
        type: 'split_payment',
        title: 'Trip fully paid!',
        body: `A traveler completed payment for your trip. Your earnings: ${hostAmount_fmt} (list price includes a ${feePercent}% platform fee).`,
        link: '/host',
      })

      const pkgTitle = (booking.package as { title?: string } | null)?.title || 'your trip'
      const { data: joinerProf } = await supabase
        .from('profiles')
        .select('username, full_name')
        .eq('id', userId)
        .single()
      const travelerDisplayName = joinerProf?.full_name || joinerProf?.username || 'A traveler'
      await tryEmailHostNewBooking(svcSupa3, pkg.host_id, {
        travelerDisplayName,
        tripTitle: pkgTitle,
        hostAmountLabel: hostAmount_fmt,
        feePercent,
      })
    }
  } catch {
    /* non-critical */
  }

  try {
    const { createClient: createSC2 } = await import('@supabase/supabase-js')
    const svcSupa = createSC2(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { REFERRAL_CREDIT_PAISE } = await import('@/lib/constants')

    const { count: confirmedCount } = await svcSupa
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'confirmed')

    if (confirmedCount === 1) {
      const { data: userProfile } = await svcSupa
        .from('profiles')
        .select('referred_by')
        .eq('id', userId)
        .single()

      if (userProfile?.referred_by) {
        const { data: referrer } = await svcSupa
          .from('profiles')
          .select('referral_credits_paise')
          .eq('id', userProfile.referred_by)
          .single()

        await svcSupa
          .from('profiles')
          .update({
            referral_credits_paise: (referrer?.referral_credits_paise || 0) + REFERRAL_CREDIT_PAISE,
          })
          .eq('id', userProfile.referred_by)

        await svcSupa
          .from('referrals')
          .update({ status: 'credited', credited_at: new Date().toISOString(), booking_id: booking.id })
          .eq('referrer_id', userProfile.referred_by)
          .eq('referred_id', userId)

        await svcSupa.from('notifications').insert({
          user_id: userProfile.referred_by,
          type: 'booking',
          title: 'Referral Reward!',
          body: `Your friend completed their first trip! You earned ₹${REFERRAL_CREDIT_PAISE / 100}!`,
          link: '/profile',
        })
      }
    }
  } catch {
    /* non-critical */
  }

  // Second receipt — balance settled, booking now fully paid.
  await sendTripBookingReceipt(booking.id)
}

/** Shared: chat, wallet deduction, host earnings, referral — after booking row is confirmed. */
async function runPostConfirmationPipeline(
  supabase: SupabaseServer,
  userId: string,
  booking: Record<string, unknown> & {
    id: string
    package_id: string
    wallet_deducted_paise?: number | null
    discount_paise?: number | null
    total_amount_paise: number
    gross_paise?: number | null
    promo_offer_id?: string | null
    package?: unknown
  },
  confirmationCode: string,
) {
  if (booking.wallet_deducted_paise && booking.wallet_deducted_paise > 0) {
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('referral_credits_paise')
      .eq('id', userId)
      .single()

    const currentCredits = userProfile?.referral_credits_paise || 0
    const newCredits = Math.max(0, currentCredits - booking.wallet_deducted_paise)
    await supabase.from('profiles').update({ referral_credits_paise: newCredits }).eq('id', userId)
  }

  if (booking.promo_offer_id) {
    await incrementPromoOfferUsed(supabase, booking.promo_offer_id)
  }

  // Trip chat: named after the trip, trip photo as icon, host included.
  const chatSvc = createServiceRoleClient()
  const roomId = await ensureTripChatRoom(chatSvc, booking.package_id)
  if (roomId) {
    await addTripChatMember(chatSvc, roomId, userId)

    const { data: joinerProfile } = await supabase
      .from('profiles')
      .select('username, full_name')
      .eq('id', userId)
      .single()
    const displayName = joinerProfile?.full_name || joinerProfile?.username || 'A new traveler'

    await chatSvc.from('messages').insert({
      room_id: roomId,
      user_id: null,
      content: `🎉 ${displayName} (@${joinerProfile?.username || 'traveler'}) has joined the trip!`,
      message_type: 'system',
    })
  }

  const pkgDetail = booking.package as { difficulty?: string } | null
  if (pkgDetail?.difficulty === 'challenging') {
    await supabase.from('user_achievements').upsert({
      user_id: userId,
      achievement_key: 'trailblazer',
    })
  }

  try {
    const { createClient: createSC } = await import('@supabase/supabase-js')
    const svcSupabase = createSC(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data: customerProfile } = await supabase
      .from('profiles')
      .select('full_name, username')
      .eq('id', userId)
      .single()
    const customerName = customerProfile?.full_name || customerProfile?.username || 'A user'
    const pkgName = (booking.package as { title?: string })?.title || 'a trip'
    const amountFormatted = '₹' + (booking.total_amount_paise / 100).toLocaleString('en-IN')

    const { data: admins } = await svcSupabase
      .from('profiles')
      .select('id')
      .in('role', ['admin', 'social_media_manager', 'field_person', 'chat_responder'])
    for (const admin of admins || []) {
      await svcSupabase.from('notifications').insert({
        user_id: admin.id,
        type: 'booking',
        title: 'New Booking!',
        body: `${customerName} booked ${pkgName} for ${amountFormatted}. Code: ${confirmationCode}`,
        link: '/admin/bookings',
      })
    }
  } catch {
    /* non-critical */
  }

  try {
    const pkg = booking.package as { host_id?: string } | null
    if (pkg?.host_id) {
      const feePercent = await getPlatformFeePercent()
      const grossPaise = booking.gross_paise
        ?? (booking.total_amount_paise + (booking.discount_paise || 0))
      const {
        hostPaise,
        platformGrossPaise,
        platformNetPaise,
        promoPaise,
        walletPaise,
      } = splitHostEarning({
        grossPaise,
        feePercent,
        promoPaise: booking.discount_paise || 0,
        walletPaise: booking.wallet_deducted_paise || 0,
      })

      const { createClient: createSC3 } = await import('@supabase/supabase-js')
      const svcSupa3 = createSC3(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

      await svcSupa3.from('host_earnings').insert({
        booking_id: booking.id,
        host_id: pkg.host_id,
        total_paise: grossPaise,
        platform_fee_paise: platformGrossPaise,
        platform_net_paise: platformNetPaise,
        promo_paise: promoPaise,
        wallet_paise: walletPaise,
        host_paise: hostPaise,
        payout_status: 'pending',
      })

      const hostAmount_fmt = '₹' + (hostPaise / 100).toLocaleString('en-IN')
      await svcSupa3.from('notifications').insert({
        user_id: pkg.host_id,
        type: 'split_payment',
        title: 'New Booking on Your Trip!',
        body: `A traveler booked your trip. Your earnings: ${hostAmount_fmt} (list price includes a ${feePercent}% platform fee).`,
        link: '/host',
      })

      const pkgName = (booking.package as { title?: string })?.title || 'your trip'
      const { data: joinerForHost } = await supabase
        .from('profiles')
        .select('full_name, username')
        .eq('id', userId)
        .single()
      const travelerForHost = joinerForHost?.full_name || joinerForHost?.username || 'A traveler'
      await tryEmailHostNewBooking(svcSupa3, pkg.host_id, {
        travelerDisplayName: travelerForHost,
        tripTitle: pkgName,
        hostAmountLabel: hostAmount_fmt,
        feePercent,
      })
    }
  } catch {
    /* non-critical */
  }

  try {
    const { createClient: createSC2 } = await import('@supabase/supabase-js')
    const svcSupa = createSC2(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { REFERRAL_CREDIT_PAISE } = await import('@/lib/constants')

    const { count: confirmedCount } = await svcSupa
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'confirmed')

    if (confirmedCount === 1) {
      const { data: userProfile } = await svcSupa
        .from('profiles')
        .select('referred_by')
        .eq('id', userId)
        .single()

      if (userProfile?.referred_by) {
        const { data: referrer } = await svcSupa
          .from('profiles')
          .select('referral_credits_paise')
          .eq('id', userProfile.referred_by)
          .single()

        await svcSupa
          .from('profiles')
          .update({
            referral_credits_paise: (referrer?.referral_credits_paise || 0) + REFERRAL_CREDIT_PAISE,
          })
          .eq('id', userProfile.referred_by)

        await svcSupa
          .from('referrals')
          .update({ status: 'credited', credited_at: new Date().toISOString(), booking_id: booking.id })
          .eq('referrer_id', userProfile.referred_by)
          .eq('referred_id', userId)

        await svcSupa.from('notifications').insert({
          user_id: userProfile.referred_by,
          type: 'booking',
          title: 'Referral Reward!',
          body: `Your friend completed their first trip! You earned ₹${REFERRAL_CREDIT_PAISE / 100}!`,
          link: '/profile',
        })
      }
    }
  } catch {
    /* non-critical */
  }

  // Send booking confirmation / receipt email to customer (fully paid).
  await sendTripBookingReceipt(booking.id)
}

async function notifyTokenBalanceDue(
  supabase: SupabaseServer,
  user: { id: string; email?: string | null },
  booking: {
    id: string
    travel_date: string
    total_amount_paise: number
    confirmation_code?: string | null
    package?: unknown
  },
  depositAfterPayment: number,
) {
  const balance = booking.total_amount_paise - depositAfterPayment
  if (balance <= 0) return
  const fmt = (p: number) => '₹' + (p / 100).toLocaleString('en-IN')
  const pkgTitle = (booking.package as { title?: string } | null)?.title || 'your trip'
  try {
    await supabase.from('notifications').insert({
      user_id: user.id,
      type: 'booking',
      title: 'Complete your trip payment',
      body: `You secured your spot with a token. ${fmt(balance)} remaining for ${pkgTitle} — pay from My Trips before your trip.`,
      link: '/bookings',
    })
  } catch {
    /* non-critical */
  }
  await sendTripBookingReceipt(booking.id)
}

export async function createRazorpayOrder(
  packageId: string,
  travelDate: string,
  guests: number,
  useWalletCredits: boolean = false,
  options?: {
    priceVariantIndex?: number
    groupBookingId?: string
    promoCode?: string
    /** On token_to_book trips: charge full trip total now instead of host token slice */
    payFullAmountForTokenTrip?: boolean
    /** Per-traveller name/age/gender, one entry per guest. */
    travellerDetails?: { name: string; age: number; gender: string }[]
    /** Proceed past soft conflict warnings (duplicate-booking ruleset). */
    acknowledgeWarnings?: boolean
  },
) {
  if (!Number.isInteger(guests) || guests < 1) {
    return { error: 'Number of guests must be at least 1' }
  }

  const travellerDetails = sanitizeTravellerDetails(options?.travellerDetails, guests)
  if ('error' in travellerDetails) return { error: travellerDetails.error }

  const { supabase, user } = await getActionAuth()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const orderRate = await assertBookingOrderRateLimit(supabase, user.id)
  if (orderRate.error) return { error: orderRate.error }

  // Get user profile for prefill
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, phone_number')
    .eq('id', user.id)
    .single()

  const { data: pkg } = await supabase
    .from('packages')
    .select('*, destination:destinations(*)')
    .eq('id', packageId)
    .single()

  if (!pkg) {
    return { error: 'Package not found' }
  }

  if (pkg.host_id && pkg.host_id === user.id) {
    return { error: 'You cannot book your own trip' }
  }

  const joinPrefs =
    pkg.join_preferences && typeof pkg.join_preferences === 'object'
      ? (pkg.join_preferences as JoinPreferences)
      : null
  const communityDirectCheckout = isCommunityDirectCheckout(joinPrefs)
  const communityTokenBook = isTokenDepositEnabled(joinPrefs)

  if (pkg.host_id && !communityDirectCheckout) {
    return { error: 'This trip uses join requests. Open the trip page to request a spot.' }
  }

  if (pkg.host_id && !pkg.is_active) {
    return { error: 'This trip is not available for booking' }
  }
  // Allow bookings while status is 'pending' *if* the trip was ever approved
  // before (host just edited something; admin is re-reviewing). Brand-new
  // pending trips and rejected trips stay gated.
  if (
    pkg.host_id &&
    pkg.moderation_status !== 'approved' &&
    !(pkg.moderation_status === 'pending' && pkg.first_approved_at)
  ) {
    return { error: 'This trip is not available for booking' }
  }

  // Server-side date validation — same-day departures are allowed, but past dates are not.
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const selectedDate = new Date(travelDate)
  if (selectedDate < today) {
    return { error: 'Travel date cannot be in the past' }
  }

  if (pkg.bookings_paused) {
    return { error: 'This trip is not accepting new bookings right now.' }
  }

  const closedDates = (pkg.departure_dates_closed || []).map(tripDepartureDateKey)
  if (closedDates.includes(tripDepartureDateKey(travelDate))) {
    return { error: 'No spots left for this date' }
  }

  {
    const cutoffs = (pkg.booking_cutoff_dates || {}) as Record<string, string>
    const cutoffIso = cutoffs[tripDepartureDateKey(travelDate)]
    if (cutoffIso) {
      const cutoff = new Date(cutoffIso)
      cutoff.setHours(23, 59, 59, 999)
      if (new Date() > cutoff) {
        return { error: 'Bookings for this departure date are no longer being accepted.' }
      }
    }
  }

  // Multi-booking conflict rules (allow / warn / prevent). A user may book a trip
  // more than once (themselves vs friends/family), so instead of hard-blocking we
  // prevent only true duplicates / self-rebooks and warn on overlaps + date clashes.
  {
    const { evaluateBookingConflicts } = await import('@/lib/booking-conflicts')
    const dayMs = 86400000
    const [{ data: prof }, { data: actives }] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
      supabase
        .from('bookings')
        .select('id, status, package_id, travel_date, traveller_details, package:packages(duration_days)')
        .eq('user_id', user.id)
        .not('package_id', 'is', null)
        .in('status', ['pending', 'confirmed']),
    ])
    const attemptNames = (options?.travellerDetails || []).map((t) => t.name).filter(Boolean)
    const attemptStart = selectedDate.getTime()
    const attemptEnd = attemptStart + Math.max(1, pkg.duration_days || 1) * dayMs
    const existingForConflict = (actives || []).map((b) => {
      const dur = Math.max(1, (b.package as { duration_days?: number } | null)?.duration_days || 1)
      const s = b.travel_date ? new Date(b.travel_date as string).getTime() : 0
      const names = Array.isArray(b.traveller_details)
        ? (b.traveller_details as { name?: string }[]).map((t) => t?.name || '')
        : []
      return { packageId: String(b.package_id), travelDate: b.travel_date as string | null, travellerNames: names, startMs: s, endMs: s ? s + dur * dayMs : 0 }
    })
    const conflict = evaluateBookingConflicts(
      { packageId, travelDate, travellerNames: attemptNames, selfName: prof?.full_name ?? null, startMs: attemptStart, endMs: attemptEnd },
      existingForConflict,
    )
    if (conflict.prevent) return { error: conflict.prevent }
    if (conflict.warnings.length > 0 && !options?.acknowledgeWarnings) {
      return { warnings: conflict.warnings }
    }

    // True-retry cleanup: cancel an abandoned PENDING booking for the same trip +
    // date + identical travellers (so we don't orphan it). Other pending bookings
    // (different people) are left intact — they're legitimate separate bookings.
    const normSet = (names: string[]) => {
      const set = new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean))
      const attempt = new Set(attemptNames.map((n) => n.trim().toLowerCase()).filter(Boolean))
      return set.size === attempt.size && [...set].every((n) => attempt.has(n))
    }
    const staleRetry = (actives || []).find(
      (b) =>
        b.status === 'pending' &&
        b.package_id === packageId &&
        b.travel_date === travelDate &&
        normSet(Array.isArray(b.traveller_details) ? (b.traveller_details as { name?: string }[]).map((t) => t?.name || '') : []),
    )
    if (staleRetry) {
      await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', staleRetry.id)
    }
  }

  // Check if max spots reached for this date (sum of guests, not count of bookings)
  if (pkg.max_group_size) {
    const { data: existingBookings } = await supabase
      .from('bookings')
      .select('guests')
      .eq('package_id', packageId)
      .eq('travel_date', travelDate)
      .in('status', ['pending', 'confirmed', 'completed'])
    const totalBooked = (existingBookings || []).reduce((sum, b) => sum + (b.guests || 1), 0)
    const spotsLeft = pkg.max_group_size - totalBooked
    if (guests > spotsLeft) {
      return { error: spotsLeft <= 0 ? 'No spots left for this date' : `Only ${spotsLeft} spots left for this date` }
    }
  }
  const maxDate = new Date()
  maxDate.setFullYear(maxDate.getFullYear() + 2)
  if (selectedDate > maxDate) {
    return { error: 'Travel date cannot be more than 2 years in the future' }
  }

  let perPersonPaise = pkg.price_paise
  let priceVariantLabel: string | null = null

  if (options?.groupBookingId) {
    const { data: grp } = await supabase
      .from('group_bookings')
      .select('id, package_id, travel_date, status, per_person_paise')
      .eq('id', options.groupBookingId)
      .single()
    if (!grp || grp.package_id !== packageId || grp.travel_date !== travelDate) {
      return { error: 'Invalid group booking for this trip' }
    }
    if (grp.status !== 'open') {
      return { error: 'This group is no longer open for payment' }
    }
    perPersonPaise = grp.per_person_paise
  } else {
    try {
      const resolved = resolvePerPersonFromPackage(pkg, options?.priceVariantIndex ?? 0)
      perPersonPaise = resolved.perPerson
      priceVariantLabel = resolved.label
    } catch {
      return { error: 'Invalid price option' }
    }
  }

  const grossList = perPersonPaise * guests
  let promoOfferId: string | null = null
  let promoDiscountPaise = 0
  if (options?.promoCode?.trim()) {
    const pr = await validatePromoForCheckout(
      supabase,
      options.promoCode,
      {
        listingType: 'trips',
        packageId: pkg.id,
        hostId: pkg.host_id,
      },
      { grossPaise: grossList, unitPricePaise: perPersonPaise, quantity: guests },
    )
    if ('error' in pr) return { error: pr.error }
    promoDiscountPaise = Math.min(pr.discountPaise, grossList)
    promoOfferId = pr.offerId
  }
  const afterPromo = Math.max(0, grossList - promoDiscountPaise)
  const referredDisc = await referredDiscountForUser(supabase, user.id)
  const referredApplied = Math.min(referredDisc, afterPromo)
  const afterDiscounts = Math.max(0, afterPromo - referredApplied)

  const tokenPaiseFromHost =
    joinPrefs &&
    typeof joinPrefs.token_amount_paise === 'number' &&
    Number.isFinite(joinPrefs.token_amount_paise)
      ? Math.round(joinPrefs.token_amount_paise)
      : 0
  let firstPaymentCap: number | null = null
  if (communityTokenBook) {
    if (tokenPaiseFromHost < RAZORPAY_MIN_PAISE || tokenPaiseFromHost > perPersonPaise) {
      return { error: 'This trip has an invalid token amount. Please contact support.' }
    }
    if (!options?.payFullAmountForTokenTrip) {
      firstPaymentCap = Math.min(tokenPaiseFromHost * guests, afterDiscounts)
    }
  }

  const { data: userProfileWallet } = await supabase
    .from('profiles')
    .select('referral_credits_paise')
    .eq('id', user.id)
    .single()
  const availableCredits = userProfileWallet?.referral_credits_paise || 0

  const walletTarget = firstPaymentCap != null ? firstPaymentCap : afterDiscounts
  const { walletDeducted, razorpayAmount } = walletAndRazorpayAmount(
    walletTarget,
    availableCredits,
    useWalletCredits,
  )

  const discountTotalPaise = grossList - afterDiscounts

  if (razorpayAmount <= 0) {
    const { generateConfirmationCode } = await import('@/lib/utils')
    const confirmationCode = generateConfirmationCode()

    const depositPaiseInstant =
      firstPaymentCap != null ? walletDeducted + razorpayAmount : afterDiscounts
    const fullyPaidInstant = depositPaiseInstant >= afterDiscounts

    const { data: booking } = await supabase
      .from('bookings')
      .insert({
        user_id: user.id,
        package_id: packageId,
        status: 'confirmed',
        travel_date: travelDate,
        guests,
        total_amount_paise: afterDiscounts,
        gross_paise: grossList,
        deposit_paise: depositPaiseInstant,
        wallet_deducted_paise: walletDeducted,
        discount_paise: discountTotalPaise,
        promo_offer_id: promoOfferId,
        stripe_session_id: null,
        stripe_payment_intent: null,
        confirmation_code: confirmationCode,
        price_variant_label: priceVariantLabel,
        traveller_details: travellerDetails.value,
      })
      .select('*, package:packages(*, destination:destinations(*))')
      .single()

    if (!booking) return { error: 'Could not create booking' }

    if (firstPaymentCap != null && !fullyPaidInstant) {
      await runPartialTokenFirstPaymentEffects(supabase, user.id, booking as never, confirmationCode)
      await notifyTokenBalanceDue(supabase, user, booking as never, depositPaiseInstant)
    } else {
      await runPostConfirmationPipeline(supabase, user.id, booking as never, confirmationCode)
    }
    revalidatePath('/bookings')
    return {
      instant: true as const,
      bookingId: booking.id,
      confirmationCode,
      balanceDuePaise: fullyPaidInstant ? 0 : Math.max(0, afterDiscounts - depositPaiseInstant),
    }
  }

  const order = await razorpay.orders.create({
    amount: razorpayAmount,
    currency: 'INR',
    receipt: `unsolo_${Date.now()}`,
    notes: {
      userId: user.id,
      packageId,
      travelDate,
      guests: String(guests),
      packageTitle: pkg.title,
    },
  })

  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .insert({
      user_id: user.id,
      package_id: packageId,
      status: 'pending',
      travel_date: travelDate,
      guests,
      total_amount_paise: afterDiscounts,
      gross_paise: grossList,
      deposit_paise: 0,
      wallet_deducted_paise: walletDeducted,
      discount_paise: discountTotalPaise,
      promo_offer_id: promoOfferId,
      stripe_session_id: order.id,
      price_variant_label: priceVariantLabel,
      traveller_details: travellerDetails.value,
    })
    .select()
    .single()

  // Never expose a payable order without a persisted booking row — otherwise the
  // traveler can pay and end up with no booking (invisible to them and the host).
  if (bookingError || !booking) {
    console.error('[createRazorpayOrder] booking insert failed:', bookingError?.message)
    return { error: "We couldn't start your booking and you have NOT been charged. Please try again or contact support." }
  }

  return {
    orderId: order.id,
    amount: razorpayAmount,
    currency: 'INR',
    bookingId: booking.id,
    keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
    prefill: {
      email: user.email || '',
      ...(profile?.phone_number ? {
        contact: profile.phone_number.startsWith('+91')
          ? profile.phone_number
          : `+91${profile.phone_number.replace(/\D/g, '').slice(-10)}`
      } : {}),
      name: profile?.full_name || '',
    },
    notes: {
      userId: user.id,
      packageId,
      travelDate,
      guests: String(guests),
    },
  }
}

/**
 * Shared, idempotent application of a captured Razorpay payment to a booking.
 * Credits the deposit (capped at the trip total), advances status to confirmed,
 * and dispatches the right side effects EXACTLY once.
 *
 * Safety properties:
 *  - B7: deposit is clamped to total_amount_paise, so a wrong/stale order amount
 *    can never over-credit a booking.
 *  - B8/W3: the booking update is conditional on deposit_paise being unchanged
 *    since we read it, so concurrent callers (client confirmPayment + the webhook
 *    fallback) cannot both apply the payment or both run effects — the first to
 *    land wins; everyone else returns success without re-running effects. The
 *    `stripe_payment_intent === paymentId` short-circuit handles plain duplicates.
 */
async function applyCapturedPaymentToBooking(
  client: SupabaseServer,
  before: Record<string, unknown> & {
    id: string
    user_id: string
    status: string
    total_amount_paise: number
    deposit_paise?: number | null
    wallet_deducted_paise?: number | null
    stripe_payment_intent?: string | null
    confirmation_code?: string | null
  },
  paymentId: string,
  paidAmountPaise: number,
  authUser: { id: string; email?: string | null } | null,
) {
  const { generateConfirmationCode } = await import('@/lib/utils')
  const total = before.total_amount_paise || 0
  const wasDeposit = before.deposit_paise || 0

  // Plain duplicate — this exact payment was already applied. Don't re-credit.
  if (before.stripe_payment_intent === paymentId && before.status === 'confirmed') {
    return {
      applied: false,
      confirmationCode: before.confirmation_code || '',
      bookingId: before.id,
      fullyPaid: wasDeposit >= total,
      balanceDuePaise: Math.max(0, total - wasDeposit),
    }
  }

  const rawNewDeposit =
    wasDeposit === 0
      ? (before.wallet_deducted_paise || 0) + paidAmountPaise
      : wasDeposit + paidAmountPaise
  const newDeposit = Math.min(rawNewDeposit, total) // B7: never over-credit
  const fullyPaid = newDeposit >= total
  const confirmationCode = before.confirmation_code || generateConfirmationCode()

  // Conditional update — only the first caller (deposit still at wasDeposit) wins.
  const { data: booking } = await client
    .from('bookings')
    .update({
      status: 'confirmed',
      stripe_payment_intent: paymentId,
      confirmation_code: confirmationCode,
      deposit_paise: newDeposit,
    })
    .eq('id', before.id)
    .eq('deposit_paise', wasDeposit)
    .select('*, package:packages(*, destination:destinations(*))')
    .maybeSingle()

  if (!booking) {
    // Another caller already applied this payment — do not double-run effects.
    return {
      applied: false,
      confirmationCode,
      bookingId: before.id,
      fullyPaid,
      balanceDuePaise: Math.max(0, total - newDeposit),
    }
  }

  // Best-effort: record this capture (id + amount) so refunds can later be spread
  // across token + balance payments (BP3). Kept as a SEPARATE update so that a
  // not-yet-applied migration (the razorpay_payment_ids column) can never block the
  // critical deposit crediting above — if the column is missing this just no-ops.
  const existingPayments = Array.isArray(before.razorpay_payment_ids) ? before.razorpay_payment_ids : []
  const alreadyListed = (existingPayments as Array<{ id?: string }>).some((p) => p?.id === paymentId)
  if (!alreadyListed) {
    // Record the real gateway fee (method-specific: UPI ~0, cards ~2%) so refunds
    // can deduct the actual non-refundable charge rather than a flat estimate.
    let fee: number | undefined
    try {
      const pay = await razorpay.payments.fetch(paymentId)
      const f = Number((pay as { fee?: number | string | null }).fee)
      if (Number.isFinite(f) && f >= 0) fee = Math.round(f)
    } catch { /* fee optional — falls back to the configured % at refund time */ }
    const entry: { id: string; amount: number; fee?: number } = { id: paymentId, amount: paidAmountPaise }
    if (typeof fee === 'number') entry.fee = fee
    await client
      .from('bookings')
      .update({ razorpay_payment_ids: [...existingPayments, entry] })
      .eq('id', before.id)
    // Phase 2 dual-write: mirror this capture into the payments ledger (best-effort).
    await recordPaymentLedger(createServiceRoleClient(), {
      bookingId: before.id,
      amountPaise: paidAmountPaise,
      method: 'razorpay',
      kind: wasDeposit > 0 ? 'balance' : 'payment',
      gatewayPaymentId: paymentId,
      gatewayFeePaise: fee ?? 0,
    })
  }

  if (wasDeposit === 0 && !fullyPaid) {
    await runPartialTokenFirstPaymentEffects(client, before.user_id, booking as never, confirmationCode)
    if (authUser) await notifyTokenBalanceDue(client, authUser, booking as never, newDeposit)
  } else if (wasDeposit === 0 && fullyPaid) {
    await runPostConfirmationPipeline(client, before.user_id, booking as never, confirmationCode)
  } else if (wasDeposit > 0 && fullyPaid) {
    await runBalanceCompletionEffects(client, before.user_id, booking as never, confirmationCode)
  }

  return {
    applied: true,
    confirmationCode,
    bookingId: booking.id,
    fullyPaid,
    balanceDuePaise: fullyPaid ? 0 : Math.max(0, total - newDeposit),
  }
}

/**
 * Webhook fallback for a captured payment: when the client-side confirmPayment
 * never ran (tab closed, network drop), finalize the booking server-side. Uses a
 * service-role client and the shared idempotent apply step, so it is safe even if
 * the client also confirmed. Handles both the initial order and balance orders.
 */
export async function completeBookingFromWebhook(
  orderId: string,
  paymentId: string,
  paidAmountPaise: number,
) {
  const svc = createServiceRoleClient()
  let before = (
    await svc
      .from('bookings')
      .select('*, package:packages(*, destination:destinations(*))')
      .eq('stripe_session_id', orderId)
      .maybeSingle()
  ).data
  if (!before) {
    before = (
      await svc
        .from('bookings')
        .select('*, package:packages(*, destination:destinations(*))')
        .eq('balance_razorpay_order_id', orderId)
        .maybeSingle()
    ).data
  }
  if (!before) return { error: 'Booking not found' }

  const res = await applyCapturedPaymentToBooking(svc as never, before, paymentId, paidAmountPaise, null)
  revalidatePath('/bookings')
  return { success: true, applied: res.applied, fullyPaid: res.fullyPaid }
}

export async function confirmPayment(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  razorpaySignature: string,
) {
  const { supabase, user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }

  // Verify signature
  const crypto = await import('crypto')
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex')

  if (expectedSignature !== razorpaySignature) {
    return { error: 'Payment verification failed' }
  }

  // Look up the booking by its initial order ID or, for balance payments, by
  // balance_razorpay_order_id (avoids UNIQUE conflict on stripe_session_id).
  let bookingBefore = null
  {
    const { data: b1 } = await supabase
      .from('bookings')
      .select('*, package:packages(*, destination:destinations(*))')
      .eq('stripe_session_id', razorpayOrderId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (b1) {
      bookingBefore = b1
    } else {
      const { data: b2 } = await supabase
        .from('bookings')
        .select('*, package:packages(*, destination:destinations(*))')
        .eq('balance_razorpay_order_id', razorpayOrderId)
        .eq('user_id', user.id)
        .maybeSingle()
      bookingBefore = b2
    }
  }

  if (!bookingBefore) {
    return { error: 'Booking not found' }
  }

  const order = await razorpay.orders.fetch(razorpayOrderId)
  // Only credit a genuinely paid order — guards against confirming an order that
  // wasn't actually captured.
  if (order.status !== 'paid') {
    return { error: 'Payment not captured yet. Please wait a moment and refresh.' }
  }
  const paidAmount = Number(order.amount_paid ?? order.amount) || 0

  const res = await applyCapturedPaymentToBooking(
    supabase,
    bookingBefore,
    razorpayPaymentId,
    paidAmount,
    user,
  )

  revalidatePath('/bookings')
  return {
    success: true,
    confirmationCode: res.confirmationCode,
    bookingId: res.bookingId,
    fullyPaid: res.fullyPaid,
    balanceDuePaise: res.balanceDuePaise,
  }
}

/** Pay remaining balance for a community trip booked with token_to_book (second Razorpay order). */
/**
 * Open (creating if needed) the trip chat group for a package the caller has
 * booked, join them to it, and return the room id. The first booker to open it
 * effectively creates the group; later bookers join the same room. The host is
 * always a member; the room is named after the trip with the trip photo icon.
 */
export async function openTripChat(packageId: string) {
  const { supabase, user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }

  const { data: bk } = await supabase
    .from('bookings')
    .select('id')
    .eq('user_id', user.id)
    .eq('package_id', packageId)
    .in('status', ['pending', 'confirmed', 'completed'])
    .limit(1)
    .maybeSingle()
  if (!bk) return { error: 'Book this trip to access its group chat.' }

  const svc = createServiceRoleClient()
  const roomId = await ensureTripChatRoom(svc, packageId)
  if (!roomId) return { error: 'Could not open the trip chat. Please try again.' }
  await addTripChatMember(svc, roomId, user.id)
  return { roomId }
}

export async function createBookingBalanceOrder(bookingId: string) {
  const { supabase, user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, user_id, total_amount_paise, deposit_paise, status, balance_razorpay_order_id, package:packages(host_id, join_preferences)')
    .eq('id', bookingId)
    .eq('user_id', user.id)
    .single()

  if (!booking) return { error: 'Booking not found' }
  if (booking.status !== 'confirmed') return { error: 'Booking is not confirmed' }

  const pkg = booking.package as { host_id?: string | null; join_preferences?: unknown } | null
  const jp =
    pkg?.join_preferences && typeof pkg.join_preferences === 'object'
      ? (pkg.join_preferences as JoinPreferences)
      : null
  if (!pkg?.host_id || !isTokenDepositEnabled(jp)) {
    return { error: 'Balance payment is not available for this booking' }
  }

  const paid = booking.deposit_paise || 0
  const balance = booking.total_amount_paise - paid
  if (balance <= 0) return { error: 'Nothing to pay' }
  if (balance < RAZORPAY_MIN_PAISE) {
    return { error: 'Remaining balance is below the minimum online charge. Please contact support.' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, phone_number')
    .eq('id', user.id)
    .single()

  const prefill = {
    email: user.email || '',
    ...(profile?.phone_number ? {
      contact: profile.phone_number.startsWith('+91')
        ? profile.phone_number
        : `+91${profile.phone_number.replace(/\D/g, '').slice(-10)}`
    } : {}),
    name: profile?.full_name || '',
  }

  // Reuse an existing, still-unpaid balance order for the same amount so a
  // double-click or page re-open doesn't create (and risk charging) two orders. (BP4)
  if (booking.balance_razorpay_order_id) {
    try {
      const existing = await razorpay.orders.fetch(booking.balance_razorpay_order_id)
      if (existing && existing.status !== 'paid' && Number(existing.amount) === balance) {
        return {
          orderId: existing.id,
          amount: balance,
          currency: 'INR' as const,
          keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
          prefill,
          notes: { userId: user.id, bookingId },
        }
      }
    } catch {
      /* couldn't fetch the previous order — fall through and create a fresh one */
    }
  }

  const order = await razorpay.orders.create({
    amount: balance,
    currency: 'INR',
    receipt: `unsolo_balance_${Date.now()}`,
    notes: {
      userId: user.id,
      bookingId,
      balance: 'true',
    },
  })

  await supabase.from('bookings').update({ balance_razorpay_order_id: order.id }).eq('id', bookingId)

  return {
    orderId: order.id,
    amount: balance,
    currency: 'INR' as const,
    keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
    prefill,
    notes: {
      userId: user.id,
      bookingId,
    },
  }
}

export async function submitCustomDateRequest(
  packageId: string,
  requestedDate: string,
  guests: number,
  contactNumber: string,
  contactEmail: string,
) {
  const { supabase, user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (new Date(requestedDate) <= today) {
    return { error: 'Requested date must be in the future' }
  }
  const maxDate = new Date()
  maxDate.setFullYear(maxDate.getFullYear() + 2)
  if (new Date(requestedDate) > maxDate) {
    return { error: 'Requested date cannot be more than 2 years in the future' }
  }

  // Validate Indian phone number
  const digits = contactNumber.replace(/[\s\-\+]/g, '')
  const phone = digits.startsWith('91') && digits.length === 12 ? digits.slice(2) : digits
  if (phone.length !== 10 || !/^[6-9]\d{9}$/.test(phone)) {
    return { error: 'Invalid phone number. Must be 10 digits starting with 6-9.' }
  }

  const emailResult = customDateRequestEmailSchema.safeParse(contactEmail)
  if (!emailResult.success) {
    return { error: 'Invalid email address' }
  }
  const contactEmailNorm = emailResult.data

  const { error } = await supabase.from('custom_date_requests').insert({
    user_id: user.id,
    package_id: packageId,
    requested_date: requestedDate,
    guests,
    contact_number: phone,
    contact_email: contactEmailNorm,
  })

  if (error) return { error: error.message }

  // Send email notifications (non-blocking — don't fail the request)
  try {
    const { data: pkg } = await supabase
      .from('packages')
      .select('title')
      .eq('id', packageId)
      .single()

    const { sendAdminNotification, sendUserConfirmation } = await import('@/lib/resend/emails')
    const emailDetails = {
      packageTitle: pkg?.title || 'Unknown Package',
      requestedDate,
      guests,
      contactNumber: phone,
      contactEmail: contactEmailNorm,
    }
    await Promise.all([
      sendAdminNotification(emailDetails),
      sendUserConfirmation(emailDetails),
    ])
  } catch (emailErr) {
    console.error('Email notification failed:', emailErr)
  }

  return { success: true }
}

export async function getMyBookings() {
  const { supabase, user } = await getActionAuth()
  if (!user) return []

  const { data } = await supabase
    .from('bookings')
    .select('*, package:packages(*, destination:destinations(*))')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  return data || []
}

// ── Package Interest ────────────────────────────────────────

export async function toggleInterest(packageId: string) {
  const { supabase, user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }

  const since = new Date(Date.now() - 300_000).toISOString()
  const { count: recentAdds } = await supabase
    .from('package_interests')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', since)
  if ((recentAdds ?? 0) >= 40) {
    return { error: 'Too many interest updates. Please try again in a few minutes.' }
  }

  // Check if already interested
  const { data: existing } = await supabase
    .from('package_interests')
    .select('id')
    .eq('package_id', packageId)
    .eq('user_id', user.id)
    .single()

  if (existing) {
    await supabase.from('package_interests').delete().eq('id', existing.id)
    return { interested: false }
  } else {
    await supabase.from('package_interests').insert({ package_id: packageId, user_id: user.id })

    // Notify host (community trip) or admins (UnSOLO trip)
    try {
      const { data: pkg } = await supabase.from('packages').select('host_id, title').eq('id', packageId).single()
      const { data: interestedUser } = await supabase.from('profiles').select('full_name, username').eq('id', user.id).single()
      const name = interestedUser?.full_name || interestedUser?.username || 'Someone'

      const { createClient: createSC } = await import('@supabase/supabase-js')
      const svcSupabase = createSC(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

      if (pkg?.host_id && pkg.host_id !== user.id) {
        // Community trip — notify host
        await svcSupabase.from('notifications').insert({
          user_id: pkg.host_id,
          type: 'group_invite',
          title: 'New Interest!',
          body: `${name} is interested in "${pkg.title}"`,
          link: `/host`,
        })
      } else if (!pkg?.host_id) {
        // UnSOLO trip — notify admins
        const { data: admins } = await svcSupabase.from('profiles').select('id').in('role', ['admin'])
        for (const admin of admins || []) {
          await svcSupabase.from('notifications').insert({
            user_id: admin.id,
            type: 'group_invite',
            title: 'New Interest!',
            body: `${name} is interested in "${pkg?.title}"`,
            link: '/admin/packages',
          })
        }
      }
    } catch { /* non-critical */ }

    return { interested: true }
  }
}

export async function getInterestData(packageId: string) {
  const { supabase, user } = await getActionAuth()

  const { count } = await supabase
    .from('package_interests')
    .select('*', { count: 'exact', head: true })
    .eq('package_id', packageId)

  let isInterested = false
  if (user) {
    const { data } = await supabase
      .from('package_interests')
      .select('id')
      .eq('package_id', packageId)
      .eq('user_id', user.id)
      .single()
    isInterested = !!data
  }

  return { count: count || 0, isInterested }
}

export type InterestedUser = {
  id: string
  username: string
  full_name: string | null
  avatar_url: string | null
}

/** Full list of users interested in a package — for the "+N more" drawer. */
export async function getInterestedUsers(packageId: string): Promise<InterestedUser[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('package_interests')
    .select('user:profiles(id, username, full_name, avatar_url), created_at')
    .eq('package_id', packageId)
    .order('created_at', { ascending: false })
    .limit(200)
  return ((data || [])
    .map(r => r.user as unknown as InterestedUser | null)
    .filter(Boolean) as InterestedUser[])
}

// ── Date Change (only for pending bookings) ─────────────────
export async function changeBookingDate(bookingId: string, newDate: string) {
  const { supabase, user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }

  // Verify booking belongs to user and is pending
  const { data: booking } = await supabase
    .from('bookings')
    .select('status')
    .eq('id', bookingId)
    .eq('user_id', user.id)
    .single()

  if (!booking) return { error: 'Booking not found' }
  if (booking.status !== 'pending') return { error: 'Can only change dates for pending bookings' }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (new Date(newDate) <= today) return { error: 'Date must be in the future' }

  const { error } = await supabase
    .from('bookings')
    .update({ travel_date: newDate, updated_at: new Date().toISOString() })
    .eq('id', bookingId)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/bookings')
  return { success: true }
}

// ── Cancel before payment (pending only) — no admin review queue ─────────
export async function cancelPendingBooking(bookingId: string, reason?: string) {
  const { supabase, user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, status, package_id, package:packages(title, host_id, slug)')
    .eq('id', bookingId)
    .eq('user_id', user.id)
    .single()

  if (!booking) return { error: 'Booking not found' }
  if (booking.status === 'cancelled') return { error: 'Already cancelled' }
  if (booking.status !== 'pending') {
    return {
      error:
        'Only bookings that have not completed payment can be cancelled here. For confirmed trips, use request cancellation.',
    }
  }

  const trimmed = reason?.trim() || null

  const { error } = await supabase
    .from('bookings')
    .update({
      status: 'cancelled',
      cancellation_reason: trimmed,
      updated_at: new Date().toISOString(),
    })
    .eq('id', bookingId)
    .eq('user_id', user.id)
    .eq('status', 'pending')

  if (error) return { error: error.message }

  try {
    const { removeUserFromPackageTripChat } = await import('@/lib/chat/tripChatMembership')
    await removeUserFromPackageTripChat(supabase, user.id, booking.package_id)
  } catch {
    /* non-critical */
  }

  const pkg = booking.package as { title?: string; host_id?: string | null }
  const pkgTitle = pkg?.title || 'a trip'

  const { data: customerProfile } = await supabase
    .from('profiles')
    .select('full_name, username')
    .eq('id', user.id)
    .single()
  const customerName = customerProfile?.full_name || customerProfile?.username || 'A traveler'

  const { createClient: createSC } = await import('@supabase/supabase-js')
  const svc = createSC(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  if (pkg?.host_id) {
    await svc.from('notifications').insert({
      user_id: pkg.host_id,
      type: 'booking',
      title: 'Booking cancelled before payment',
      body: `${customerName} cancelled an unpaid booking for "${pkgTitle}".${trimmed ? ` Reason: ${trimmed}` : ''}`,
      link: '/host',
    })
  }

  const { data: staff } = await svc
    .from('profiles')
    .select('id')
    .in('role', ['admin', 'social_media_manager', 'field_person', 'chat_responder'])

  for (const row of staff || []) {
    await svc.from('notifications').insert({
      user_id: row.id,
      type: 'booking',
      title: 'Booking cancelled (unpaid)',
      body: `${customerName} cancelled a pending booking for ${pkgTitle} before payment.`,
      link: '/admin/bookings',
    })
  }

  revalidatePath('/bookings')
  return { success: true as const }
}

/** PostgREST when `user_dismissed_at` is missing from DB or API schema cache (migration 068 not applied / stale). */
function isMissingUserDismissedColumnError(err: { message?: string; code?: string } | null): boolean {
  if (!err?.message) return false
  const m = err.message.toLowerCase()
  if (!m.includes('user_dismissed_at')) return false
  return (
    m.includes('schema cache') ||
    m.includes('does not exist') ||
    m.includes('could not find') ||
    err.code === 'PGRST204'
  )
}

/** Hide a service booking from My Trips after abandoning checkout, or clear a cancelled row. Cancels unpaid rows first. */
export async function dismissServiceBookingFromMyTrips(bookingId: string) {
  const { supabase, user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }

  const { data: row } = await supabase
    .from('bookings')
    .select('id, status, booking_type')
    .eq('id', bookingId)
    .eq('user_id', user.id)
    .single()

  if (!row) return { error: 'Booking not found' }
  if (row.booking_type !== 'service') {
    return { error: 'Only service bookings can be removed this way' }
  }
  if (row.status !== 'pending' && row.status !== 'cancelled') {
    return { error: 'This booking can’t be removed from your list' }
  }

  if (row.status === 'pending') {
    const cancel = await cancelPendingBooking(
      bookingId,
      'Removed from My Trips after payment was not completed',
    )
    if (cancel && 'error' in cancel && cancel.error) {
      return cancel
    }
  }

  const { error } = await supabase
    .from('bookings')
    .update({
      user_dismissed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', bookingId)
    .eq('user_id', user.id)

  if (error) {
    if (isMissingUserDismissedColumnError(error)) {
      revalidatePath('/bookings')
      return { success: true as const, dismissedWithoutColumn: true as const }
    }
    return { error: error.message }
  }
  revalidatePath('/bookings')
  return { success: true as const }
}

// ── Cancellation Request ────────────────────────────────────
export async function requestCancellation(bookingId: string, reason: string) {
  const { supabase, user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }

  const { data: booking } = await supabase
    .from('bookings')
    .select('status, package:packages(title)')
    .eq('id', bookingId)
    .eq('user_id', user.id)
    .single()

  if (!booking) return { error: 'Booking not found' }
  if (booking.status === 'cancelled') return { error: 'Already cancelled' }
  if (booking.status === 'completed') return { error: 'Cannot cancel a completed trip' }
  if (booking.status === 'pending') {
    return { error: 'Unpaid bookings can be cancelled directly — use cancel booking instead of request cancellation.' }
  }

  const { error } = await supabase
    .from('bookings')
    .update({
      cancellation_status: 'requested',
      cancellation_reason: reason,
      cancellation_requested_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', bookingId)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  // Get customer name for notification
  const { data: customerProfile } = await supabase
    .from('profiles')
    .select('full_name, username')
    .eq('id', user.id)
    .single()
  const customerName = customerProfile?.full_name || customerProfile?.username || 'A user'

  // Notify ALL admins and staff using service role (bypasses RLS)
  const { createClient: createServiceClient } = await import('@supabase/supabase-js')
  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: admins } = await serviceSupabase
    .from('profiles')
    .select('id')
    .in('role', ['admin', 'social_media_manager', 'field_person', 'chat_responder'])

  const pkgTitle = (booking.package as unknown as { title: string })?.title || 'a trip'
  for (const admin of admins || []) {
    await serviceSupabase.from('notifications').insert({
      user_id: admin.id,
      type: 'booking',
      title: 'Cancellation Request',
      body: `${customerName} requested cancellation for ${pkgTitle}. Review and take action.`,
      link: '/admin/bookings',
    })
  }

  revalidatePath('/bookings')
  return { success: true }
}

export type RazorpayRefundBookingResult =
  | { ok: true; refundId?: string; skipped?: boolean; needsManualRefund?: boolean }
  | { ok: false; error: string }

/**
 * Call Razorpay refund API and mark booking refund as processing. Uses service role (no user session required).
 * Idempotent when refund_status is already processing or completed.
 */
export async function initiateRazorpayRefundForBooking(
  bookingId: string,
  options?: { skipCustomerNotification?: boolean },
): Promise<RazorpayRefundBookingResult> {
  const svc = await createServiceClient()
  // select('*') (not an explicit column list) so this stays resilient if the
  // razorpay_payment_ids column (migration 090) hasn't been applied yet — it just
  // reads as undefined and the legacy single-payment path is used.
  const { data: booking } = await svc
    .from('bookings')
    .select('*, package:packages(title)')
    .eq('id', bookingId)
    .single()

  if (!booking) return { ok: false, error: 'Booking not found' }
  if (!booking.stripe_payment_intent || !booking.refund_amount_paise || booking.refund_amount_paise <= 0) {
    return { ok: true, skipped: true, needsManualRefund: true }
  }
  if (booking.refund_status === 'processing' || booking.refund_status === 'completed') {
    return { ok: true, skipped: true }
  }

  try {
    const payments = Array.isArray(booking.razorpay_payment_ids)
      ? (booking.razorpay_payment_ids as Array<{ id: string; amount: number }>)
      : []
    let primaryRefundId: string | null = null

    if (payments.length > 0) {
      // Multi-payment booking (token + balance): allocate the refund across the
      // captured payments, since each can only be refunded against its own capture. (BP3)
      const alloc = await refundAcrossPayments(payments, booking.refund_amount_paise, {
        booking_id: bookingId,
        reason: 'Cancellation refund',
      })
      if (!alloc.ok) {
        const pkgTitle = (booking.package as unknown as { title: string })?.title || 'Booking'
        await notifyAdminsRazorpayRefundFailed(svc, {
          bookingId,
          tripTitle: pkgTitle,
          refundAmountPaise: booking.refund_amount_paise,
          errorDescription: alloc.error,
        })
        return { ok: false, error: alloc.error }
      }
      primaryRefundId = alloc.refundIds[0] ?? null
    } else {
      // Legacy single-payment path (unchanged behaviour).
      const response = await fetch(
        `https://api.razorpay.com/v1/payments/${booking.stripe_payment_intent}/refund`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')}`,
          },
          body: JSON.stringify({
            amount: booking.refund_amount_paise,
            notes: { booking_id: bookingId, reason: 'Cancellation refund' },
          }),
        },
      )

      const result = (await response.json()) as { id?: string; error?: { description?: string } }

      if (!response.ok) {
        const errMsg = result.error?.description || 'Razorpay refund failed'
        const pkgTitle = (booking.package as unknown as { title: string })?.title || 'Booking'
        await notifyAdminsRazorpayRefundFailed(svc, {
          bookingId,
          tripTitle: pkgTitle,
          refundAmountPaise: booking.refund_amount_paise,
          errorDescription: errMsg,
        })
        return { ok: false, error: errMsg }
      }
      primaryRefundId = result.id ?? null
    }

    await svc
      .from('bookings')
      .update({
        refund_status: 'processing',
        refund_razorpay_id: primaryRefundId,
        refund_initiated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId)

    await upsertBookingRefund(svc, {
      bookingId,
      amountPaise: booking.refund_amount_paise,
      method: 'razorpay',
      status: 'processing',
      gatewayRefundId: primaryRefundId,
    })

    if (!options?.skipCustomerNotification) {
      const pkgTitle = (booking.package as unknown as { title: string })?.title || 'your trip'
      const refundFormatted = `₹${(booking.refund_amount_paise / 100).toLocaleString('en-IN')}`
      await svc.from('notifications').insert({
        user_id: booking.user_id,
        type: 'booking',
        title: 'Refund Initiated',
        body: `Refund of ${refundFormatted} for ${pkgTitle} has been initiated. It will reach your account in 5-7 business days.`,
        link: '/bookings',
      })
    }

    revalidatePath('/admin/bookings')
    revalidatePath('/bookings')
    return { ok: true, refundId: primaryRefundId ?? undefined }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    const pkgTitle = (booking.package as unknown as { title: string })?.title || 'Booking'
    await notifyAdminsRazorpayRefundFailed(svc, {
      bookingId,
      tripTitle: pkgTitle,
      refundAmountPaise: booking.refund_amount_paise,
      errorDescription: msg,
    })
    return { ok: false, error: `Refund failed: ${msg}` }
  }
}

export type ConfirmTravelerCancellationResult =
  | {
      success: true
      refundPaise: number
      autoRefundInitiated: boolean
      needsManualRefund: boolean
      refundError?: string
    }
  | { error: string }

/**
 * Confirmed paid booking: policy-based refund estimate, immediate cancel, host split, optional Razorpay refund.
 */
export async function confirmTravelerCancellation(
  bookingId: string,
  reason: string,
): Promise<ConfirmTravelerCancellationResult> {
  const { supabase, user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }

  const trimmed = reason.trim()
  if (!trimmed) return { error: 'Please provide a reason for cancellation.' }

  const svc = await createServiceClient()
  const { data: booking } = await svc
    .from('bookings')
    .select(
      'id, user_id, status, cancellation_status, total_amount_paise, deposit_paise, stripe_payment_intent, package_id, package:packages(title, host_id)',
    )
    .eq('id', bookingId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!booking) return { error: 'Booking not found' }
  if (booking.status === 'cancelled') return { error: 'This booking is already cancelled.' }
  if (booking.status !== 'confirmed') {
    return { error: 'Only confirmed bookings can be cancelled here.' }
  }
  if (booking.cancellation_status === 'requested') {
    return {
      error:
        'You already have a cancellation request under review. We will notify you when it is processed.',
    }
  }
  if (
    booking.cancellation_status === 'approved' ||
    booking.cancellation_status === 'self_service'
  ) {
    return { error: 'This booking cannot be cancelled again.' }
  }

  const { quoteCancellationRefund, applyRefundSplitToEarningSystem } = await import(
    '@/actions/cancellation-refund'
  )
  const quote = await quoteCancellationRefund(bookingId)
  if ('error' in quote) return { error: quote.error }

  // Net refund = tier amount (capped at paid) minus non-refundable gateway charges.
  const refundPaise = quote.netRefundPaise
  const tierPercent = quote.tierPercent

  const { data: updated, error: upError } = await svc
    .from('bookings')
    .update({
      status: 'cancelled',
      cancellation_status: 'self_service',
      cancellation_reason: trimmed,
      cancellation_requested_at: new Date().toISOString(),
      refund_amount_paise: refundPaise,
      refund_note: 'Traveler self-service cancellation per policy.',
      refund_status: refundPaise > 0 ? 'pending' : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', bookingId)
    .eq('user_id', user.id)
    .eq('status', 'confirmed')
    .select('id')
    .maybeSingle()

  if (upError) return { error: upError.message }
  if (!updated) {
    return { error: 'Could not cancel — booking may have changed. Refresh and try again.' }
  }

  // The whole booking is now cancelled — supersede any still-pending partial
  // cancellation requests so they can't later be approved against a dead booking.
  // (Uses the service-role client: the booker has no UPDATE right under RLS.)
  try {
    const svcRole = createServiceRoleClient()
    await svcRole
      .from('booking_partial_cancellations')
      .update({ status: 'denied', admin_note: 'Superseded by full booking cancellation', processed_at: new Date().toISOString() })
      .eq('booking_id', bookingId)
      .eq('status', 'requested')
  } catch { /* non-critical */ }

  if (refundPaise > 0) {
    const splitRes = await applyRefundSplitToEarningSystem(bookingId, tierPercent, refundPaise)
    if (!splitRes.ok) {
      console.error('applyRefundSplitToEarningSystem failed', splitRes.error)
    }
  }

  const pkgTitle = (booking.package as unknown as { title: string })?.title || 'your trip'

  if (booking.package_id) {
    try {
      const { removeUserFromPackageTripChat } = await import('@/lib/chat/tripChatMembership')
      await removeUserFromPackageTripChat(svc, user.id, booking.package_id)
    } catch {
      /* non-critical */
    }
  }

  const { data: customerProfile } = await svc
    .from('profiles')
    .select('full_name, username, email')
    .eq('id', user.id)
    .single()
  const customerName = customerProfile?.full_name || customerProfile?.username || 'A traveler'

  await svc.from('notifications').insert({
    user_id: user.id,
    type: 'booking',
    title: 'Booking cancelled',
    body:
      refundPaise > 0
        ? `Your booking for ${pkgTitle} was cancelled. Refund of ₹${(refundPaise / 100).toLocaleString('en-IN')} is being processed per our policy.`
        : `Your booking for ${pkgTitle} was cancelled. No refund applies under the current policy window.`,
    link: '/bookings',
  })

  const pkgHostId = (booking.package as { host_id?: string | null } | null)?.host_id
  if (pkgHostId) {
    const refundLineHost =
      refundPaise > 0
        ? `Traveler refund (policy): ₹${(refundPaise / 100).toLocaleString('en-IN')}`
        : 'No refund to traveler under the current policy window.'
    const reasonSnippet =
      trimmed.length > 160 ? `${trimmed.slice(0, 160)}…` : trimmed
    await svc.from('notifications').insert({
      user_id: pkgHostId,
      type: 'booking',
      title: 'Traveler cancelled booking',
      body: `${customerName} cancelled a confirmed booking for "${pkgTitle}". ${refundLineHost}.${trimmed ? ` Reason: ${reasonSnippet}` : ''}`,
      link: '/host',
    })
    try {
      const { data: hostProf } = await svc
        .from('profiles')
        .select('email, full_name')
        .eq('id', pkgHostId)
        .maybeSingle()
      if (hostProf?.email?.trim()) {
        const { sendHostTravelerCancelledBookingEmail } = await import('@/lib/resend/emails')
        const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://unsolo.in'
        await sendHostTravelerCancelledBookingEmail({
          to: hostProf.email,
          hostName: hostProf.full_name,
          travelerName: customerName,
          tripTitle: pkgTitle,
          refundSummaryLine:
            refundPaise > 0
              ? `₹${(refundPaise / 100).toLocaleString('en-IN')} (per policy)`
              : 'No refund under the current policy window.',
          reason: trimmed,
          hostDashboardUrl: `${site}/host`,
        }).catch(() => null)
      }
    } catch {
      /* non-critical */
    }
  }

  const { data: staff } = await svc
    .from('profiles')
    .select('id')
    .in('role', ['admin', 'social_media_manager', 'field_person', 'chat_responder'])

  const refundRupee = (refundPaise / 100).toLocaleString('en-IN')
  for (const row of staff || []) {
    await svc.from('notifications').insert({
      user_id: row.id,
      type: 'booking',
      title: 'Self-service cancellation',
      body: `${customerName} cancelled ${pkgTitle}. Refund ₹${refundRupee} — check admin bookings for Razorpay status.`,
      link: '/admin/bookings',
    })
  }

  if (customerProfile?.email) {
    const { sendTravelerSelfCancellationEmail } = await import('@/lib/resend/emails')
    await sendTravelerSelfCancellationEmail({
      to: customerProfile.email,
      travelerName: customerProfile.full_name ?? '',
      tripTitle: pkgTitle,
      refundPaise,
      bookingsUrl: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://unsolo.in'}/bookings`,
    }).catch(() => null)
  }

  try {
    const { logAuditEvent } = await import('@/actions/admin')
    await logAuditEvent(user.id, 'cancellation_self_service', 'booking', bookingId, {
      refundPaise,
      tierPercent,
    })
  } catch {
    /* non-critical */
  }

  let autoRefundInitiated = false
  let needsManualRefund = refundPaise > 0 && !booking.stripe_payment_intent
  let refundError: string | undefined

  if (refundPaise > 0 && booking.stripe_payment_intent) {
    const refundRes = await initiateRazorpayRefundForBooking(bookingId, {
      skipCustomerNotification: true,
    })
    if (refundRes.ok && refundRes.refundId) {
      autoRefundInitiated = true
      const refundFormatted = `₹${(refundPaise / 100).toLocaleString('en-IN')}`
      await svc.from('notifications').insert({
        user_id: user.id,
        type: 'booking',
        title: 'Refund initiated',
        body: `Refund of ${refundFormatted} for ${pkgTitle} has been started to your original payment method. Timelines depend on your bank (often 1–7 business days).`,
        link: '/bookings',
      })
    } else if (refundRes.ok && refundRes.needsManualRefund) {
      needsManualRefund = true
    } else if (!refundRes.ok) {
      refundError = refundRes.error
      needsManualRefund = true
    }
  }

  revalidatePath('/bookings')
  revalidatePath('/admin/bookings')
  return {
    success: true,
    refundPaise,
    autoRefundInitiated,
    needsManualRefund,
    refundError,
  }
}

/** Recompute the coupon portion of a discount for a given booking amount. 0 if no offer. */
async function couponDiscountForOffer(
  svc: ReturnType<typeof createServiceRoleClient>,
  offerId: string | null | undefined,
  amount: PromoAmountContext,
): Promise<number> {
  if (!offerId) return 0
  const { data: offer } = await svc
    .from('discount_offers')
    .select('discount_kind, discount_paise, discount_percent, discount_percent_cap_paise, free_guest_count, free_guests_min_group')
    .eq('id', offerId)
    .maybeSingle()
  if (!offer) return 0
  return computeDiscountPaise(specFromRow(offer as never), amount)
}

/**
 * Admin/staff changes (or removes) the coupon/offer on a booking. Re-derives the
 * discount against the booking's CURRENT gross/per-unit/guests — so a free-guests or
 * percent coupon is sized correctly — preserves any non-coupon discount (e.g.
 * referral), and recomputes the total / balance. Does not move money. Pass an empty
 * code to remove the coupon.
 */
export async function adminSetBookingCoupon(bookingId: string, promoCode: string | null) {
  const { user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }
  const svc = createServiceRoleClient()
  const { data: profile } = await svc.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'super_admin', 'social_media_manager', 'field_person', 'chat_responder'].includes(profile.role)) {
    return { error: 'Unauthorized' }
  }

  const { data: booking } = await svc
    .from('bookings')
    .select('*, package:packages(id, title, price_paise, price_variants, host_id), service_listing:service_listings(id, title, type, price_paise, price_variants, host_id)')
    .eq('id', bookingId)
    .single()
  if (!booking) return { error: 'Booking not found' }
  if (booking.status === 'cancelled') return { error: 'Cannot change the coupon on a cancelled booking.' }

  const isPackage = !!booking.package_id
  const source = isPackage
    ? (booking.package as { price_paise?: number; price_variants?: unknown; host_id?: string | null; type?: string } | null)
    : (booking.service_listing as { price_paise?: number; price_variants?: unknown; host_id?: string | null; type?: string } | null)

  const gross = (booking.gross_paise ?? (booking.total_amount_paise || 0) + (booking.discount_paise || 0)) || 0
  const qty = booking.guests || booking.quantity || 1
  const variants = parsePriceVariants(source?.price_variants)
  const matched = variants?.find((v) => v.description === booking.price_variant_label)
  const unit = matched?.price_paise ?? source?.price_paise ?? Math.round(gross / Math.max(1, qty))
  const amount: PromoAmountContext = { grossPaise: gross, unitPricePaise: unit, quantity: qty }

  // The non-coupon part of the existing discount (e.g. referral) is kept.
  const oldCoupon = await couponDiscountForOffer(svc, booking.promo_offer_id, amount)
  const nonCoupon = Math.max(0, (booking.discount_paise || 0) - oldCoupon)

  let newOfferId: string | null = null
  let newCoupon = 0
  let label = ''
  const code = (promoCode || '').trim()
  if (code) {
    const context: PromoScopeContext = isPackage
      ? { listingType: 'trips', packageId: booking.package_id, hostId: source?.host_id ?? null }
      : { listingType: (source?.type as PromoScopeContext['listingType']) || 'stays', serviceListingId: booking.service_listing_id, hostId: source?.host_id ?? null }
    const res = await validateScopedPromoCode(svc, code, context, amount)
    if ('error' in res) return { error: res.error }
    newOfferId = res.offerId
    newCoupon = res.discountPaise
    label = res.name
  }

  const deposit = booking.deposit_paise || 0
  const { discountPaise: newDiscount, totalPaise: newTotal, balanceDuePaise, overpaidPaise } =
    computeBookingTotals({ grossPaise: gross, discountPaise: newCoupon + nonCoupon, collectedPaise: deposit })

  const { error: upErr } = await svc
    .from('bookings')
    .update({
      promo_offer_id: newOfferId,
      discount_paise: newDiscount,
      total_amount_paise: newTotal,
      payment_status: balanceDuePaise <= 0 ? 'paid' : 'pending',
      updated_at: new Date().toISOString(),
    })
    .eq('id', bookingId)
  if (upErr) return { error: upErr.message }

  const pkgTitle = ((booking.package as { title?: string } | null)?.title)
    || ((booking.service_listing as { title?: string } | null)?.title)
    || 'your booking'
  await svc.from('notifications').insert({
    user_id: booking.user_id,
    type: 'booking',
    title: 'Booking updated',
    body: code
      ? `An offer (${label || code}) was applied to "${pkgTitle}". New total ₹${(newTotal / 100).toLocaleString('en-IN')}${balanceDuePaise > 0 ? `, balance ₹${(balanceDuePaise / 100).toLocaleString('en-IN')}` : ' (fully paid)'}${overpaidPaise > 0 ? `, ₹${(overpaidPaise / 100).toLocaleString('en-IN')} overpaid — refund due` : ''}.`
      : `The offer on "${pkgTitle}" was removed. New total ₹${(newTotal / 100).toLocaleString('en-IN')}${balanceDuePaise > 0 ? `, balance ₹${(balanceDuePaise / 100).toLocaleString('en-IN')}` : ''}.`,
    link: '/bookings',
  })

  try {
    const { logAuditEvent } = await import('@/actions/admin')
    await logAuditEvent(user.id, 'UPDATE_BOOKING_COUPON', 'booking', bookingId, { promoCode: code || null, offerId: newOfferId, discountPaise: newDiscount, newTotalPaise: newTotal })
  } catch { /* non-critical */ }

  revalidatePath('/bookings'); revalidatePath('/admin/bookings'); revalidatePath('/host')
  return { success: true, discountPaise: newDiscount, totalPaise: newTotal, balanceDuePaise, overpaidPaise, label: label || null }
}

/**
 * Admin/staff changes the price tier (variant) of a booking — for package trips or
 * service listings — and recomputes the net payable. The customer's coupon/offer is
 * re-derived against the new price (a free-guests/percent coupon resizes correctly);
 * any non-coupon discount is preserved. The gross is rescaled by the per-unit price
 * ratio so guests/quantity/nights are preserved. Does not move money: deposit stays;
 * the balance (or overpayment) is recomputed and shown to customer + admin/host.
 */
export async function adminUpdateBookingPriceTier(bookingId: string, variantIndex: number) {
  const { user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }

  const svc = createServiceRoleClient()

  const { data: booking } = await svc
    .from('bookings')
    .select('*, package:packages(id, title, host_id, price_paise, price_variants), service_listing:service_listings(id, title, host_id, price_paise, price_variants)')
    .eq('id', bookingId)
    .single()
  if (!booking) return { error: 'Booking not found' }

  // Staff may re-tier any booking; the trip/service host may re-tier their own
  // (so the change-request approval can run as either).
  const { data: profile } = await svc.from('profiles').select('role').eq('id', user.id).single()
  const isStaff = !!profile && ['admin', 'super_admin', 'social_media_manager', 'field_person', 'chat_responder'].includes(profile.role)
  const hostId = ((booking.package as { host_id?: string | null } | null)?.host_id)
    ?? ((booking.service_listing as { host_id?: string | null } | null)?.host_id)
    ?? null
  const isHost = !!hostId && hostId === user.id
  if (!isStaff && !isHost) return { error: 'Unauthorized' }

  if (booking.status === 'cancelled') return { error: 'Cannot re-tier a cancelled booking.' }

  const source = booking.package_id
    ? (booking.package as { price_paise?: number; price_variants?: unknown } | null)
    : (booking.service_listing as { price_paise?: number; price_variants?: unknown } | null)
  const variants = parsePriceVariants(source?.price_variants)
  if (!variants) return { error: 'This booking has no selectable price tiers.' }
  if (variantIndex < 0 || variantIndex >= variants.length) return { error: 'Invalid price tier.' }

  const newVariant = variants[variantIndex]
  const newUnit = newVariant.price_paise
  const matched = variants.find((v) => v.description === booking.price_variant_label)
  const oldGross = (booking.gross_paise ?? (booking.total_amount_paise || 0) + (booking.discount_paise || 0)) || 0
  const qty = booking.guests || booking.quantity || 1

  // New gross:
  //  - Package trips: per-person × guests, computed DIRECTLY from the chosen tier.
  //    (The old ratio approach inflated totals when the prior per-unit price was
  //    misresolved — e.g. 9,600 × 10,100/8,500 = 11,407. This is exact.)
  //  - Service listings: rescale by the per-unit price ratio so quantity / nights /
  //    weekend structure is preserved.
  let newGross: number
  let oldUnitForCoupon: number
  if (booking.package_id) {
    newGross = newUnit * (booking.guests || 1)
    oldUnitForCoupon = matched?.price_paise ?? source?.price_paise ?? (qty > 0 ? Math.round(oldGross / qty) : oldGross)
  } else {
    const oldUnit = matched?.price_paise ?? source?.price_paise ?? (qty > 0 ? Math.round(oldGross / qty) : oldGross)
    newGross = Math.round(oldGross * (newUnit / Math.max(1, oldUnit)))
    oldUnitForCoupon = oldUnit
  }

  // Re-derive the coupon discount against the NEW price (a free-guests / percent
  // coupon resizes with the tier); any non-coupon discount (e.g. referral) is kept.
  const oldCoupon = await couponDiscountForOffer(svc, booking.promo_offer_id, { grossPaise: oldGross, unitPricePaise: oldUnitForCoupon, quantity: qty })
  const nonCoupon = Math.max(0, (booking.discount_paise || 0) - oldCoupon)
  const newCoupon = await couponDiscountForOffer(svc, booking.promo_offer_id, { grossPaise: newGross, unitPricePaise: newUnit, quantity: qty })

  const res = recalcBookingTierTotals({
    newGrossPaise: newGross,
    discountPaise: newCoupon + nonCoupon,
    depositPaise: booking.deposit_paise || 0,
  })

  const update: Record<string, unknown> = {
    price_variant_label: newVariant.description,
    gross_paise: res.newGrossPaise,
    discount_paise: res.discountKeptPaise,
    total_amount_paise: res.newTotalPaise,
    updated_at: new Date().toISOString(),
  }
  // Keep payment_status coherent with the new balance.
  // (Allowed values: 'pending' | 'paid' | 'failed' | 'refunded' — there is no 'partial'.)
  if (res.balanceDuePaise <= 0) update.payment_status = 'paid'
  else update.payment_status = 'pending'

  const { error: upErr } = await svc.from('bookings').update(update).eq('id', bookingId)
  if (upErr) return { error: upErr.message }

  const pkgTitle = ((booking.package as { title?: string } | null)?.title)
    || ((booking.service_listing as { title?: string } | null)?.title)
    || 'your booking'

  await svc.from('notifications').insert({
    user_id: booking.user_id,
    type: 'booking',
    title: 'Booking updated',
    body: res.overpaidPaise > 0
      ? `Your "${pkgTitle}" was changed to "${newVariant.description}". New total ₹${(res.newTotalPaise / 100).toLocaleString('en-IN')}. You have overpaid ₹${(res.overpaidPaise / 100).toLocaleString('en-IN')} — our team will arrange a refund.`
      : `Your "${pkgTitle}" was changed to "${newVariant.description}". New total ₹${(res.newTotalPaise / 100).toLocaleString('en-IN')}${res.balanceDuePaise > 0 ? `, balance due ₹${(res.balanceDuePaise / 100).toLocaleString('en-IN')}` : ' (fully paid)'}.`,
    link: '/bookings',
  })

  try {
    const { logAuditEvent } = await import('@/actions/admin')
    await logAuditEvent(user.id, 'UPDATE_BOOKING_PRICE_TIER', 'booking', bookingId, {
      tier: newVariant.description,
      newGrossPaise: res.newGrossPaise,
      newTotalPaise: res.newTotalPaise,
      balanceDuePaise: res.balanceDuePaise,
      overpaidPaise: res.overpaidPaise,
    })
  } catch { /* non-critical */ }

  revalidatePath('/bookings')
  revalidatePath('/admin/bookings')
  revalidatePath('/host')
  return {
    success: true,
    label: newVariant.description,
    newGrossPaise: res.newGrossPaise,
    newTotalPaise: res.newTotalPaise,
    balanceDuePaise: res.balanceDuePaise,
    overpaidPaise: res.overpaidPaise,
  }
}

/**
 * Refund an overpayment on an ACTIVE booking (e.g. after an admin lowered the price
 * tier so the customer has paid more than the new total). Refunds `deposit − total`
 * across the captured payments and reduces deposit to match — the booking stays
 * active. Deliberately does NOT touch the cancellation fields
 * (refund_status / refund_amount_paise / refund_razorpay_id) so it can't be confused
 * with a cancellation refund.
 */
export async function refundBookingOverpayment(bookingId: string) {
  const { user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }
  const svc = createServiceRoleClient()
  const { data: profile } = await svc.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'super_admin', 'social_media_manager', 'field_person', 'chat_responder'].includes(profile.role)) {
    return { error: 'Unauthorized' }
  }

  const { data: booking } = await svc
    .from('bookings')
    .select('*, package:packages(title), service_listing:service_listings(title)')
    .eq('id', bookingId)
    .single()
  if (!booking) return { error: 'Booking not found' }

  const total = booking.total_amount_paise || 0
  const deposit = booking.deposit_paise || 0
  const overpaid = Math.max(0, deposit - total)
  if (overpaid <= 0) return { error: 'This booking has no overpayment to refund.' }

  const title = ((booking.package as { title?: string } | null)?.title)
    || ((booking.service_listing as { title?: string } | null)?.title)
    || 'your booking'
  const payments = Array.isArray(booking.razorpay_payment_ids)
    ? (booking.razorpay_payment_ids as Array<{ id: string; amount: number }>)
    : []

  // Optimistic lock on deposit so a double-click can't refund twice.
  const settle = async () => {
    const { data: updated } = await svc
      .from('bookings')
      .update({ deposit_paise: total, updated_at: new Date().toISOString() })
      .eq('id', bookingId)
      .eq('deposit_paise', deposit)
      .select('id')
      .maybeSingle()
    return !!updated
  }

  // No online payment to refund against → record the adjustment; team refunds offline.
  if (payments.length === 0 && !booking.stripe_payment_intent) {
    if (!(await settle())) return { error: 'Booking changed — refresh and try again.' }
    await svc.from('notifications').insert({
      user_id: booking.user_id,
      type: 'booking',
      title: 'Refund being processed',
      body: `A refund of ₹${(overpaid / 100).toLocaleString('en-IN')} for "${title}" will be processed to your original payment method.`,
      link: '/bookings',
    })
    revalidatePath('/bookings'); revalidatePath('/admin/bookings'); revalidatePath('/host')
    return { success: true, manual: true, refundedPaise: overpaid }
  }

  const refundList = payments.length > 0 ? payments : [{ id: booking.stripe_payment_intent as string, amount: overpaid }]
  const alloc = await refundAcrossPayments(refundList, overpaid, {
    booking_id: bookingId,
    reason: 'Overpayment refund (price tier change)',
  })
  if (!alloc.ok) return { error: alloc.error }

  if (!(await settle())) return { error: 'Refund issued but the booking changed meanwhile — verify the deposit and adjust manually if needed.' }

  await svc.from('notifications').insert({
    user_id: booking.user_id,
    type: 'booking',
    title: 'Refund initiated',
    body: `A refund of ₹${(overpaid / 100).toLocaleString('en-IN')} for "${title}" has been initiated to your original payment method. It reaches your account in 5–7 business days.`,
    link: '/bookings',
  })

  // Receipt email — call the builder directly (not the recorder) so this doesn't
  // touch the cancellation refund_email_sent_at tracking.
  try {
    const { data: prof } = await svc.from('profiles').select('email, full_name').eq('id', booking.user_id).maybeSingle()
    if (prof?.email?.trim()) {
      const { sendRefundProcessedEmail } = await import('@/lib/resend/emails')
      const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://unsolo.in'
      await sendRefundProcessedEmail({
        to: prof.email,
        travelerName: prof.full_name || 'there',
        tripTitle: title,
        netRefundPaise: overpaid,
        bookingsUrl: `${site}/bookings`,
      })
    }
  } catch { /* email optional */ }

  try {
    const { logAuditEvent } = await import('@/actions/admin')
    await logAuditEvent(user.id, 'REFUND_BOOKING_OVERPAYMENT', 'booking', bookingId, { refundedPaise: overpaid })
  } catch { /* non-critical */ }

  revalidatePath('/bookings'); revalidatePath('/admin/bookings'); revalidatePath('/host')
  return { success: true, refundedPaise: overpaid }
}

// ── Admin: Manual override ──────────────────────────────────
/**
 * Admin/staff free-form correction of a booking, for cases the structured flows
 * don't cover: clear ALL discount (incl. a non-coupon/referral discount that the
 * coupon-remove keeps), set the trip total directly, set the collected amount
 * directly, and/or remove a traveller as a correction (guest count drops, no
 * refund is issued — unlike a partial cancellation).
 *
 * Amounts are admin-authoritative but still routed through the pricing engine so
 * the gross/discount/total identity and balance stay consistent. Omitted fields
 * are left unchanged.
 */
export async function adminOverrideBooking(
  bookingId: string,
  patch: {
    totalPaise?: number | null
    collectedPaise?: number | null
    clearDiscount?: boolean
    travellerDetails?: { name: string; age: number; gender: string }[]
  },
) {
  const { supabase, user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'social_media_manager', 'field_person', 'chat_responder'].includes(profile.role)) {
    return { error: 'Unauthorized' }
  }

  const svc = createServiceRoleClient()
  const { data: b } = await svc
    .from('bookings')
    .select('id, gross_paise, discount_paise, total_amount_paise, deposit_paise, promo_offer_id, guests, status')
    .eq('id', bookingId)
    .single()
  if (!b) return { error: 'Booking not found' }
  if (b.status === 'cancelled') return { error: 'Cannot override a cancelled booking.' }

  const curGross = (b.gross_paise ?? (b.total_amount_paise || 0) + (b.discount_paise || 0)) || 0
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

  // Traveller roster correction (removal / edit) — money is NOT changed here.
  if (Array.isArray(patch.travellerDetails)) {
    const sanitized = sanitizeTravellerDetails(patch.travellerDetails, patch.travellerDetails.length)
    if ('error' in sanitized) return { error: sanitized.error }
    if (!sanitized.value || sanitized.value.length < 1) return { error: 'A booking needs at least one traveller.' }
    update.traveller_details = sanitized.value
    update.guests = sanitized.value.length
  }

  // Discount: clear all of it (coupon + non-coupon).
  let discount = b.discount_paise || 0
  if (patch.clearDiscount) {
    discount = 0
    update.discount_paise = 0
    update.promo_offer_id = null
  }

  // Total: explicit override wins; else recompute from the (possibly cleared) discount.
  let gross = curGross
  let total = b.total_amount_paise || 0
  if (typeof patch.totalPaise === 'number' && Number.isFinite(patch.totalPaise)) {
    if (patch.totalPaise < 0) return { error: 'Total cannot be negative.' }
    total = Math.round(patch.totalPaise)
    gross = total + discount // preserve gross = total + discount
    update.gross_paise = gross
    update.total_amount_paise = total
    if (!('discount_paise' in update)) update.discount_paise = discount
  } else if (patch.clearDiscount) {
    const t = computeBookingTotals({ grossPaise: gross, discountPaise: 0 })
    total = t.totalPaise
    update.gross_paise = gross
    update.total_amount_paise = total
  }

  // Collected: set directly.
  let deposit = b.deposit_paise || 0
  if (typeof patch.collectedPaise === 'number' && Number.isFinite(patch.collectedPaise)) {
    if (patch.collectedPaise < 0) return { error: 'Collected cannot be negative.' }
    deposit = Math.round(patch.collectedPaise)
    update.deposit_paise = deposit
  }

  const t = computeBookingTotals({ grossPaise: gross, discountPaise: discount, collectedPaise: deposit })
  update.payment_status = t.balanceDuePaise <= 0 ? 'paid' : 'pending'

  const { error } = await svc.from('bookings').update(update).eq('id', bookingId)
  if (error) return { error: error.message }

  try {
    const { logAuditEvent } = await import('@/actions/admin')
    await logAuditEvent(user.id, 'ADMIN_OVERRIDE_BOOKING', 'booking', bookingId, {
      totalPaise: patch.totalPaise ?? null,
      collectedPaise: patch.collectedPaise ?? null,
      clearDiscount: !!patch.clearDiscount,
      travellersSet: Array.isArray(patch.travellerDetails) ? patch.travellerDetails.length : null,
    })
  } catch { /* non-critical */ }

  revalidatePath('/admin/bookings'); revalidatePath('/bookings'); revalidatePath('/host')
  return {
    success: true as const,
    totalPaise: total,
    collectedPaise: deposit,
    discountPaise: discount,
    balanceDuePaise: t.balanceDuePaise,
    overpaidPaise: t.overpaidPaise,
    guests: (update.guests as number | undefined) ?? b.guests,
    travellers: update.traveller_details as { name: string; age: number; gender: string }[] | undefined,
  }
}

// ── Admin: Edit traveller details ───────────────────────────
/**
 * Admin/staff edit the per-traveller details (name, age, gender) on a booking.
 * Useful for correcting independent travellers' info — the travellers are stored
 * as plain { name, age, gender } records with no account of their own.
 *
 * Editing only corrects the existing entries; it never changes the guest count.
 * To remove travellers use the per-traveller cancellation flow instead.
 */
export async function adminUpdateTravellerDetails(
  bookingId: string,
  travellers: { name: string; age: number; gender: string }[],
) {
  const { supabase, user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'social_media_manager', 'field_person', 'chat_responder'].includes(profile.role)) {
    return { error: 'Unauthorized' }
  }

  const svc = createServiceRoleClient()
  const { data: booking } = await svc
    .from('bookings')
    .select('id, guests, traveller_details')
    .eq('id', bookingId)
    .single()
  if (!booking) return { error: 'Booking not found' }

  // Edits must cover every seat exactly — adding/removing travellers goes through
  // the booking/cancellation flows so money and guest counts stay consistent.
  const existingCount = Array.isArray(booking.traveller_details) ? booking.traveller_details.length : 0
  const guests = booking.guests || existingCount || travellers.length
  const sanitized = sanitizeTravellerDetails(travellers, guests)
  if ('error' in sanitized) return { error: sanitized.error }
  if (!sanitized.value) return { error: 'Enter details for each traveller.' }

  const { error } = await svc
    .from('bookings')
    .update({ traveller_details: sanitized.value, updated_at: new Date().toISOString() })
    .eq('id', bookingId)
  if (error) return { error: error.message }

  try {
    const { logAuditEvent } = await import('@/actions/admin')
    await logAuditEvent(user.id, 'UPDATE_TRAVELLER_DETAILS', 'booking', bookingId, { guests })
  } catch { /* non-critical */ }

  revalidatePath('/admin/bookings')
  revalidatePath('/bookings')
  return { success: true, travellers: sanitized.value }
}

/**
 * Admin/staff adds new traveller(s) to an existing (non-cancelled) booking and
 * may optionally set the new trip total and the new collected amount. Amounts
 * are admin-authoritative (like the price-tier / coupon flows) — left unchanged
 * when omitted. The booker is notified.
 */
export async function adminAddTravellersToBooking(
  bookingId: string,
  newTravellers: { name: string; age: number; gender: string }[],
  opts?: { newTotalPaise?: number | null; newCollectedPaise?: number | null },
) {
  const { supabase, user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'social_media_manager', 'field_person', 'chat_responder'].includes(profile.role)) {
    return { error: 'Unauthorized' }
  }

  if (!Array.isArray(newTravellers) || newTravellers.length === 0) {
    return { error: 'Add at least one traveller.' }
  }
  const sanitized = sanitizeTravellerDetails(newTravellers, newTravellers.length)
  if ('error' in sanitized) return { error: sanitized.error }
  if (!sanitized.value) return { error: 'Enter details for each new traveller.' }
  const added = sanitized.value

  const svc = createServiceRoleClient()
  const { data: booking } = await svc
    .from('bookings')
    .select('id, user_id, guests, traveller_details, total_amount_paise, deposit_paise, discount_paise, gross_paise, status, package:packages(title)')
    .eq('id', bookingId)
    .single()
  if (!booking) return { error: 'Booking not found' }
  if (booking.status === 'cancelled' || booking.status === 'completed') {
    return { error: `Cannot add travellers to a ${booking.status} booking.` }
  }

  const existing = (Array.isArray(booking.traveller_details) ? booking.traveller_details : []) as TravellerDetailRow[]
  const merged = [...existing, ...added]
  const newGuests = (booking.guests || existing.length) + added.length

  const curTotal = booking.total_amount_paise || 0
  const update: Record<string, unknown> = {
    traveller_details: merged,
    guests: newGuests,
    updated_at: new Date().toISOString(),
  }

  let effectiveTotal = curTotal
  if (typeof opts?.newTotalPaise === 'number' && Number.isFinite(opts.newTotalPaise)) {
    if (opts.newTotalPaise < 0) return { error: 'Trip total cannot be negative.' }
    effectiveTotal = Math.round(opts.newTotalPaise)
    update.total_amount_paise = effectiveTotal
    // Keep the gross/discount/total identity (gross = total + discount) so a later
    // coupon re-derive or tier change computes against the correct gross — previously
    // gross_paise was left stale, producing a wrong total on the next re-derivation.
    const discount = (booking as { discount_paise?: number | null }).discount_paise || 0
    update.gross_paise = effectiveTotal + discount
  }
  if (typeof opts?.newCollectedPaise === 'number' && Number.isFinite(opts.newCollectedPaise)) {
    if (opts.newCollectedPaise < 0) return { error: 'Collected amount cannot be negative.' }
    // Never let collected exceed the (effective) trip total.
    update.deposit_paise = Math.min(Math.round(opts.newCollectedPaise), effectiveTotal)
  }

  const { error } = await svc.from('bookings').update(update).eq('id', bookingId)
  if (error) return { error: error.message }

  try {
    const pkgTitle = (booking.package as unknown as { title?: string } | null)?.title || 'your trip'
    const names = added.map(t => t.name).join(', ')
    await svc.from('notifications').insert({
      user_id: booking.user_id,
      type: 'booking',
      title: 'Travellers added to your booking',
      body: `An UnSOLO admin added ${added.length} traveller${added.length > 1 ? 's' : ''} (${names}) to your booking for "${pkgTitle}".`,
      link: '/bookings',
    })
  } catch { /* non-critical */ }

  try {
    const { logAuditEvent } = await import('@/actions/admin')
    await logAuditEvent(user.id, 'ADD_TRAVELLERS', 'booking', bookingId, { added: added.length, newGuests })
  } catch { /* non-critical */ }

  revalidatePath('/admin/bookings')
  revalidatePath('/bookings')
  return {
    success: true as const,
    travellers: merged,
    guests: newGuests,
    total_amount_paise: (update.total_amount_paise as number | undefined) ?? curTotal,
    deposit_paise: (update.deposit_paise as number | undefined) ?? (booking.deposit_paise || 0),
  }
}

// ── Admin: Process Cancellation ─────────────────────────────
/**
 * Admin/staff records an offline payment (cash, bank transfer, etc.) against a
 * specific booking. Bumps deposit_paise — the cash-collected figure the dashboard
 * now reports as earnings — capped at the trip total. When the offline payment
 * completes the balance, it runs the same effects as an online balance payment
 * (host earnings + the "fully paid" receipt) and a pending booking is confirmed.
 */
export async function recordManualPayment(
  bookingId: string,
  amountPaise: number,
  note?: string,
) {
  const { supabase, user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'social_media_manager', 'field_person', 'chat_responder'].includes(profile.role)) {
    return { error: 'Unauthorized' }
  }

  if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
    return { error: 'Enter a valid amount.' }
  }

  const svc = createServiceRoleClient()

  const { data: bookingBefore } = await svc
    .from('bookings')
    .select('*, package:packages(*, destination:destinations(*))')
    .eq('id', bookingId)
    .single()
  if (!bookingBefore) return { error: 'Booking not found' }
  if (bookingBefore.status === 'cancelled') {
    return { error: 'Cannot record a payment on a cancelled booking.' }
  }

  const total = bookingBefore.total_amount_paise || 0
  const wasDeposit = bookingBefore.deposit_paise || 0
  const balanceDue = Math.max(0, total - wasDeposit)
  if (balanceDue <= 0) return { error: 'This booking is already fully paid.' }

  // Never let recorded payments exceed the trip total.
  const applied = Math.min(amountPaise, balanceDue)
  const newDeposit = wasDeposit + applied
  const fullyPaid = newDeposit >= total

  const { generateConfirmationCode } = await import('@/lib/utils')
  const confirmationCode = bookingBefore.confirmation_code || generateConfirmationCode()

  const update: Record<string, unknown> = {
    deposit_paise: newDeposit,
    confirmation_code: confirmationCode,
    updated_at: new Date().toISOString(),
  }
  if (bookingBefore.status === 'pending') update.status = 'confirmed'
  if (fullyPaid) update.payment_status = 'paid'

  // Optimistic lock on deposit_paise: only apply if the deposit hasn't moved since
  // we read it. Blocks a double-click recording the same payment twice and a race
  // with an online balance payment landing at the same moment.
  const { data: booking, error } = await svc
    .from('bookings')
    .update(update)
    .eq('id', bookingId)
    .eq('deposit_paise', wasDeposit)
    .select('*, package:packages(*, destination:destinations(*))')
    .maybeSingle()
  if (error) return { error: error.message }
  if (!booking) {
    return { error: 'This booking changed while recording the payment (it may have just been paid online, or this payment was already recorded). Refresh and check the balance before retrying.' }
  }

  // Run completion effects only on the transition to fully paid (creates host
  // earnings + sends the fully-paid receipt exactly once).
  if (fullyPaid && wasDeposit < total) {
    try {
      await runBalanceCompletionEffects(svc as never, bookingBefore.user_id, booking as never, confirmationCode)
    } catch { /* non-critical */ }
  }

  // Phase 2 dual-write: mirror this offline collection into the payments ledger.
  await recordPaymentLedger(svc, {
    bookingId,
    amountPaise: applied,
    method: 'offline_cash',
    kind: wasDeposit > 0 ? 'balance' : 'payment',
    recordedBy: user.id,
    note: note || null,
  })

  try {
    const { logAuditEvent } = await import('@/actions/admin')
    await logAuditEvent(user.id, 'RECORD_MANUAL_PAYMENT', 'booking', bookingId, {
      amountPaise: applied,
      newDepositPaise: newDeposit,
      fullyPaid,
      note: note || '',
    })
  } catch { /* non-critical */ }

  revalidatePath('/bookings')
  revalidatePath('/admin/bookings')
  return {
    success: true,
    appliedPaise: applied,
    depositPaise: newDeposit,
    fullyPaid,
    balanceDuePaise: Math.max(0, total - newDeposit),
  }
}

export async function processCancellation(
  bookingId: string,
  approve: boolean,
  refundAmountPaise?: number,
  adminNote?: string,
  tierPercent?: number,
) {
  const { supabase, user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }

  // Verify admin/staff role
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'social_media_manager', 'field_person', 'chat_responder'].includes(profile.role)) return { error: 'Unauthorized' }

  // Validate refund amount
  if (approve && refundAmountPaise !== undefined) {
    const { data: bookingCheck } = await supabase
      .from('bookings')
      .select('total_amount_paise, deposit_paise')
      .eq('id', bookingId)
      .single()
    if (bookingCheck) {
      // Cap at what was actually paid. For token bookings deposit_paise < total_amount_paise;
      // for full-payment bookings deposit_paise equals total_amount_paise.
      const amountActuallyPaid = bookingCheck.deposit_paise ?? bookingCheck.total_amount_paise
      if (refundAmountPaise > amountActuallyPaid) {
        return { error: `Refund amount cannot exceed amount actually paid (₹${(amountActuallyPaid / 100).toLocaleString('en-IN')})` }
      }
    }
    if (refundAmountPaise < 0) {
      return { error: 'Refund amount cannot be negative' }
    }
  }

  const updateData: Record<string, unknown> = {
    cancellation_status: approve ? 'approved' : 'denied',
    admin_cancellation_note: adminNote || null,
    updated_at: new Date().toISOString(),
  }

  if (approve) {
    updateData.status = 'cancelled'
    updateData.refund_amount_paise = refundAmountPaise || 0
    updateData.refund_note = adminNote || null
    updateData.refund_status = 'pending' // new: tracks refund progress
  }

  const { error } = await supabase
    .from('bookings')
    .update(updateData)
    .eq('id', bookingId)

  if (error) return { error: error.message }

  // A full cancellation supersedes any still-pending partial cancellation requests
  // on this booking, so they can't later be approved against a cancelled booking.
  if (approve) {
    try {
      const svcRole = createServiceRoleClient()
      await svcRole
        .from('booking_partial_cancellations')
        .update({ status: 'denied', admin_note: 'Superseded by full booking cancellation', processed_at: new Date().toISOString() })
        .eq('booking_id', bookingId)
        .eq('status', 'requested')
    } catch { /* non-critical */ }
  }

  // Pro-rata split: write host/platform refund shares to host_earnings so the
  // host sees exactly which portion came out of their earnings.
  if (approve && typeof refundAmountPaise === 'number' && refundAmountPaise > 0) {
    try {
      const { applyRefundSplitToEarning } = await import('@/actions/cancellation-refund')
      await applyRefundSplitToEarning(bookingId, tierPercent ?? 0, refundAmountPaise)
    } catch (err) {
      console.error('applyRefundSplitToEarning failed', err)
      // Non-fatal: the booking is already marked cancelled. Admins can re-run if needed.
    }
  }

  // Get booking + traveler profile to notify
  const { data: booking } = await supabase
    .from('bookings')
    .select('user_id, package_id, package:packages(title), total_amount_paise, stripe_payment_intent, profiles(full_name, email)')
    .eq('id', bookingId)
    .single()

  if (booking) {
    const pkgTitle = (booking.package as unknown as { title: string })?.title || 'your trip'
    const refundFormatted = refundAmountPaise ? `₹${(refundAmountPaise / 100).toLocaleString('en-IN')}` : '₹0'

    await supabase.from('notifications').insert({
      user_id: booking.user_id,
      type: 'booking',
      title: approve ? 'Cancellation Approved' : 'Cancellation Denied',
      body: approve
        ? `Your cancellation for ${pkgTitle} was approved. Refund of ${refundFormatted} is being processed. ${adminNote || ''}`
        : `Your cancellation for ${pkgTitle} was denied. ${adminNote || ''}`,
      link: '/bookings',
    })

    // Email the traveler
    const profile = (Array.isArray(booking.profiles) ? booking.profiles[0] : booking.profiles) as { full_name: string | null; email: string | null } | null
    if (profile?.email) {
      const { sendCancellationDecisionEmail } = await import('@/lib/resend/emails')
      await sendCancellationDecisionEmail({
        to: profile.email,
        travelerName: profile.full_name ?? '',
        tripTitle: pkgTitle,
        approved: approve,
        refundAmountPaise: refundAmountPaise ?? 0,
        adminNote: adminNote || undefined,
        bookingsUrl: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://unsolo.in'}/bookings`,
      }).catch(() => null)
    }
  }

  // Audit log
  try {
    const { logAuditEvent } = await import('@/actions/admin')
    await logAuditEvent(user.id, approve ? 'cancellation_approved' : 'cancellation_denied', 'booking', bookingId, {
      refundAmountPaise: refundAmountPaise || 0,
      adminNote: adminNote || '',
    })
  } catch { /* non-critical */ }

  if (approve && booking?.user_id && booking.package_id) {
    const { createClient: createServiceClient } = await import('@supabase/supabase-js')
    const svc = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const { removeUserFromPackageTripChat } = await import('@/lib/chat/tripChatMembership')
    await removeUserFromPackageTripChat(svc, booking.user_id, booking.package_id)
  }

  revalidatePath('/admin/bookings')
  revalidatePath('/bookings')
  return { success: true }
}

// ── Admin: Initiate Razorpay Refund ─────────────────────────
export async function initiateRefund(bookingId: string) {
  const { supabase, user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') return { error: 'Unauthorized' }

  const { data: booking } = await supabase
    .from('bookings')
    .select('stripe_payment_intent, refund_amount_paise, refund_status')
    .eq('id', bookingId)
    .single()

  if (!booking) return { error: 'Booking not found' }
  if (!booking.stripe_payment_intent) return { error: 'No payment ID found — manual refund required' }
  if (!booking.refund_amount_paise || booking.refund_amount_paise <= 0) return { error: 'No refund amount set' }
  if (booking.refund_status === 'processing') return { error: 'Refund already initiated and processing' }
  if (booking.refund_status === 'completed') return { error: 'Refund already completed' }

  const res = await initiateRazorpayRefundForBooking(bookingId)
  if (!res.ok) return { error: res.error }
  if (res.refundId) return { success: true, refundId: res.refundId }
  const { data: again } = await supabase
    .from('bookings')
    .select('refund_status, refund_razorpay_id')
    .eq('id', bookingId)
    .single()
  if (again?.refund_status === 'processing' && again.refund_razorpay_id) {
    return { success: true, refundId: again.refund_razorpay_id }
  }
  return { error: 'Refund did not return an ID — check Razorpay dashboard' }
}

// ── Admin: Mark Refund as Complete ──────────────────────────
export async function markRefundComplete(bookingId: string) {
  const { supabase, user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') return { error: 'Unauthorized' }

  // select('*') keeps this resilient to refund_completed_paise (migration 091)
  // not being applied yet — it just reads as undefined.
  const { data: booking } = await supabase
    .from('bookings')
    .select('*, package:packages(title)')
    .eq('id', bookingId)
    .single()

  if (!booking) return { error: 'Booking not found' }
  // Already credited — don't re-notify / re-email.
  if (booking.refund_status === 'completed') return { success: true, alreadyComplete: true }

  await supabase
    .from('bookings')
    .update({ refund_status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', bookingId)

  // Notify customer
  const pkgTitle = (booking.package as unknown as { title: string })?.title || 'your trip'
  const creditedPaise = (booking.refund_completed_paise ?? booking.refund_amount_paise) || 0
  const refundFormatted = creditedPaise ? `₹${(creditedPaise / 100).toLocaleString('en-IN')}` : ''

  await upsertBookingRefund(createServiceRoleClient(), {
    bookingId,
    amountPaise: creditedPaise,
    method: 'razorpay',
    status: 'completed',
  })
  await supabase.from('notifications').insert({
    user_id: booking.user_id,
    type: 'booking',
    title: 'Refund Completed!',
    body: `Your refund of ${refundFormatted} for ${pkgTitle} has been credited to your account.`,
    link: '/bookings',
  })

  // Email the customer a refund receipt with the amount breakdown + record that it
  // was sent (skip if already emailed for this booking).
  if (!booking.refund_email_sent_at) {
    const { sendRefundReceiptAndRecord } = await import('@/lib/email/refundReceipt')
    await sendRefundReceiptAndRecord(supabase, {
      table: 'bookings',
      id: bookingId,
      userId: booking.user_id,
      tripTitle: pkgTitle,
      netRefundPaise: creditedPaise,
      amountPaidPaise: typeof booking.deposit_paise === 'number' ? booking.deposit_paise : undefined,
    })
  }

  revalidatePath('/admin/bookings')
  revalidatePath('/bookings')
  return { success: true }
}

// ── Admin: Record Offline Refund ────────────────────────────
/**
 * Admin records a cancellation refund that was settled OUTSIDE the app (cash or
 * bank transfer) — an alternative to the Razorpay "Initiate refund" flow. Marks
 * the refund completed in one step, notifies + emails the customer a receipt,
 * and tags the method as 'offline' for the record.
 *
 * Blocked while a Razorpay refund is already processing (use "Mark refund as
 * credited" for that), so the two paths can't double-credit a customer.
 */
export async function recordOfflineRefund(bookingId: string, note?: string) {
  const { supabase, user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') return { error: 'Unauthorized' }

  const { data: booking } = await supabase
    .from('bookings')
    .select('*, package:packages(title)')
    .eq('id', bookingId)
    .single()

  if (!booking) return { error: 'Booking not found' }
  if (booking.status !== 'cancelled') return { error: 'Record an offline refund only on a cancelled booking.' }
  if (!booking.refund_amount_paise || booking.refund_amount_paise <= 0) return { error: 'No refund amount set.' }
  if (booking.refund_status === 'completed') return { success: true, alreadyComplete: true }
  if (booking.refund_status === 'processing') {
    return { error: 'A Razorpay refund is already processing — use "Mark refund as credited" instead.' }
  }

  const creditedPaise = booking.refund_amount_paise

  // Core columns first (always present). refund_method is best-effort below so
  // this still works if migration 098 hasn't been applied yet.
  await supabase
    .from('bookings')
    .update({
      refund_status: 'completed',
      refund_completed_paise: creditedPaise,
      refund_note: note?.trim() || booking.refund_note || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', bookingId)

  try {
    await supabase.from('bookings').update({ refund_method: 'offline' }).eq('id', bookingId)
  } catch { /* refund_method column optional until migration 098 */ }

  await upsertBookingRefund(createServiceRoleClient(), {
    bookingId,
    amountPaise: creditedPaise,
    method: 'offline',
    status: 'completed',
  })

  // Notify customer
  const pkgTitle = (booking.package as unknown as { title: string })?.title || 'your trip'
  const refundFormatted = creditedPaise ? `₹${(creditedPaise / 100).toLocaleString('en-IN')}` : ''
  await supabase.from('notifications').insert({
    user_id: booking.user_id,
    type: 'booking',
    title: 'Refund Completed!',
    body: `Your refund of ${refundFormatted} for ${pkgTitle} has been settled.${note?.trim() ? ` ${note.trim()}` : ''}`,
    link: '/bookings',
  })

  // Email the customer a refund receipt (skip if already emailed for this booking).
  if (!booking.refund_email_sent_at) {
    const { sendRefundReceiptAndRecord } = await import('@/lib/email/refundReceipt')
    await sendRefundReceiptAndRecord(supabase, {
      table: 'bookings',
      id: bookingId,
      userId: booking.user_id,
      tripTitle: pkgTitle,
      netRefundPaise: creditedPaise,
      amountPaidPaise: typeof booking.deposit_paise === 'number' ? booking.deposit_paise : undefined,
    })
  }

  try {
    const { logAuditEvent } = await import('@/actions/admin')
    await logAuditEvent(user.id, 'RECORD_OFFLINE_REFUND', 'booking', bookingId, {
      refundPaise: creditedPaise,
      note: note?.trim() || '',
    })
  } catch { /* non-critical */ }

  revalidatePath('/admin/bookings')
  revalidatePath('/bookings')
  return { success: true, refundedPaise: creditedPaise }
}

// ── Community Trip Payment (after host approves join request) ──

export type CommunityTripOrderOptions = {
  promoCode?: string | null
  useWalletCredits?: boolean
  /** When trip uses token deposit: charge full trip amount instead of token slice */
  payFullAmountForTokenTrip?: boolean
  /** The joiner's own name/age/gender (community joins are single-person). */
  travellerDetails?: { name: string; age: number; gender: string }[]
}

export async function createCommunityTripOrder(
  joinRequestId: string,
  options?: CommunityTripOrderOptions,
) {
  const { supabase, user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }

  const communityTravellerDetails = sanitizeTravellerDetails(options?.travellerDetails, 1)
  if ('error' in communityTravellerDetails) return { error: communityTravellerDetails.error }

  const orderRate = await assertBookingOrderRateLimit(supabase, user.id)
  if (orderRate.error) return { error: orderRate.error }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, phone_number')
    .eq('id', user.id)
    .single()

  const { data: request } = await supabase
    .from('join_requests')
    .select(
      '*, trip:packages(id, title, price_paise, host_id, departure_dates, departure_dates_closed, booking_cutoff_dates, bookings_paused, duration_days, join_preferences)',
    )
    .eq('id', joinRequestId)
    .eq('user_id', user.id)
    .single()

  if (!request) return { error: 'Join request not found' }
  if (request.status !== 'approved') return { error: 'Request not approved yet' }

  if (request.payment_deadline && new Date(request.payment_deadline) < new Date()) {
    return { error: 'Payment deadline has passed. Please request to join again.' }
  }

  const trip = request.trip as {
    id: string
    title: string
    price_paise: number
    host_id: string
    departure_dates?: string[] | null
    departure_dates_closed?: string[] | null
    booking_cutoff_dates?: Record<string, string> | null
    bookings_paused?: boolean | null
    duration_days?: number
    join_preferences?: unknown
  }

  const grossList = trip.price_paise
  let promoOfferId: string | null = null
  let promoDiscountPaise = 0
  if (options?.promoCode?.trim()) {
    const pr = await validatePromoForCheckout(
      supabase,
      options.promoCode,
      {
        listingType: 'trips',
        packageId: trip.id,
        hostId: trip.host_id,
      },
      { grossPaise: grossList, unitPricePaise: trip.price_paise, quantity: 1 },
    )
    if ('error' in pr) return { error: pr.error }
    promoDiscountPaise = Math.min(pr.discountPaise, grossList)
    promoOfferId = pr.offerId
  }
  const afterPromo = Math.max(0, grossList - promoDiscountPaise)
  const referredDisc = await referredDiscountForUser(supabase, user.id)
  const referredApplied = Math.min(referredDisc, afterPromo)
  const afterDiscounts = Math.max(0, afterPromo - referredApplied)

  const jp =
    trip.join_preferences && typeof trip.join_preferences === 'object'
      ? (trip.join_preferences as JoinPreferences)
      : null
  const communityTokenBook = isTokenDepositEnabled(jp)
  const tokenPaiseFromHost =
    jp && typeof jp.token_amount_paise === 'number' && Number.isFinite(jp.token_amount_paise)
      ? Math.round(jp.token_amount_paise)
      : 0
  let firstPaymentCap: number | null = null
  if (communityTokenBook) {
    if (tokenPaiseFromHost < RAZORPAY_MIN_PAISE || tokenPaiseFromHost > trip.price_paise) {
      return { error: 'This trip has an invalid token amount. Please contact support.' }
    }
    if (!options?.payFullAmountForTokenTrip) {
      firstPaymentCap = Math.min(tokenPaiseFromHost, afterDiscounts)
    }
  }

  const { data: userProfileWallet } = await supabase
    .from('profiles')
    .select('referral_credits_paise')
    .eq('id', user.id)
    .single()
  const availableCredits = userProfileWallet?.referral_credits_paise || 0

  const walletTarget = firstPaymentCap != null ? firstPaymentCap : afterDiscounts
  const { walletDeducted, razorpayAmount } = walletAndRazorpayAmount(
    walletTarget,
    availableCredits,
    !!options?.useWalletCredits,
  )

  const discountTotalPaise = grossList - afterDiscounts

  const today = new Date().toISOString().split('T')[0]
  if (trip.bookings_paused) {
    return { error: 'This trip is not accepting new bookings right now.' }
  }

  const cutoffs = (trip.booking_cutoff_dates || {}) as Record<string, string>
  const closedSet = new Set((trip.departure_dates_closed || []).map(tripDepartureDateKey))
  const depKeys = (trip.departure_dates || []).map(tripDepartureDateKey)
  const travelDate = depKeys.find((d) => {
    if (d < today || closedSet.has(d)) return false
    const cutoffIso = cutoffs[d]
    if (cutoffIso) {
      const cutoff = new Date(cutoffIso)
      cutoff.setHours(23, 59, 59, 999)
      if (new Date() > cutoff) return false
    }
    return true
  }) ?? null
  if (!travelDate) {
    return { error: 'This trip has no open departure dates right now. Contact the host or try again later.' }
  }

  const { data: existingConfirmed } = await supabase
    .from('bookings')
    .select('id')
    .eq('user_id', user.id)
    .eq('package_id', trip.id)
    .eq('travel_date', travelDate)
    .eq('status', 'confirmed')
    .maybeSingle()
  if (existingConfirmed) {
    return { error: 'You already have a confirmed booking for this trip' }
  }

  const { data: stalePending } = await supabase
    .from('bookings')
    .select('id')
    .eq('user_id', user.id)
    .eq('package_id', trip.id)
    .eq('travel_date', travelDate)
    .eq('status', 'pending')
    .maybeSingle()
  if (stalePending) {
    await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', stalePending.id)
  }

  if (razorpayAmount <= 0) {
    const { generateConfirmationCode } = await import('@/lib/utils')
    const confirmationCode = generateConfirmationCode()

    const depositPaiseInstant =
      firstPaymentCap != null ? walletDeducted + razorpayAmount : afterDiscounts
    const fullyPaidInstant = depositPaiseInstant >= afterDiscounts

    const { data: booking } = await supabase
      .from('bookings')
      .insert({
        user_id: user.id,
        package_id: trip.id,
        status: 'confirmed',
        travel_date: travelDate,
        guests: 1,
        total_amount_paise: afterDiscounts,
        gross_paise: grossList,
        deposit_paise: depositPaiseInstant,
        wallet_deducted_paise: walletDeducted,
        discount_paise: discountTotalPaise,
        promo_offer_id: promoOfferId,
        stripe_session_id: null,
        stripe_payment_intent: null,
        confirmation_code: confirmationCode,
        traveller_details: communityTravellerDetails.value,
      })
      .select('*, package:packages(*, destination:destinations(*))')
      .single()

    if (!booking) return { error: 'Could not create booking' }

    if (firstPaymentCap != null && !fullyPaidInstant) {
      await runPartialTokenFirstPaymentEffects(supabase, user.id, booking as never, confirmationCode)
      await notifyTokenBalanceDue(supabase, user, booking as never, depositPaiseInstant)
    } else {
      await runPostConfirmationPipeline(supabase, user.id, booking as never, confirmationCode)
    }
    revalidatePath('/bookings')
    return {
      instant: true as const,
      bookingId: booking.id,
      confirmationCode,
      balanceDuePaise: fullyPaidInstant ? 0 : Math.max(0, afterDiscounts - depositPaiseInstant),
    }
  }

  const order = await razorpay.orders.create({
    amount: razorpayAmount,
    currency: 'INR',
    receipt: `unsolo_community_${Date.now()}`,
    notes: { userId: user.id, packageId: trip.id, joinRequestId: request.id, type: 'community_trip' },
  })

  const { data: communityBooking, error: communityBookingError } = await supabase
    .from('bookings')
    .insert({
      user_id: user.id,
      package_id: trip.id,
      status: 'pending',
      travel_date: travelDate,
      guests: 1,
      total_amount_paise: afterDiscounts,
      gross_paise: grossList,
      deposit_paise: 0,
      wallet_deducted_paise: walletDeducted,
      discount_paise: discountTotalPaise,
      promo_offer_id: promoOfferId,
      stripe_session_id: order.id,
      traveller_details: communityTravellerDetails.value,
    })
    .select('id')
    .single()

  // Abort before the traveler can pay if the booking row didn't persist.
  if (communityBookingError || !communityBooking) {
    console.error('[createCommunityTripOrder] booking insert failed:', communityBookingError?.message)
    return { error: "We couldn't start your booking and you have NOT been charged. Please try again or contact support." }
  }

  return {
    orderId: order.id,
    amount: razorpayAmount,
    currency: 'INR',
    keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
    prefill: {
      email: user.email || '',
      ...(profile?.phone_number ? { contact: profile.phone_number.startsWith('+91') ? profile.phone_number : `+91${profile.phone_number.replace(/\D/g, '').slice(-10)}` } : {}),
      name: profile?.full_name || '',
    },
    notes: { userId: user.id, packageId: trip.id, joinRequestId: request.id },
  }
}
