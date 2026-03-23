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

  const { data: pkg } = await supabase
    .from('packages')
    .select('*, destination:destinations(*)')
    .eq('id', packageId)
    .single()

  if (!pkg) {
    return { error: 'Package not found' }
  }

  // Server-side date validation
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const selectedDate = new Date(travelDate)
  if (selectedDate <= today) {
    return { error: 'Travel date must be in the future' }
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

  // Notify admins
  const { data: admins } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'admin')

  const pkgTitle = (booking.package as unknown as { title: string })?.title || 'a trip'
  for (const admin of admins || []) {
    await supabase.rpc('create_notification', {
      p_user_id: admin.id,
      p_type: 'booking',
      p_title: 'Cancellation Request',
      p_body: `A user requested cancellation for ${pkgTitle}`,
      p_link: '/admin/bookings',
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

  // Verify admin role
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') return { error: 'Unauthorized' }

  const updateData: Record<string, unknown> = {
    cancellation_status: approve ? 'approved' : 'denied',
    admin_cancellation_note: adminNote || null,
    updated_at: new Date().toISOString(),
  }

  if (approve) {
    updateData.status = 'cancelled'
    updateData.refund_amount_paise = refundAmountPaise || 0
    updateData.refund_note = adminNote || null
  }

  const { error } = await supabase
    .from('bookings')
    .update(updateData)
    .eq('id', bookingId)

  if (error) return { error: error.message }

  // Get booking to notify user
  const { data: booking } = await supabase
    .from('bookings')
    .select('user_id, package:packages(title), total_amount_paise')
    .eq('id', bookingId)
    .single()

  if (booking) {
    const pkgTitle = (booking.package as unknown as { title: string })?.title || 'your trip'
    const refundFormatted = refundAmountPaise ? `₹${(refundAmountPaise / 100).toLocaleString('en-IN')}` : '₹0'

    await supabase.rpc('create_notification', {
      p_user_id: booking.user_id,
      p_type: 'booking',
      p_title: approve ? 'Cancellation Approved' : 'Cancellation Denied',
      p_body: approve
        ? `Your cancellation for ${pkgTitle} was approved. Refund: ${refundFormatted}. ${adminNote || ''}`
        : `Your cancellation for ${pkgTitle} was denied. ${adminNote || ''}`,
      p_link: '/bookings',
    })
  }

  revalidatePath('/admin/bookings')
  revalidatePath('/bookings')
  return { success: true }
}
