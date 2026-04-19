import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  PENDING_BOOKING_EXPIRY_HOURS,
  GROUP_PAYMENT_DEADLINE_HOURS,
  TOKEN_BALANCE_REMINDER_DAYS_BEFORE,
  APP_URL,
} from '@/lib/constants'
import { removeUserFromPackageTripChat } from '@/lib/chat/tripChatMembership'
import { sendTokenBalanceReminderEmail } from '@/lib/resend/emails'
import { isTokenDepositEnabled } from '@/lib/join-preferences'
import type { JoinPreferences } from '@/types'

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

  const results = {
    staleBookings: 0,
    expiredGroups: 0,
    refundsQueued: 0,
    reviewReminders: 0,
    statusStoriesPurged: 0,
    tokenBalanceReminders: 0,
  }

  try {
    await supabase.from('status_stories').delete().lt('expires_at', new Date().toISOString())
    results.statusStoriesPurged = 1
    // 1. Cancel stale pending bookings (> 48 hours old)
    const staleCutoff = new Date(Date.now() - PENDING_BOOKING_EXPIRY_HOURS * 3600000).toISOString()
    const { data: staleBookings } = await supabase
      .from('bookings')
      .select('id, user_id, package_id, package:packages(title)')
      .eq('status', 'pending')
      .lt('created_at', staleCutoff)

    for (const booking of staleBookings || []) {
      await supabase
        .from('bookings')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', booking.id)

      if (booking.user_id && booking.package_id) {
        await removeUserFromPackageTripChat(supabase, booking.user_id, booking.package_id)
      }

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
      .select('id, user_id, guests, travel_date, package:packages(title, slug, duration_days, departure_dates, return_dates, destination_id)')
      .eq('status', 'confirmed')
      .lte('travel_date', today)
      .limit(50)

    for (const booking of confirmedBookings || []) {
      const pkg = booking.package as unknown as {
        title: string
        slug: string
        duration_days?: number
        departure_dates?: string[] | null
        return_dates?: string[] | null
        destination_id?: string
      }
      const deps = pkg?.departure_dates || []
      const rets = pkg?.return_dates || []
      const idx = deps.indexOf(booking.travel_date)
      let endDateStr: string
      if (idx >= 0 && rets[idx]) {
        endDateStr = rets[idx]
      } else {
        const endDate = new Date(booking.travel_date + 'T12:00:00')
        endDate.setDate(endDate.getDate() + Math.max(0, (pkg?.duration_days || 1) - 1))
        endDateStr = endDate.toISOString().split('T')[0]
      }

      // If trip has ended (end date <= today), auto-complete
      if (endDateStr <= today) {
        await supabase.from('bookings').update({ status: 'completed' }).eq('id', booking.id)

        // Leaderboard inputs only — total_score is generated. Completed bookings only;
        // trips_completed = sum of guests (25 pts per guest in DB formula).
        const { data: completedRows } = await supabase
          .from('bookings')
          .select('guests, package:packages(destination_id)')
          .eq('user_id', booking.user_id)
          .eq('status', 'completed')

        const guestTripUnits = (completedRows || []).reduce(
          (sum, b) => sum + Math.max(Number(b.guests) || 1, 1),
          0,
        )
        const allDestIds = new Set(
          (completedRows || []).map(b => (b.package as unknown as { destination_id?: string })?.destination_id).filter(Boolean),
        )

        const { count: reviewCount } = await supabase
          .from('reviews')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', booking.user_id)

        await supabase.from('leaderboard_scores').upsert({
          user_id: booking.user_id,
          trips_completed: guestTripUnits,
          destinations_count: allDestIds.size,
          reviews_written: reviewCount || 0,
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
              body: `Thanks for traveling with UnSOLO! Share your experience on ${pkg.title} and earn 5 leaderboard points.`,
              link: `/packages/${pkg.slug}#reviews`,
            })
          }
        }

        results.reviewReminders++
      }
    }

    // 4. Token bookings: reminder 7 days before departure if balance unpaid
    const remindDay = new Date()
    remindDay.setDate(remindDay.getDate() + TOKEN_BALANCE_REMINDER_DAYS_BEFORE)
    const remindDateStr = remindDay.toISOString().split('T')[0]

    const { data: tokenBalanceRows } = await supabase
      .from('bookings')
      .select(
        'id, user_id, total_amount_paise, deposit_paise, travel_date, package:packages(title, slug, host_id, join_preferences)',
      )
      .eq('status', 'confirmed')
      .eq('travel_date', remindDateStr)

    for (const b of tokenBalanceRows || []) {
      const pkg = b.package as unknown as {
        title: string
        host_id: string | null
        join_preferences: JoinPreferences | null
      } | null
      if (!pkg?.host_id) continue
      if (!isTokenDepositEnabled(pkg.join_preferences)) continue
      const paid = b.deposit_paise || 0
      if (paid >= b.total_amount_paise) continue
      const balance = b.total_amount_paise - paid

      await supabase.from('notifications').insert({
        user_id: b.user_id,
        type: 'booking',
        title: 'Complete your trip payment',
        body: `Your trip "${pkg.title}" starts in ${TOKEN_BALANCE_REMINDER_DAYS_BEFORE} days. Pay ${(balance / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })} from My Trips.`,
        link: '/bookings',
      })

      try {
        const { data: authData } = await supabase.auth.admin.getUserById(b.user_id)
        const email = authData?.user?.email
        if (email) {
          await sendTokenBalanceReminderEmail({
            to: email,
            tripTitle: pkg.title,
            balancePaise: balance,
            travelDateIso: b.travel_date,
            bookingsUrl: `${APP_URL}/bookings`,
          })
        }
      } catch {
        /* email optional */
      }
      results.tokenBalanceReminders++
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
