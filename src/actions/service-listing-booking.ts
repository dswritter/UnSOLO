'use server'

import { createClient } from '@/lib/supabase/server'
import Razorpay from 'razorpay'
import crypto from 'crypto'
import { getPlatformFeePercentByCategory } from '@/lib/platform-settings'
import { splitHostEarning } from '@/lib/community-payment'
import { sendServiceBookingConfirmedEmail } from '@/lib/resend/emails'
import type { ServiceEventScheduleEntry, ServiceListingType } from '@/types'

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
})

type SupabaseFromCreateClient = Awaited<ReturnType<typeof createClient>>

async function deductInventory(
  supabase: SupabaseFromCreateClient,
  listingId: string,
  itemId: string | null | undefined,
  quantity: number,
) {
  if (itemId) {
    const { data: item } = await supabase
      .from('service_listing_items')
      .select('quantity_available')
      .eq('id', itemId)
      .single()
    if (item && item.quantity_available != null) {
      await supabase
        .from('service_listing_items')
        .update({ quantity_available: Math.max(0, item.quantity_available - quantity) })
        .eq('id', itemId)
    }
    return
  }
  const { data: listing } = await supabase
    .from('service_listings')
    .select('quantity_available')
    .eq('id', listingId)
    .single()
  if (listing && listing.quantity_available != null) {
    await supabase
      .from('service_listings')
      .update({ quantity_available: Math.max(0, listing.quantity_available - quantity) })
      .eq('id', listingId)
  }
}

