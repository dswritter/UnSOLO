export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getRequestAuth } from '@/lib/auth/request-session'
import { BookOpen } from 'lucide-react'
import type { Booking } from '@/types'
import { BookingsClient } from './BookingsClient'
import { EmptyState } from '@/components/ui/EmptyState'

/** Community-trip join requests not yet fully booked (deduped against active bookings). */
export type IncompleteTripStatus = 'awaiting_unsolo' | 'awaiting_host' | 'payment_pending'

export type IncompleteJoinTrip = {
  joinRequestId: string
  status: IncompleteTripStatus
  paymentDeadline: string | null
  updatedAt: string
  trip: {
    id: string
    title: string
    slug: string
    images: string[] | null
    duration_days: number
    departure_dates: string[] | null
    return_dates?: string[] | null
    destination: { name: string; state: string } | null
  }
}

export type GroupBookingInfo = {
  id: string
  package_id: string
  travel_date: string
  per_person_paise: number
  max_members: number
  status: string
  invite_code: string
  organizer_id: string
  created_at: string
  my_status: string // invited | accepted | paid
  package?: {
    title: string
    slug: string
    images?: string[]
    duration_days?: number
    departure_dates?: string[] | null
    return_dates?: string[] | null
    destination?: { name: string; state: string }
  }
  organizer?: { full_name: string | null; username: string }
  members: { user_id: string; status: string; full_name: string | null; username: string }[]
  total_paid: number
  total_members: number
}

