'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { razorpay } from '@/lib/razorpay/client'
import { resolvePerPersonFromPackage } from '@/lib/package-pricing'
import { getPlatformFeePercent } from '@/lib/platform-settings'
import { splitInclusiveCommunityPayment } from '@/lib/community-payment'
import { tripDepartureDateKey } from '@/lib/package-trip-calendar'
import { assertBookingOrderRateLimit } from '@/lib/server-rate-limit'
import { REFERRED_DISCOUNT_PAISE } from '@/lib/constants'
import { isCommunityDirectCheckout, isTokenDepositEnabled } from '@/lib/join-preferences'
import type { JoinPreferences } from '@/types'

const RAZORPAY_MIN_PAISE = 100 // ₹1 — Razorpay minimum for INR

type SupabaseServer = Awaited<ReturnType<typeof createClient>>

async function validatePromoForCheckout(
  supabase: SupabaseServer,
  code: string,
): Promise<{ discountPaise: number; offerId: string } | { error: string }> {
  const trimmed = code.toUpperCase().trim()
  if (!trimmed) return { error: 'Enter a promo code' }

  const { data: offer } = await supabase
    .from('discount_offers')
    .select('id, discount_paise, max_uses, used_count, valid_until')
    .eq('promo_code', trimmed)
    .eq('is_active', true)
    .single()

  if (!offer) return { error: 'Invalid promo code' }
  if (offer.max_uses && (offer.used_count ?? 0) >= offer.max_uses) {
    return { error: 'This promo code has expired' }
  }
  if (offer.valid_until && new Date(offer.valid_until) < new Date()) {
    return { error: 'This promo code has expired' }
  }

  return { discountPaise: offer.discount_paise, offerId: offer.id }
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

async function incrementPromoOfferUsed(supabase: SupabaseServer, offerId: string) {
  const { data: row } = await supabase
    .from('discount_offers')
    .select('used_count')
    .eq('id', offerId)
    .single()
  if (!row) return
  await supabase
    .from('discount_offers')
    .update({ used_count: (row.used_count ?? 0) + 1 })
    .eq('id', offerId)
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

  const { data: existingRoom } = await supabase
    .from('chat_rooms')
    .select('id')
    .eq('package_id', booking.package_id)
    .eq('type', 'trip')
    .single()

  let roomId = existingRoom?.id

  if (!roomId) {
    const pkg = booking.package as { title?: string } | null
    const { data: newRoom } = await supabase
      .from('chat_rooms')
      .insert({
        name: pkg?.title ? `${pkg.title} - Trip Chat` : 'Trip Chat',
        type: 'trip',
        package_id: booking.package_id,
        created_by: userId,
      })
      .select('id')
      .single()
    roomId = newRoom?.id
  }

  if (roomId) {
    await supabase.from('chat_room_members').upsert({
      room_id: roomId,
      user_id: userId,
    })

    const { data: joinerProfile } = await supabase
      .from('profiles')
      .select('username, full_name')
      .eq('id', userId)
      .single()
    const displayName = joinerProfile?.full_name || joinerProfile?.username || 'A new traveler'

    await supabase.from('messages').insert({
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
      const { platformFeePaise, hostPaise } = splitInclusiveCommunityPayment(
        booking.total_amount_paise,
        feePercent,
      )

      const { createClient: createSC3 } = await import('@supabase/supabase-js')
      const svcSupa3 = createSC3(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

      await svcSupa3.from('host_earnings').insert({
        booking_id: booking.id,
        host_id: pkg.host_id,
        total_paise: booking.total_amount_paise,
        platform_fee_paise: platformFeePaise,
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
}

/** Shared: chat, wallet deduction, host earnings, referral — after booking row is confirmed. */
async function runPostConfirmationPipeline(
  supabase: SupabaseServer,
  userId: string,
  booking: Record<string, unknown> & {
    id: string
    package_id: string
    wallet_deducted_paise?: number | null
    total_amount_paise: number
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

  const { data: existingRoom } = await supabase
    .from('chat_rooms')
    .select('id')
    .eq('package_id', booking.package_id)
    .eq('type', 'trip')
    .single()

  let roomId = existingRoom?.id

  if (!roomId) {
    const pkg = booking.package as { title?: string } | null
    const { data: newRoom } = await supabase
      .from('chat_rooms')
      .insert({
        name: pkg?.title ? `${pkg.title} - Trip Chat` : 'Trip Chat',
        type: 'trip',
        package_id: booking.package_id,
        created_by: userId,
      })
      .select('id')
      .single()
    roomId = newRoom?.id
  }

  if (roomId) {
    await supabase.from('chat_room_members').upsert({
      room_id: roomId,
      user_id: userId,
    })

    const { data: joinerProfile } = await supabase
      .from('profiles')
      .select('username, full_name')
      .eq('id', userId)
      .single()
    const displayName = joinerProfile?.full_name || joinerProfile?.username || 'A new traveler'

    await supabase.from('messages').insert({
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
      const { platformFeePaise, hostPaise } = splitInclusiveCommunityPayment(
        booking.total_amount_paise,
        feePercent,
      )

      const { createClient: createSC3 } = await import('@supabase/supabase-js')
      const svcSupa3 = createSC3(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

      await svcSupa3.from('host_earnings').insert({
        booking_id: booking.id,
        host_id: pkg.host_id,
        total_paise: booking.total_amount_paise,
        platform_fee_paise: platformFeePaise,
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
}

async function notifyTokenBalanceDue(
  supabase: SupabaseServer,
  user: { id: string; email?: string | null },
  booking: {
    id: string
    travel_date: string
    total_amount_paise: number
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
  const email = user.email
  if (!email?.trim()) return
  try {
    const { sendTokenBalanceDueEmail } = await import('@/lib/resend/emails')
    const { APP_URL } = await import('@/lib/constants')
    await sendTokenBalanceDueEmail({
      to: email.trim(),
      tripTitle: pkgTitle,
      balancePaise: balance,
      travelDateIso: booking.travel_date,
      bookingsUrl: `${APP_URL}/bookings`,
    })
  } catch {
    /* non-critical */
  }
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
  },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

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

  if (
    pkg.host_id &&
    (!pkg.is_active || pkg.moderation_status !== 'approved')
  ) {
    return { error: 'This trip is not available for booking' }
  }

  // Server-side date validation — must be at least 1 day in the future
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const selectedDate = new Date(travelDate)
  if (selectedDate <= today) {
    return { error: 'Travel date must be in the future' }
  }

  const closedDates = (pkg.departure_dates_closed || []).map(tripDepartureDateKey)
  if (closedDates.includes(tripDepartureDateKey(travelDate))) {
    return { error: 'No spots left for this date' }
  }

  // Duplicate booking prevention — only block if already confirmed
  // Allow retry if previous booking is pending (failed/abandoned payment)
  const { data: existingBooking } = await supabase
    .from('bookings')
    .select('id, status')
    .eq('user_id', user.id)
    .eq('package_id', packageId)
    .eq('travel_date', travelDate)
    .in('status', ['pending', 'confirmed'])
    .maybeSingle()

  if (existingBooking?.status === 'confirmed') {
    return { error: 'You already have a confirmed booking for this trip on this date' }
  }

  // Cancel stale pending booking so user can retry
  if (existingBooking?.status === 'pending') {
    await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', existingBooking.id)
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
    const pr = await validatePromoForCheckout(supabase, options.promoCode)
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
        deposit_paise: depositPaiseInstant,
        wallet_deducted_paise: walletDeducted,
        discount_paise: discountTotalPaise,
        promo_offer_id: promoOfferId,
        stripe_session_id: null,
        stripe_payment_intent: null,
        confirmation_code: confirmationCode,
        price_variant_label: priceVariantLabel,
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

  const { data: booking } = await supabase
    .from('bookings')
    .insert({
      user_id: user.id,
      package_id: packageId,
      status: 'pending',
      travel_date: travelDate,
      guests,
      total_amount_paise: afterDiscounts,
      deposit_paise: 0,
      wallet_deducted_paise: walletDeducted,
      discount_paise: discountTotalPaise,
      promo_offer_id: promoOfferId,
      stripe_session_id: order.id,
      price_variant_label: priceVariantLabel,
    })
    .select()
    .single()

  return {
    orderId: order.id,
    amount: razorpayAmount,
    currency: 'INR',
    bookingId: booking?.id,
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

export async function confirmPayment(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  razorpaySignature: string,
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
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

  const { generateConfirmationCode } = await import('@/lib/utils')

  const { data: bookingBefore } = await supabase
    .from('bookings')
    .select('*, package:packages(*, destination:destinations(*))')
    .eq('stripe_session_id', razorpayOrderId)
    .eq('user_id', user.id)
    .single()

  if (!bookingBefore) {
    return { error: 'Booking not found' }
  }

  const order = await razorpay.orders.fetch(razorpayOrderId)
  const orderAmount = order.amount
  const wasDeposit = bookingBefore.deposit_paise || 0
  const newDeposit =
    wasDeposit === 0
      ? (bookingBefore.wallet_deducted_paise || 0) + orderAmount
      : wasDeposit + orderAmount
  const fullyPaid = newDeposit >= bookingBefore.total_amount_paise

  const confirmationCode = bookingBefore.confirmation_code || generateConfirmationCode()

  const { data: booking } = await supabase
    .from('bookings')
    .update({
      status: 'confirmed',
      stripe_payment_intent: razorpayPaymentId,
      confirmation_code: confirmationCode,
      deposit_paise: newDeposit,
    })
    .eq('id', bookingBefore.id)
    .eq('user_id', user.id)
    .select('*, package:packages(*, destination:destinations(*))')
    .single()

  if (!booking) {
    return { error: 'Booking not found' }
  }

  if (wasDeposit === 0 && !fullyPaid) {
    await runPartialTokenFirstPaymentEffects(supabase, user.id, booking as never, confirmationCode)
    await notifyTokenBalanceDue(supabase, user, booking as never, newDeposit)
  } else if (wasDeposit === 0 && fullyPaid) {
    await runPostConfirmationPipeline(supabase, user.id, booking as never, confirmationCode)
  } else if (wasDeposit > 0 && fullyPaid) {
    await runBalanceCompletionEffects(supabase, user.id, booking as never, confirmationCode)
  }

  revalidatePath('/bookings')
  return {
    success: true,
    confirmationCode,
    bookingId: booking.id,
    fullyPaid,
    balanceDuePaise: fullyPaid ? 0 : Math.max(0, booking.total_amount_paise - newDeposit),
  }
}

/** Pay remaining balance for a community trip booked with token_to_book (second Razorpay order). */
export async function createBookingBalanceOrder(bookingId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, user_id, total_amount_paise, deposit_paise, status, package:packages(host_id, join_preferences)')
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

  await supabase.from('bookings').update({ stripe_session_id: order.id }).eq('id', bookingId)

  return {
    orderId: order.id,
    amount: balance,
    currency: 'INR' as const,
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
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

  const { error } = await supabase.from('custom_date_requests').insert({
    user_id: user.id,
    package_id: packageId,
    requested_date: requestedDate,
    guests,
    contact_number: phone,
    contact_email: contactEmail,
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
      contactEmail,
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

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

// ── Date Change (only for pending bookings) ─────────────────
export async function changeBookingDate(bookingId: string, newDate: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
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

// ── Cancellation Request ────────────────────────────────────
export async function requestCancellation(bookingId: string, reason: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
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

// ── Admin: Process Cancellation ─────────────────────────────
export async function processCancellation(
  bookingId: string,
  approve: boolean,
  refundAmountPaise?: number,
  adminNote?: string,
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Verify admin/staff role
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'social_media_manager', 'field_person', 'chat_responder'].includes(profile.role)) return { error: 'Unauthorized' }

  // Validate refund amount
  if (approve && refundAmountPaise !== undefined) {
    const { data: bookingCheck } = await supabase
      .from('bookings')
      .select('total_amount_paise')
      .eq('id', bookingId)
      .single()
    if (bookingCheck && refundAmountPaise > bookingCheck.total_amount_paise) {
      return { error: `Refund amount cannot exceed booking amount (₹${(bookingCheck.total_amount_paise / 100).toLocaleString('en-IN')})` }
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

  // Get booking to notify user
  const { data: booking } = await supabase
    .from('bookings')
    .select('user_id, package_id, package:packages(title), total_amount_paise, stripe_payment_intent')
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Verify admin
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') return { error: 'Unauthorized' }

  // Get booking with payment ID and refund amount
  const { data: booking } = await supabase
    .from('bookings')
    .select('stripe_payment_intent, refund_amount_paise, refund_status, user_id, package:packages(title)')
    .eq('id', bookingId)
    .single()

  if (!booking) return { error: 'Booking not found' }
  if (!booking.stripe_payment_intent) return { error: 'No payment ID found — manual refund required' }
  if (!booking.refund_amount_paise || booking.refund_amount_paise <= 0) return { error: 'No refund amount set' }

  // Double refund prevention
  if (booking.refund_status === 'processing') return { error: 'Refund already initiated and processing' }
  if (booking.refund_status === 'completed') return { error: 'Refund already completed' }

  try {
    // Call Razorpay Refund API
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
      }
    )

    const result = await response.json()

    if (!response.ok) {
      return { error: result.error?.description || 'Razorpay refund failed' }
    }

    // Update booking with refund status
    await supabase
      .from('bookings')
      .update({
        refund_status: 'processing',
        refund_razorpay_id: result.id,
        refund_initiated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId)

    // Notify customer
    const pkgTitle = (booking.package as unknown as { title: string })?.title || 'your trip'
    const refundFormatted = `₹${(booking.refund_amount_paise / 100).toLocaleString('en-IN')}`
    await supabase.from('notifications').insert({
      user_id: booking.user_id,
      type: 'booking',
      title: 'Refund Initiated',
      body: `Refund of ${refundFormatted} for ${pkgTitle} has been initiated. It will reach your account in 5-7 business days.`,
      link: '/bookings',
    })

    revalidatePath('/admin/bookings')
    revalidatePath('/bookings')
    return { success: true, refundId: result.id }
  } catch (err) {
    return { error: `Refund failed: ${err instanceof Error ? err.message : 'Unknown error'}` }
  }
}

// ── Admin: Mark Refund as Complete ──────────────────────────
export async function markRefundComplete(bookingId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') return { error: 'Unauthorized' }

  const { data: booking } = await supabase
    .from('bookings')
    .select('user_id, refund_amount_paise, package:packages(title)')
    .eq('id', bookingId)
    .single()

  if (!booking) return { error: 'Booking not found' }

  await supabase
    .from('bookings')
    .update({ refund_status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', bookingId)

  // Notify customer
  const pkgTitle = (booking.package as unknown as { title: string })?.title || 'your trip'
  const refundFormatted = booking.refund_amount_paise ? `₹${(booking.refund_amount_paise / 100).toLocaleString('en-IN')}` : ''
  await supabase.from('notifications').insert({
    user_id: booking.user_id,
    type: 'booking',
    title: 'Refund Completed!',
    body: `Your refund of ${refundFormatted} for ${pkgTitle} has been credited to your account.`,
    link: '/bookings',
  })

  revalidatePath('/admin/bookings')
  revalidatePath('/bookings')
  return { success: true }
}

// ── Community Trip Payment (after host approves join request) ──

export type CommunityTripOrderOptions = {
  promoCode?: string | null
  useWalletCredits?: boolean
  /** When trip uses token deposit: charge full trip amount instead of token slice */
  payFullAmountForTokenTrip?: boolean
}

export async function createCommunityTripOrder(
  joinRequestId: string,
  options?: CommunityTripOrderOptions,
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

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
      '*, trip:packages(id, title, price_paise, host_id, departure_dates, departure_dates_closed, duration_days, join_preferences)',
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
    duration_days?: number
    join_preferences?: unknown
  }

  const grossList = trip.price_paise
  let promoOfferId: string | null = null
  let promoDiscountPaise = 0
  if (options?.promoCode?.trim()) {
    const pr = await validatePromoForCheckout(supabase, options.promoCode)
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
  const closedSet = new Set((trip.departure_dates_closed || []).map(tripDepartureDateKey))
  const depKeys = (trip.departure_dates || []).map(tripDepartureDateKey)
  const travelDate = depKeys.find(d => d >= today && !closedSet.has(d)) ?? null
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
        deposit_paise: depositPaiseInstant,
        wallet_deducted_paise: walletDeducted,
        discount_paise: discountTotalPaise,
        promo_offer_id: promoOfferId,
        stripe_session_id: null,
        stripe_payment_intent: null,
        confirmation_code: confirmationCode,
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

  await supabase.from('bookings').insert({
    user_id: user.id,
    package_id: trip.id,
    status: 'pending',
    travel_date: travelDate,
    guests: 1,
    total_amount_paise: afterDiscounts,
    deposit_paise: 0,
    wallet_deducted_paise: walletDeducted,
    discount_paise: discountTotalPaise,
    promo_offer_id: promoOfferId,
    stripe_session_id: order.id,
  })

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