export async function createServiceListingOrder(
  listingId: string,
  bookingData: {
    check_in_date: string
    check_out_date?: string
    quantity: number
    applyCredits: boolean
    promoCode?: string
    service_listing_item_id?: string
    /** Activities only: required when the listing has slots on the chosen date. */
    booking_slot_start?: string
    booking_slot_end?: string
    /** Rentals only: number of days/nights. Used to multiply price and compute check_out_date. */
    rental_days?: number
  },
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) {
      return { error: 'Please log in to book' }
    }

    // Validate check-in date
    if (!bookingData.check_in_date) {
      return { error: 'Please select a date' }
    }
    const todayStr = new Date().toISOString().slice(0, 10)
    if (bookingData.check_in_date < todayStr) {
      return { error: 'Booking date cannot be in the past' }
    }

    // Fetch listing
    const { data: listing, error: listingError } = await supabase
      .from('service_listings')
      .select('*')
      .eq('id', listingId)
      .eq('is_active', true)
      .single()

    if (listingError || !listing) {
      return { error: 'Listing not found or inactive' }
    }

    // Activities with a schedule: the traveler must pick a listed date, and
    // a listed slot on that date when the host defined slots. Reject out-of-band
    // combos so the stored booking is guaranteed to line up with what the host
    // published.
    let slotStart: string | null = null
    let slotEnd: string | null = null
    if (listing.type === 'activities') {
      const schedule = (listing.event_schedule as ServiceEventScheduleEntry[] | null) ?? null
      if (schedule && schedule.length > 0) {
        const entry = schedule.find(e => e.date === bookingData.check_in_date)
        if (!entry) {
          return { error: 'Selected date is not part of this activity\'s schedule' }
        }
        if (entry.slots && entry.slots.length > 0) {
          if (!bookingData.booking_slot_start || !bookingData.booking_slot_end) {
            return { error: 'Please pick a time slot' }
          }
          const matched = entry.slots.find(
            s => s.start === bookingData.booking_slot_start && s.end === bookingData.booking_slot_end,
          )
          if (!matched) {
            return { error: 'Selected time slot is not available' }
          }
          slotStart = matched.start
          slotEnd = matched.end
        }
      }
    }

    // If an item is specified, it drives price and inventory checks.
    let unitPricePaise: number = listing.price_paise
    let itemId: string | null = null
    if (bookingData.service_listing_item_id) {
      const { data: item, error: itemError } = await supabase
        .from('service_listing_items')
        .select('id, service_listing_id, price_paise, quantity_available, max_per_booking, is_active')
        .eq('id', bookingData.service_listing_item_id)
        .single()
      if (itemError || !item || !item.is_active || item.service_listing_id !== listingId) {
        return { error: 'Selected item is unavailable' }
      }
      if (bookingData.quantity > item.max_per_booking) {
        return { error: `Maximum ${item.max_per_booking} per booking for this item` }
      }
      if (item.quantity_available != null && bookingData.quantity > item.quantity_available) {
        return { error: 'Not enough availability for this item' }
      }
      unitPricePaise = item.price_paise
      itemId = item.id
    } else if (listing.quantity_available != null && bookingData.quantity > listing.quantity_available) {
      return { error: 'Not enough availability' }
    }

    // Calculate price (rentals multiply by duration)
    const rentalDays = listing.type === 'rentals' ? Math.max(1, bookingData.rental_days ?? 1) : 1
    let totalPaise = unitPricePaise * bookingData.quantity * rentalDays

    // Compute checkout date for rentals when not explicitly provided
    if (listing.type === 'rentals' && !bookingData.check_out_date && rentalDays > 0) {
      const d = new Date(bookingData.check_in_date)
      d.setDate(d.getDate() + rentalDays)
      bookingData = { ...bookingData, check_out_date: d.toISOString().slice(0, 10) }
    }
    let discountPaise = 0
    let appliedPromoCode = ''

    // Apply promo code if provided
    if (bookingData.promoCode) {
      const { data: promo } = await supabase
        .from('promo_codes')
        .select('discount_paise')
        .eq('code', bookingData.promoCode.toUpperCase())
        .eq('is_active', true)
        .single()

      if (promo) {
        discountPaise = promo.discount_paise
        appliedPromoCode = bookingData.promoCode
      }
    }

    // Apply credits if requested
    let creditsUsed = 0
    let userProfile: { referral_credits_paise: number } | null = null
    if (bookingData.applyCredits) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('referral_credits_paise')
        .eq('id', user.id)
        .single()

      userProfile = profile
      if (profile && profile.referral_credits_paise > 0) {
        creditsUsed = Math.min(profile.referral_credits_paise, totalPaise - discountPaise)
      }
    }

    const finalAmount = Math.max(0, totalPaise - discountPaise - creditsUsed)

    // If amount is 0, create instant booking without Razorpay
    if (finalAmount === 0) {
      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .insert({
          user_id: user.id,
          service_listing_id: listingId,
          service_listing_item_id: itemId,
          booking_type: 'service',
          check_in_date: bookingData.check_in_date,
          check_out_date: bookingData.check_out_date,
          quantity: bookingData.quantity,
          total_amount_paise: totalPaise,
          amount_paise: finalAmount,
          gross_paise: totalPaise,
          discount_paise: discountPaise,
          wallet_deducted_paise: creditsUsed,
          booking_slot_start: slotStart,
          booking_slot_end: slotEnd,
          status: 'confirmed',
          payment_status: 'paid',
          razorpay_payment_id: null,
          razorpay_order_id: null,
          promo_code: appliedPromoCode || null,
        })
        .select('id')
        .single()

      if (bookingError) {
        console.error('service booking insert error (instant):', bookingError)
        return { error: 'Failed to create booking' }
      }

      // Deduct credits
      if (creditsUsed > 0 && userProfile) {
        await supabase
          .from('profiles')
          .update({ referral_credits_paise: userProfile.referral_credits_paise - creditsUsed })
          .eq('id', user.id)
      }

      await deductInventory(supabase, listingId, itemId, bookingData.quantity)

      return {
        instant: true,
        bookingId: booking.id,
      }
    }

    // Create Razorpay order
    const order = await razorpay.orders.create({
      amount: finalAmount,
      currency: 'INR',
      receipt: `sl-${Date.now()}`,
      notes: {
        listing_id: listingId,
        user_id: user.id,
        listing_type: listing.type,
      },
    })

    // Create booking record in pending state
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        user_id: user.id,
        service_listing_id: listingId,
        service_listing_item_id: itemId,
        booking_type: 'service',
        check_in_date: bookingData.check_in_date,
        check_out_date: bookingData.check_out_date,
        quantity: bookingData.quantity,
        total_amount_paise: totalPaise,
        amount_paise: finalAmount,
        gross_paise: totalPaise,
        discount_paise: discountPaise,
        wallet_deducted_paise: creditsUsed,
        booking_slot_start: slotStart,
        booking_slot_end: slotEnd,
        status: 'pending',
        payment_status: 'pending',
        razorpay_order_id: order.id,
        promo_code: appliedPromoCode || null,
      })
      .select('id')
      .single()

    if (bookingError) {
      console.error('createServiceListingOrder insert:', bookingError)
      return { error: 'Failed to create booking' }
    }

    return {
      orderId: order.id,
      keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
      amount: finalAmount,
      currency: 'INR',
      bookingId: booking.id,
      prefill: {
        email: user.email,
      },
      notes: {
        listing_id: listingId,
        booking_id: booking.id,
      },
    }
  } catch (error) {
    console.error('Error creating service listing order:', error)
    return { error: 'Failed to create order. Please try again.' }
  }
}