export default async function BookingsPage() {
  const { supabase, user } = await getRequestAuth()
  if (!user) redirect('/login')

  const { data } = await supabase
    .from('bookings')
    .select('*, package:packages(*, destination:destinations(*)), service_listings(*)')
    .eq('user_id', user.id)
    .is('user_dismissed_at', null)
    .order('created_at', { ascending: false })

  // Check which bookings already have reviews
  const { data: reviews } = await supabase
    .from('reviews')
    .select('booking_id')
    .eq('user_id', user.id)

  const reviewedBookingIds = new Set((reviews || []).map(r => r.booking_id))

  // Check which bookings already have host ratings
  const { data: hostRatings } = await supabase
    .from('host_ratings')
    .select('booking_id')
    .eq('user_id', user.id)

  const ratedHostBookingIds = new Set((hostRatings || []).map(r => r.booking_id))
  const bookings = (data || []) as Booking[]

  // Separate trip bookings from service bookings
  const tripBookings = bookings.filter(b => b.booking_type !== 'service')
  const serviceBookings = bookings.filter(b => b.booking_type === 'service')

  const { data: joinRequestRows } = await supabase
    .from('join_requests')
    .select(
      `id, status, payment_deadline, updated_at,
      trip:packages(id, title, slug, images, moderation_status, host_id, duration_days, departure_dates, return_dates, destination:destinations(name, state))`,
    )
    .eq('user_id', user.id)
    .in('status', ['pending', 'approved'])

  const incompleteJoinTrips: IncompleteJoinTrip[] = []
  for (const row of joinRequestRows || []) {
    const trip = row.trip as unknown as {
      id: string
      title: string
      slug: string
      images: string[] | null
      moderation_status: string | null
      host_id: string | null
      duration_days: number
      departure_dates: string[] | null
      return_dates: string[] | null
      destination: { name: string; state: string } | null
    } | null
    if (!trip?.host_id) continue
    if (trip.moderation_status === 'rejected') continue

    const hasActiveBooking = bookings.some(
      b => b.package_id === trip.id && (b.status === 'pending' || b.status === 'confirmed'),
    )
    if (row.status === 'approved' && hasActiveBooking) continue

    let status: IncompleteTripStatus
    if (trip.moderation_status === 'pending') {
      status = 'awaiting_unsolo'
    } else if (row.status === 'pending') {
      status = 'awaiting_host'
    } else {
      status = 'payment_pending'
    }

    incompleteJoinTrips.push({
      joinRequestId: row.id,
      status,
      paymentDeadline: row.payment_deadline,
      updatedAt: row.updated_at,
      trip: {
        id: trip.id,
        title: trip.title,
        slug: trip.slug,
        images: trip.images,
        duration_days: trip.duration_days,
        departure_dates: trip.departure_dates,
        return_dates: trip.return_dates,
        destination: trip.destination,
      },
    })
  }

  incompleteJoinTrips.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )

  // Fetch group bookings where user is a member.
  // Uses 3 parallel queries instead of a loop that fired 2 DB round-trips
  // per group membership (N+1 pattern). All group rows + all member rows
  // are fetched in one shot each; assembly happens in JS.
  const { data: myMemberships } = await supabase
    .from('group_members')
    .select('group_id, status')
    .eq('user_id', user.id)

  const groupBookings: GroupBookingInfo[] = []
  if (myMemberships && myMemberships.length > 0) {
    const groupIds = myMemberships.map(m => m.group_id)

    const [{ data: groupRows }, { data: allMemberRows }] = await Promise.all([
      supabase
        .from('group_bookings')
        .select('*, package:packages(title, slug, images, duration_days, departure_dates, return_dates, destination:destinations(name, state)), organizer:profiles!group_bookings_organizer_id_fkey(full_name, username)')
        .in('id', groupIds),
      supabase
        .from('group_members')
        .select('group_id, user_id, status, user:profiles(full_name, username)')
        .in('group_id', groupIds),
    ])

    // Index members by group_id for O(1) lookup
    const membersByGroupId = new Map<string, NonNullable<typeof allMemberRows>>()
    for (const row of allMemberRows || []) {
      const list = membersByGroupId.get(row.group_id) ?? []
      list.push(row)
      membersByGroupId.set(row.group_id, list)
    }

    for (const group of groupRows || []) {
      const myMem = myMemberships.find(m => m.group_id === group.id)
      if (!myMem) continue
      const rawMembers = membersByGroupId.get(group.id) || []
      const memberList = rawMembers.map(m => ({
        user_id: m.user_id,
        status: m.status,
        full_name: (m.user as unknown as { full_name: string | null })?.full_name,
        username: (m.user as unknown as { username: string })?.username,
      }))

      groupBookings.push({
        id: group.id,
        package_id: group.package_id,
        travel_date: group.travel_date,
        per_person_paise: group.per_person_paise,
        max_members: group.max_members,
        status: group.status,
        invite_code: group.invite_code,
        organizer_id: group.organizer_id,
        created_at: group.created_at,
        my_status: myMem.status,
        package: group.package as GroupBookingInfo['package'],
        organizer: group.organizer as unknown as { full_name: string | null; username: string },
        members: memberList,
        total_paid: memberList.filter(m => m.status === 'paid').length,
        total_members: memberList.filter(m => m.status !== 'declined').length,
      })
    }
  }

  const hasContent =
    tripBookings.length > 0 || serviceBookings.length > 0 || groupBookings.length > 0 || incompleteJoinTrips.length > 0

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-black text-foreground">
            My <span className="text-primary">Bookings</span>
          </h1>
          <p className="text-muted-foreground mt-1">Your travel history and upcoming adventures</p>
        </div>

        {!hasContent ? (
          <EmptyState
            icon={BookOpen}
            title="No bookings yet"
            description="Start your solo adventure across India."
            action={{ label: 'Explore on Wander', href: '/wander' }}
            size="lg"
            dashed
          />
        ) : (
          <BookingsClient
            bookings={tripBookings}
            serviceBookings={serviceBookings}
            reviewedBookingIds={Array.from(reviewedBookingIds)}
            ratedHostBookingIds={Array.from(ratedHostBookingIds)}
            groupBookings={groupBookings}
            incompleteJoinTrips={incompleteJoinTrips}
            currentUserId={user.id}
          />
        )}
      </div>
    </div>
  )
}
