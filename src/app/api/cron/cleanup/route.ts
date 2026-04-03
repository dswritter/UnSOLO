import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { PENDING_BOOKING_EXPIRY_HOURS, GROUP_PAYMENT_DEADLINE_HOURS } from '@/lib/constants'

export async function POST(request: Request) {
  // Protect with secret
  const authHeader = request.headers.get('authorization')
  const secret = process.env.CRON_SECRET || 'unsolo-cron-secret'
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const results = { staleBookings: 0, expiredGroups: 0, refundsQueued: 0, reviewReminders: 0 }

  try {
    // 1. Cancel stale pending bookings (> 48 hours old)
    const staleCutoff = new Date(Date.now() - PENDING_BOOKING_EXPIRY_HOURS * 3600000).toISOString()
    const { data: staleBookings } = await supabase
      .from('bookings')
      .select('id, user_id, package:packages(title)')
      .eq('status', 'pending')
      .lt('created_at', staleCutoff)

    for (const booking of staleBookings || []) {
      await supabase
        .from('bookings')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', booking.id)

      const pkgTitle = (booking.package as unknown as { title: string })?.title || 'a trip'
      await supabase.from('notifications').insert({
        user_id: booking.user_id,
        type: 'booking',
        title: 'Booking Expired',
        body: `Your pending booking for ${pkgTitle} was cancelled because payment was not completed within ${PENDING_BOOKING_EXPIRY_HOURS} hours.`,
        link: '/explore',
      })
      results.staleBookings++
    }

    // 2. Cancel unpaid group bookings (> 24 hours old)
    const groupCutoff = new Date(Date.now() - GROUP_PAYMENT_DEADLINE_HOURS * 3600000).toISOString()
    const { data: expiredGroups } = await supabase
      .from('group_bookings')
      .select('id, organizer_id, package:packages(title)')
      .eq('status', 'open')
      .lt('created_at', groupCutoff)

    for (const group of expiredGroups || []) {
      // Find members who already paid — they need refunds
      const { data: paidMembers } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', group.id)
        .eq('status', 'paid')

      // Cancel the group
      await supabase
        .from('group_bookings')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', group.id)

      const pkgTitle = (group.package as unknown as { title: string })?.title || 'a group trip'

      // Notify organizer
      await supabase.from('notifications').insert({
        user_id: group.organizer_id,
        type: 'booking',
        title: 'Group Trip Expired',
        body: `Your group trip for ${pkgTitle} was auto-cancelled because not all members paid within ${GROUP_PAYMENT_DEADLINE_HOURS} hours.`,
        link: '/bookings',
      })

      // Queue refunds for paid members
      for (const member of paidMembers || []) {
        await supabase.from('notifications').insert({
          user_id: member.user_id,
          type: 'booking',
          title: 'Group Trip Cancelled — Refund Pending',
          body: `The group trip for ${pkgTitle} was auto-cancelled. Your payment will be refunded.`,
          link: '/bookings',
        })
        results.refundsQueued++
      }

      // Notify admins about refunds needed
      const { data: admins } = await supabase.from('profiles').select('id').in('role', ['admin'])
      for (const admin of admins || []) {
        await supabase.from('notifications').insert({
          user_id: admin.id,
          type: 'booking',
          title: 'Auto-Cancelled Group — Refunds Needed',
          body: `Group trip for ${pkgTitle} expired. ${(paidMembers || []).length} member(s) need refund.`,
          link: '/admin/bookings',
        })
      }

      results.expiredGroups++
    }

    // 3. Auto-complete confirmed bookings whose trip end date has passed
    // and send review reminders the day after trip ends
    const today = new Date().toISOString().split('T')[0]

    const { data: confirmedBookings } = await supabase
      .from('bookings')
      .select('id, user_id, travel_date, package:packages(title, slug, duration_days)')
      .eq('status', 'confirmed')

    for (const booking of confirmedBookings || []) {
      const pkg = booking.package as unknown as { title: string; slug: string; duration_days?: number }
      const duration = pkg?.duration_days || 1

      // Calculate trip end date from booking's travel_date
      const endDate = new Date(booking.travel_date)
      endDate.setDate(endDate.getDate() + duration)
      const endDateStr = endDate.toISOString().split('T')[0]

      // If trip has ended (end date <= today), auto-complete and send review notification
      if (endDateStr <= today) {
        // Mark as completed
        await supabase.from('bookings').update({ status: 'completed' }).eq('id', booking.id)

        // Send review reminder (if not already sent)
        if (pkg?.slug) {
          const { data: existing } = await supabase
            .from('notifications')
            .select('id')
            .eq('user_id', booking.user_id)
            .eq('type', 'review')
            .ilike('body', `%${pkg.slug}%`)
            .limit(1)

          if (!existing?.length) {
            await supabase.from('notifications').insert({
              user_id: booking.user_id,
              type: 'review',
              title: 'How was your trip?',
              body: `Thanks for traveling with UnSOLO! Share your experience on ${pkg.title} and earn 10 leaderboard points.`,
              link: `/packages/${pkg.slug}#reviews`,
            })
          }
        }

        results.reviewReminders++
      }
    }
  } catch (err) {
    return NextResponse.json({ error: String(err), results }, { status: 500 })
  }

  return NextResponse.json({ ok: true, results })
}

// Also support GET for testing
export async function GET(request: Request) {
  return POST(request)
}