export async function confirmServiceListingPayment(
  orderId: string,
  paymentId: string,
  signature: string,
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) {
      return { error: 'Please log in', success: false }
    }

    // Verify signature
    const body = orderId + '|' + paymentId
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
      .update(body)
      .digest('hex')

    if (expectedSignature !== signature) {
      return { error: 'Payment verification failed', success: false }
    }

    // Get booking by order ID
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, amount_paise, gross_paise, discount_paise, user_id, service_listing_id, service_listing_item_id, quantity, wallet_deducted_paise, check_in_date, check_out_date')
      .eq('razorpay_order_id', orderId)
      .eq('user_id', user.id)
      .single()

    if (bookingError || !booking) {
      return { error: 'Booking not found', success: false }
    }

    // Update booking status
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        status: 'confirmed',
        payment_status: 'paid',
        razorpay_payment_id: paymentId,
      })
      .eq('id', booking.id)

    if (updateError) {
      return { error: 'Failed to update booking', success: false }
    }

    // Deduct wallet credits if any
    if (booking.wallet_deducted_paise > 0) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('referral_credits_paise')
        .eq('id', user.id)
        .single()

      if (profile) {
        await supabase
          .from('profiles')
          .update({ referral_credits_paise: Math.max(0, profile.referral_credits_paise - booking.wallet_deducted_paise) })
          .eq('id', user.id)
      }
    }

    if (booking.service_listing_id) {
      await deductInventory(
        supabase,
        booking.service_listing_id,
        booking.service_listing_item_id,
        booking.quantity ?? 1,
      )
    }

    // Record host earnings ledger entry so admin can see and pay out the host.
    // Host share is always gross × (1 − fee%); discounts come out of platform share only.
    const grossPaise = booking.gross_paise || booking.amount_paise || 0
    if (booking.service_listing_id && grossPaise > 0) {
      try {
        const { data: listing } = await supabase
          .from('service_listings')
          .select('host_id, type, title')
          .eq('id', booking.service_listing_id)
          .single()

        if (listing?.host_id) {
          const feePercent = await getPlatformFeePercentByCategory(listing.type as ServiceListingType)
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

          const { createClient: createSC } = await import('@supabase/supabase-js')
          const svc = createSC(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
          )

          await svc.from('host_earnings').insert({
            booking_id: booking.id,
            host_id: listing.host_id,
            total_paise: grossPaise,
            platform_fee_paise: platformGrossPaise,
            platform_net_paise: platformNetPaise,
            promo_paise: promoPaise,
            wallet_paise: walletPaise,
            host_paise: hostPaise,
            payout_status: 'pending',
          })

          const hostAmountFmt = '₹' + (hostPaise / 100).toLocaleString('en-IN')
          await svc.from('notifications').insert({
            user_id: listing.host_id,
            type: 'split_payment',
            title: 'New booking — payout recorded',
            body: `A traveller booked "${listing.title}". Your earnings: ${hostAmountFmt} (list price includes a ${feePercent}% platform fee).`,
            link: '/host',
          })
        }
      } catch (err) {
        console.error('Failed to record host earnings for service booking:', err)
        /* non-critical — booking is already confirmed */
      }
    }

    // Send confirmation email (non-critical)
    try {
      const { data: listingForEmail } = await supabase
        .from('service_listings')
        .select('title, type, location')
        .eq('id', booking.service_listing_id!)
        .single()

      if (user.email && listingForEmail) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single()

        await sendServiceBookingConfirmedEmail({
          customerEmail: user.email,
          customerName: profile?.full_name,
          listingTitle: listingForEmail.title,
          listingType: listingForEmail.type,
          location: listingForEmail.location,
          checkInDate: booking.check_in_date ?? '',
          checkOutDate: booking.check_out_date,
          quantity: booking.quantity ?? 1,
          amountPaise: booking.amount_paise ?? 0,
          bookingId: booking.id,
        })
      }
    } catch (err) {
      console.error('Failed to send booking confirmation email:', err)
    }

    return { success: true, bookingId: booking.id }
  } catch (error) {
    console.error('Error confirming service listing payment:', error)
    return { error: 'Payment verification failed', success: false }
  }
}

