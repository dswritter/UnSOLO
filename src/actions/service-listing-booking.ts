'use server'

import { createClient } from '@/lib/supabase/server'
import Razorpay from 'razorpay'
import crypto from 'crypto'

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
})

export async function createServiceListingOrder(
  listingId: string,
  bookingData: {
    check_in_date: string
    check_out_date?: string
    quantity: number
    applyCredits: boolean
    promoCode?: string
  },
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) {
      return { error: 'Please log in to book' }
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

    // Check availability
    if (listing.quantity_available != null && bookingData.quantity > listing.quantity_available) {
      return { error: 'Not enough availability' }
    }

    // Calculate price
    let totalPaise = listing.price_paise * bookingData.quantity
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
    let userProfile: any = null
    if (bookingData.applyCredits) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('credits')
        .eq('id', user.id)
        .single()

      userProfile = profile
      if (profile && profile.credits > 0) {
        creditsUsed = Math.min(profile.credits, totalPaise - discountPaise)
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
          booking_type: 'service',
          check_in_date: bookingData.check_in_date,
          check_out_date: bookingData.check_out_date,
          quantity: bookingData.quantity,
          amount_paise: finalAmount,
          wallet_deducted_paise: creditsUsed,
          status: 'confirmed',
          payment_status: 'paid',
          razorpay_payment_id: null,
          razorpay_order_id: null,
          promo_code: appliedPromoCode || null,
        })
        .select('id')
        .single()

      if (bookingError) {
        return { error: 'Failed to create booking' }
      }

      // Deduct credits
      if (creditsUsed > 0 && userProfile) {
        await supabase
          .from('profiles')
          .update({ credits: userProfile.credits - creditsUsed })
          .eq('id', user.id)
      }

      return {
        instant: true,
        bookingId: booking.id,
      }
    }

    // Create Razorpay order
    const order = await razorpay.orders.create({
      amount: finalAmount,
      currency: 'INR',
      receipt: `service-${listingId}-${Date.now()}`,
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
        booking_type: 'service',
        check_in_date: bookingData.check_in_date,
        check_out_date: bookingData.check_out_date,
        quantity: bookingData.quantity,
        amount_paise: finalAmount,
        wallet_deducted_paise: creditsUsed,
        status: 'pending',
        payment_status: 'pending',
        razorpay_order_id: order.id,
        promo_code: appliedPromoCode || null,
      })
      .select('id')
      .single()

    if (bookingError) {
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
      .select('id, amount_paise, user_id, service_listing_id, wallet_deducted_paise')
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
        .select('credits')
        .eq('id', user.id)
        .single()

      if (profile) {
        await supabase
          .from('profiles')
          .update({ credits: Math.max(0, profile.credits - booking.wallet_deducted_paise) })
          .eq('id', user.id)
      }
    }

    // Reduce availability if quantity_available is set
    if (booking.service_listing_id) {
      const { data: listing } = await supabase
        .from('service_listings')
        .select('quantity_available')
        .eq('id', booking.service_listing_id)
        .single()

      if (listing && listing.quantity_available != null) {
        await supabase
          .from('service_listings')
          .update({ quantity_available: Math.max(0, listing.quantity_available - 1) })
          .eq('id', booking.service_listing_id)
      }
    }

    return { success: true, bookingId: booking.id }
  } catch (error) {
    console.error('Error confirming service listing payment:', error)
    return { error: 'Payment verification failed', success: false }
  }
}
