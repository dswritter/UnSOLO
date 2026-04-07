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

    // 2. Cancel only UNPAID group members (> 24 hours old)
    // Paid members' bookings remain confirmed
    const groupCutoff = new Date(Date.now() - GROUP_PAYMENT_DEADLINE_HOURS * 3600000).toISOString()
    const { data: expiredGroups } = await supabase
      .from('group_bookings')
      .select('id, organizer_id, package:packages(title)')
      .eq('status', 'open')
      .lt('created_at', groupCutoff)

    for (const group of expiredGroups || []) {
      const pkgTitle = (group.package as unknown as { title: string })?.title || 'a group trip'

      // Find unpaid members — only cancel these
      const { data: unpaidMembers } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', group.id)
        .neq('status', 'paid')

      // Cancel unpaid members only
      for (const member of unpaidMembers || []) {
        await supabase
          .from('group_members')
          .update({ status: 'cancelled' })
          .eq('group_id', group.id)
          .eq('user_id', member.user_id)

        await supabase.from('notifications').insert({
          user_id: member.user_id,
          type: 'booking',
          title: 'Group Trip — Payment Expired',
          body: `Your spot in the group trip for ${pkgTitle} was cancelled because payment was not completed within ${GROUP_PAYMENT_DEADLINE_HOURS} hours.`,
          link: '/bookings',
        })
      }

      // Check if any paid members remain
      const { count: paidCount } = await supabase
        .from('group_members')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', group.id)
        .eq('status', 'paid')

      // Mark group as closed (not cancelled) — paid members keep their bookings
      await supabase
        .from('group_bookings')
        .update({ status: (paidCount || 0) > 0 ? 'closed' : 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', group.id)

      // Notify organizer
      await supabase.from('notifications').insert({
        user_id: group.organizer_id,
        type: 'booking',
        title: 'Group Trip Updated',
        body: (paidCount || 0) > 0
          ? `${(unpaidMembers || []).length} member(s) didn't pay for ${pkgTitle}. Paid members' bookings are confirmed.`
          : `Group trip for ${pkgTitle} was cancelled — no members completed payment.`,
        link: '/bookings',
      })

      results.expiredGroups++
    }

    // 3. Auto-complete confirmed bookings whose trip end date has passed
    // and send review reminders the day after trip ends
    const today = new Date().toISOString().split('T')[0]

    const { data: confirmedBookings } = await supabase
      .from('bookings')
      .select('id, user_id, guests, travel_date, package:packages(title, slug, duration_days, destination_id)')
      .eq('status', 'confirmed')
      .lte('travel_date', today)
      .limit(50)

    for (const booking of confirmedBookings || []) {
      const pkg = booking.package as unknown as { title: string; slug: string; duration_days?: number; destination_id?: string }
      const duration = pkg?.duration_days || 1
      const guestCount = booking.guests || 1

      // Calculate trip end date from booking's travel_date
      const endDate = new Date(booking.travel_date)
      endDate.setDate(endDate.getDate() + duration)
      const endDateStr = endDate.toISOString().split('T')[0]

      // If trip has ended (end date <= today), auto-complete
      if (endDateStr <= today) {
        await supabase.from('bookings').update({ status: 'completed' }).eq('id', booking.id)

        // Update leaderboard: 25pts per guest, 15pts for new destination
        const { data: completedBookings } = await supabase
          .from('bookings')
          .select('guests, package:packages(destination_id)')
          .eq('user_id', booking.user_id)
          .in('status', ['completed'])

        const totalTrips = (completedBookings || []).reduce((sum, b) => sum + (b.guests || 1), 0) + guestCount
        const allDestIds = new Set(
          (completedBookings || []).map(b => (b.package as unknown as { destination_id?: string })?.destination_id).filter(Boolean)
        )
        if (pkg?.destination_id) allDestIds.add(pkg.destination_id)

        const { data: reviews } = await supabase
          .from('reviews')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', booking.user_id)

        const reviewCount = reviews?.length || 0
        const totalScore = (totalTrips * 25) + (allDestIds.size * 15) + (reviewCount * 10)

        await supabase.from('leaderboard_scores').upsert({
          user_id: booking.user_id,
          trips_completed: totalTrips,
          destinations_count: allDestIds.size,
          reviews_written: reviewCount,
          total_score: totalScore,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })

        // Award first trip badge
        await supabase.from('user_achievements').upsert({
          user_id: booking.user_id,
          achievement_key: 'first_trip',
        }, { onConflict: 'user_id,achievement_key' })

        // Send review reminder
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