// ─── Rental cart: book multiple item types in one Razorpay order ─────────────

export async function createRentalCartOrder(
  listingId: string,
  cartItems: { itemId: string; quantity: number }[],
  bookingData: {
    check_in_date: string
    rental_days: number
    applyCredits: boolean
    promoCode?: string
  },
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) return { error: 'Please log in to book' }

    if (!cartItems.length) return { error: 'Cart is empty' }

    const rentalDays = Math.max(1, bookingData.rental_days)
    const checkOutDate = (() => {
      const d = new Date(bookingData.check_in_date)
      d.setDate(d.getDate() + rentalDays)
      return d.toISOString().slice(0, 10)
    })()

    // Validate listing
    const { data: listing } = await supabase
      .from('service_listings')
      .select('id, type, price_paise, host_id, title')
      .eq('id', listingId)
      .eq('is_active', true)
      .single()
    if (!listing) return { error: 'Listing not found or inactive' }

    // Validate each cart item & calculate gross total
    let grossPaise = 0
    type ValidatedItem = {
      id: string
      quantity: number
      pricePaise: number
      max_per_booking: number | null
      quantity_available: number | null
    }
    const validated: ValidatedItem[] = []

    for (const ci of cartItems) {
      if (ci.quantity < 1) continue
      const { data: item } = await supabase
        .from('service_listing_items')
        .select('id, price_paise, quantity_available, max_per_booking, is_active, service_listing_id')
        .eq('id', ci.itemId)
        .single()
      if (!item || !item.is_active || item.service_listing_id !== listingId) {
        return { error: `Item not available` }
      }
      if (item.max_per_booking != null && ci.quantity > item.max_per_booking) {
        return { error: `Max ${item.max_per_booking} per booking for this item` }
      }
      if (item.quantity_available != null && ci.quantity > item.quantity_available) {
        return { error: `Not enough stock for one of the items` }
      }
      grossPaise += item.price_paise * ci.quantity * rentalDays
      validated.push({ id: ci.itemId, quantity: ci.quantity, pricePaise: item.price_paise, max_per_booking: item.max_per_booking, quantity_available: item.quantity_available })
    }

    if (!validated.length) return { error: 'Cart is empty' }

    // Promo
    let discountPaise = 0
    let appliedPromoCode = ''
    if (bookingData.promoCode) {
      const { data: promo } = await supabase
        .from('promo_codes')
        .select('discount_paise')
        .eq('code', bookingData.promoCode.toUpperCase())
        .eq('is_active', true)
        .single()
      if (promo) { discountPaise = promo.discount_paise; appliedPromoCode = bookingData.promoCode }
    }

    // Credits
    let creditsUsed = 0
    let userProfile: { referral_credits_paise: number } | null = null
    if (bookingData.applyCredits) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('referral_credits_paise')
        .eq('id', user.id)
        .single()
      userProfile = profile
      if (profile && profile.referral_credits_paise > 0) {
        creditsUsed = Math.min(profile.referral_credits_paise, grossPaise - discountPaise)
      }
    }

    const finalAmount = Math.max(0, grossPaise - discountPaise - creditsUsed)

    // Create Razorpay order
    const order = await razorpay.orders.create({
      amount: finalAmount,
      currency: 'INR',
      receipt: `rc-${Date.now()}`,
      notes: { listing_id: listingId, user_id: user.id },
    })

    // Create one pending booking per cart item, all sharing the same razorpay_order_id
    // Distribute discount/credits proportionally by item gross
    const bookingIds: string[] = []
    for (const v of validated) {
      const itemGross = v.pricePaise * v.quantity * rentalDays
      const ratio = grossPaise > 0 ? itemGross / grossPaise : 1 / validated.length
      const itemDiscount = Math.round(discountPaise * ratio)
      const itemCredits = Math.round(creditsUsed * ratio)
      const itemFinal = Math.round(finalAmount * ratio)

      const { data: booking, error: rowError } = await supabase
        .from('bookings')
        .insert({
          user_id: user.id,
          service_listing_id: listingId,
          service_listing_item_id: v.id,
          booking_type: 'service',
          check_in_date: bookingData.check_in_date,
          check_out_date: checkOutDate,
          quantity: v.quantity,
          // Required NOT NULL; line list total before split discounts (matches gross_paise).
          total_amount_paise: itemGross,
          amount_paise: itemFinal,
          gross_paise: itemGross,
          discount_paise: itemDiscount,
          wallet_deducted_paise: itemCredits,
          status: 'pending',
          payment_status: 'pending',
          razorpay_order_id: order.id,
          promo_code: appliedPromoCode || null,
        })
        .select('id')
        .single()
      if (rowError) {
        console.error('createRentalCartOrder booking row:', rowError)
      }
      if (booking) bookingIds.push(booking.id)
    }

    if (!bookingIds.length) {
      return { error: 'Failed to create bookings' }
    }

    return {
      orderId: order.id,
      keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
      amount: finalAmount,
      currency: 'INR',
      bookingIds,
      prefill: { email: user.email },
    }
  } catch (error) {
    console.error('Error creating rental cart order:', error)
    return { error: 'Failed to create order. Please try again.' }
  }
}

