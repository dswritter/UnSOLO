'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { razorpay } from '@/lib/razorpay/client'

export async function createRazorpayOrder(
  packageId: string,
  travelDate: string,
  guests: number,
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

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

  // Server-side date validation — must be at least 1 day in the future
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const selectedDate = new Date(travelDate)
  if (selectedDate <= today) {
    return { error: 'Travel date must be in the future' }
  }

  // Duplicate booking prevention
  const { data: existingBooking } = await supabase
    .from('bookings')
    .select('id')
    .eq('user_id', user.id)
    .eq('package_id', packageId)
    .eq('travel_date', travelDate)
    .in('status', ['pending', 'confirmed'])
    .maybeSingle()
  if (existingBooking) {
    return { error: 'You already have a booking for this package on this date' }
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

  const totalPaise = pkg.price_paise * guests

  // Create Razorpay order
  const order = await razorpay.orders.create({
    amount: totalPaise,
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

  // Create a pending booking
  const { data: booking } = await supabase
    .from('bookings')
    .insert({
      user_id: user.id,
      package_id: packageId,
      status: 'pending',
      travel_date: travelDate,
      guests,
      total_amount_paise: totalPaise,
      stripe_session_id: order.id, // reusing column for razorpay order id
    })
    .select()
    .single()

  return {
    orderId: order.id,
    amount: totalPaise,
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

  // Update booking to confirmed
  const { generateConfirmationCode } = await import('@/lib/utils')
  const confirmationCode = generateConfirmationCode()

  const { data: booking } = await supabase
    .from('bookings')
    .update({
      status: 'confirmed',
      stripe_payment_intent: razorpayPaymentId, // reusing column
      confirmation_code: confirmationCode,
    })
    .eq('stripe_session_id', razorpayOrderId) // razorpay order id stored here
    .eq('user_id', user.id)
    .select('*, package:packages(*, destination:destinations(*))')
    .single()

  if (!booking) {
    return { error: 'Booking not found' }
  }

  // Find or create trip chat room
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
        created_by: user.id,
      })
      .select('id')
      .single()
    roomId = newRoom?.id
  }

  if (roomId) {
    await supabase.from('chat_room_members').upsert({
      room_id: roomId,
      user_id: user.id,
    })
    await supabase.from('messages').insert({
      room_id: roomId,
      user_id: null,
      content: `🎉 A new traveler has joined the trip! Booking #${confirmationCode}`,
      message_type: 'system',
    })
  }

  // Update leaderboard scores
  const { data: existing } = await supabase
    .from('leaderboard_scores')
    .select('*')
    .eq('user_id', user.id)
    .single()

  const { data: destData } = await supabase
    .from('bookings')
    .select('package:packages(destination_id)')
    .eq('user_id', user.id)
    .eq('status', 'confirmed')

  const uniqueDests = new Set(
    (destData || []).map((b) => {
      const pkg = b.package as { destination_id?: string } | null
      return pkg?.destination_id
    }).filter(Boolean)
  ).size

  if (existing) {
    await supabase
      .from('leaderboard_scores')
      .update({
        trips_completed: existing.trips_completed + 1,
        destinations_count: uniqueDests,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)
  } else {
    await supabase.from('leaderboard_scores').insert({
      user_id: user.id,
      trips_completed: 1,
      reviews_written: 0,
      destinations_count: uniqueDests,
    })
  }

  // Award badges
  await supabase.from('user_achievements').upsert({
    user_id: user.id,
    achievement_key: 'first_trip',
  })

  const pkgDetail = booking.package as { difficulty?: string } | null
  if (pkgDetail?.difficulty === 'challenging') {
    await supabase.from('user_achievements').upsert({
      user_id: user.id,
      achievement_key: 'trailblazer',
    })
  }

  // Notify admins about new booking
  try {
    const { createClient: createSC } = await import('@supabase/supabase-js')
    const svcSupabase = createSC(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data: customerProfile } = await supabase.from('profiles').select('full_name, username').eq('id', user.id).single()
    const customerName = customerProfile?.full_name || customerProfile?.username || 'A user'
    const pkgName = (booking.package as { title?: string })?.title || 'a trip'
    const amountFormatted = '₹' + (booking.total_amount_paise / 100).toLocaleString('en-IN')

    const { data: admins } = await svcSupabase.from('profiles').select('id').in('role', ['admin', 'social_media_manager', 'field_person', 'chat_responder'])
    for (const admin of admins || []) {
      await svcSupabase.from('notifications').insert({
        user_id: admin.id,
        type: 'booking',
        title: 'New Booking!',
        body: `${customerName} booked ${pkgName} for ${amountFormatted}. Code: ${confirmationCode}`,
        link: '/admin/bookings',
      })
    }
  } catch { /* non-critical */ }

  // ── Host Earnings: Track platform fee for community trips ────
  try {
    const pkg = booking.package as { host_id?: string } | null
    if (pkg?.host_id) {
      const { PLATFORM_FEE_PERCENT } = await import('@/lib/constants')
      const platformFee = Math.round(booking.total_amount_paise * PLATFORM_FEE_PERCENT / 100)
      const hostAmount = booking.total_amount_paise - platformFee

      const { createClient: createSC3 } = await import('@supabase/supabase-js')
      const svcSupa3 = createSC3(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

      await svcSupa3.from('host_earnings').insert({
        booking_id: booking.id,
        host_id: pkg.host_id,
        total_paise: booking.total_amount_paise,
        platform_fee_paise: platformFee,
        host_paise: hostAmount,
        payout_status: 'pending',
      })

      // Notify host
      const hostAmount_fmt = '₹' + (hostAmount / 100).toLocaleString('en-IN')
      await svcSupa3.from('notifications').insert({
        user_id: pkg.host_id,
        type: 'split_payment',
        title: 'New Booking on Your Trip!',
        body: `A traveler booked your trip. Your earnings: ${hostAmount_fmt} (after 15% platform fee)`,
        link: '/host',
      })
    }
  } catch { /* non-critical */ }

  // ── Referral Credit: Credit referrer on first booking ────────
  try {
    const { createClient: createSC2 } = await import('@supabase/supabase-js')
    const svcSupa = createSC2(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { REFERRAL_CREDIT_PAISE } = await import('@/lib/constants')

    // Check if this is user's first confirmed booking
    const { count: confirmedCount } = await svcSupa
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'confirmed')

    if (confirmedCount === 1) {
      // First booking! Check if user was referred
      const { data: userProfile } = await svcSupa
        .from('profiles')
        .select('referred_by')
        .eq('id', user.id)
        .single()

      if (userProfile?.referred_by) {
        // Credit the referrer
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

        // Update referral status
        await svcSupa
          .from('referrals')
          .update({ status: 'credited', credited_at: new Date().toISOString(), booking_id: booking.id })
          .eq('referrer_id', userProfile.referred_by)
          .eq('referred_id', user.id)

        // Notify referrer
        await svcSupa.from('notifications').insert({
          user_id: userProfile.referred_by,
          type: 'booking',
          title: 'Referral Reward!',
          body: `Your friend completed their first trip! You earned ₹${REFERRAL_CREDIT_PAISE / 100}!`,
          link: '/profile',
        })
      }
    }
  } catch { /* non-critical */ }

  return {
    success: true,
    confirmationCode,
    bookingId: booking.id,
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

    // Notify host if community trip
    try {
      const { data: pkg } = await supabase.from('packages').select('host_id, title').eq('id', packageId).single()
      if (pkg?.host_id && pkg.host_id !== user.id) {
        const { data: interestedUser } = await supabase.from('profiles').select('full_name, username').eq('id', user.id).single()
        const name = interestedUser?.full_name || interestedUser?.username || 'Someone'

        const { createClient: createSC } = await import('@supabase/supabase-js')
        const svcSupabase = createSC(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
        await svcSupabase.from('notifications').insert({
          user_id: pkg.host_id,
          type: 'group_invite',
          title: 'New Interest!',
          body: `${name} is interested in "${pkg.title}"`,
          link: `/host`,
        })
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
    .select('user_id, package:packages(title), total_amount_paise, stripe_payment_intent')
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

export async function createCommunityTripOrder(joinRequestId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, phone_number')
    .eq('id', user.id)
    .single()

  const { data: request } = await supabase
    .from('join_requests')
    .select('*, trip:packages(id, title, price_paise, host_id, departure_dates, duration_days)')
    .eq('id', joinRequestId)
    .eq('user_id', user.id)
    .single()

  if (!request) return { error: 'Join request not found' }
  if (request.status !== 'approved') return { error: 'Request not approved yet' }

  if (request.payment_deadline && new Date(request.payment_deadline) < new Date()) {
    return { error: 'Payment deadline has passed. Please request to join again.' }
  }

  const trip = request.trip as { id: string; title: string; price_paise: number; host_id: string; departure_dates?: string[]; duration_days?: number }
  const totalPaise = trip.price_paise

  const order = await razorpay.orders.create({
    amount: totalPaise,
    currency: 'INR',
    receipt: `unsolo_community_${Date.now()}`,
    notes: { userId: user.id, packageId: trip.id, joinRequestId: request.id, type: 'community_trip' },
  })

  const today = new Date().toISOString().split('T')[0]
  const travelDate = trip.departure_dates?.find(d => d >= today) || trip.departure_dates?.[0] || today

  await supabase.from('bookings').insert({
    user_id: user.id,
    package_id: trip.id,
    status: 'pending',
    travel_date: travelDate,
    guests: 1,
    total_amount_paise: totalPaise,
    stripe_session_id: order.id,
  })

  return {
    orderId: order.id,
    amount: totalPaise,
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