export async function confirmRentalCartPayment(
  orderId: string,
  paymentId: string,
  signature: string,
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) return { error: 'Please log in', success: false }

    const body = orderId + '|' + paymentId
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
      .update(body)
      .digest('hex')
    if (expectedSignature !== signature) return { error: 'Payment verification failed', success: false }

    // Get all bookings for this order
    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, service_listing_id, service_listing_item_id, quantity, gross_paise, discount_paise, wallet_deducted_paise, amount_paise, check_in_date, check_out_date')
      .eq('razorpay_order_id', orderId)
      .eq('user_id', user.id)

    if (!bookings?.length) return { error: 'Bookings not found', success: false }

    // Confirm all bookings
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ status: 'confirmed', payment_status: 'paid', razorpay_payment_id: paymentId })
      .eq('razorpay_order_id', orderId)
      .eq('user_id', user.id)

    if (updateError) return { error: 'Failed to update bookings', success: false }

    // Deduct wallet credits now that payment is confirmed
    const totalWalletUsed = bookings.reduce((s, b) => s + (b.wallet_deducted_paise ?? 0), 0)
    if (totalWalletUsed > 0) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('referral_credits_paise')
        .eq('id', user.id)
        .single()
      if (profile) {
        await supabase
          .from('profiles')
          .update({ referral_credits_paise: Math.max(0, profile.referral_credits_paise - totalWalletUsed) })
          .eq('id', user.id)
      }
    }

    // Deduct inventory for each item
    for (const booking of bookings) {
      if (booking.service_listing_id) {
        await deductInventory(supabase, booking.service_listing_id, booking.service_listing_item_id, booking.quantity ?? 1)
      }
    }

    // Record host earnings for the first booking's listing (shared host)
    try {
      const firstBooking = bookings[0]
      if (firstBooking.service_listing_id) {
        const { data: listing } = await supabase
          .from('service_listings')
          .select('host_id, type, title')
          .eq('id', firstBooking.service_listing_id)
          .single()

        if (listing?.host_id) {
          const feePercent = await getPlatformFeePercentByCategory(listing.type as ServiceListingType)
          const totalGross = bookings.reduce((s, b) => s + (b.gross_paise || 0), 0)
          const totalPromo = bookings.reduce((s, b) => s + (b.discount_paise || 0), 0)
          const totalWallet = bookings.reduce((s, b) => s + (b.wallet_deducted_paise || 0), 0)
          const { hostPaise, platformGrossPaise, platformNetPaise, promoPaise, walletPaise } = splitHostEarning({
            grossPaise: totalGross,
            feePercent,
            promoPaise: totalPromo,
            walletPaise: totalWallet,
          })

          const { createClient: createSC } = await import('@supabase/supabase-js')
          const svc = createSC(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
          await svc.from('host_earnings').insert({
            booking_id: firstBooking.id,
            host_id: listing.host_id,
            total_paise: totalGross,
            platform_fee_paise: platformGrossPaise,
            platform_net_paise: platformNetPaise,
            promo_paise: promoPaise,
            wallet_paise: walletPaise,
            host_paise: hostPaise,
            payout_status: 'pending',
          })
          await svc.from('notifications').insert({
            user_id: listing.host_id,
            type: 'split_payment',
            title: 'New rental cart booking — payout recorded',
            body: `A traveller booked multiple rentals from "${listing.title}". Your earnings: ₹${(hostPaise / 100).toLocaleString('en-IN')} (${feePercent}% platform fee).`,
            link: '/host',
          })
        }
      }
    } catch (err) {
      console.error('Failed to record host earnings for rental cart:', err)
    }

    // Send confirmation email (non-critical)
    try {
      const firstBooking = bookings[0]
      if (user.email && firstBooking.service_listing_id) {
        const { data: listingForEmail } = await supabase
          .from('service_listings')
          .select('title, type, location')
          .eq('id', firstBooking.service_listing_id)
          .single()

        if (listingForEmail) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', user.id)
            .single()

          // Build cart summary from all booking rows + their items
          const cartSummary: { name: string; qty: number; pricePaise: number }[] = []
          for (const b of bookings) {
            if (b.service_listing_item_id) {
              const { data: item } = await supabase
                .from('service_listing_items')
                .select('name, price_paise')
                .eq('id', b.service_listing_item_id)
                .single()
              if (item) cartSummary.push({ name: item.name, qty: b.quantity ?? 1, pricePaise: item.price_paise })
            }
          }

          const totalPaid = bookings.reduce((s, b) => s + (b.amount_paise ?? 0), 0)
          const rentalDays = firstBooking.check_in_date && firstBooking.check_out_date
            ? Math.max(1, Math.round((new Date(firstBooking.check_out_date).getTime() - new Date(firstBooking.check_in_date).getTime()) / 86400000))
            : undefined

          await sendServiceBookingConfirmedEmail({
            customerEmail: user.email,
            customerName: profile?.full_name,
            listingTitle: listingForEmail.title,
            listingType: listingForEmail.type,
            location: listingForEmail.location,
            checkInDate: firstBooking.check_in_date ?? '',
            checkOutDate: firstBooking.check_out_date,
            quantity: bookings.reduce((s, b) => s + (b.quantity ?? 1), 0),
            amountPaise: totalPaid,
            bookingId: firstBooking.id,
            cartSummary: cartSummary.length > 0 ? cartSummary : undefined,
            rentalDays,
          })
        }
      }
    } catch (err) {
      console.error('Failed to send rental cart confirmation email:', err)
    }

    return { success: true, bookingIds: bookings.map(b => b.id) }
  } catch (error) {
    console.error('Error confirming rental cart payment:', error)
    return { error: 'Payment verification failed', success: false }
  }
}
