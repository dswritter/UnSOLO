export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getRequestAuth } from '@/lib/auth/request-session'
import { WanderThemeShell } from '@/components/wander/WanderThemeShell'
import { ReviewComposer } from '@/components/reviews/ReviewComposer'
import { listingScheduleTodayISO } from '@/lib/utils'
import { tripEndDate } from '@/lib/trips/tripDays'

export const metadata: Metadata = { title: 'Review your trip · UnSOLO' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function ReviewTripPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params
  if (!UUID.test(bookingId)) notFound()
  const { supabase, user } = await getRequestAuth()
  if (!user) redirect(`/login?redirectTo=${encodeURIComponent(`/review/${bookingId}`)}`)

  const [{ data: booking }, { data: existing }] = await Promise.all([
    supabase.from('bookings')
      .select('id, status, travel_date, package_id, package:packages(title, slug, images, duration_days)')
      .eq('id', bookingId).eq('user_id', user.id).maybeSingle(),
    supabase.from('reviews').select('id').eq('booking_id', bookingId).maybeSingle(),
  ])
  if (!booking?.package_id || !booking.package) notFound()
  const pkg = booking.package as unknown as { title: string; slug: string; images: string[] | null; duration_days: number | null }
  const ended = !!booking.travel_date && tripEndDate(String(booking.travel_date).slice(0, 10), pkg.duration_days ?? 1) < listingScheduleTodayISO()
  const canReview = booking.status === 'completed' || (booking.status === 'confirmed' && ended)

  return (
    <WanderThemeShell>
      <div className="mx-auto max-w-2xl px-4 py-10">
        <p className="pc-eyebrow">Review</p>
        <h1 className="mt-1 text-3xl text-foreground">How was {pkg.title}?</h1>
        {existing ? (
          <div className="pc-card mt-6 p-5">
            <p className="text-foreground">You’ve already reviewed this trip. Thank you.</p>
            <Link href={`/packages/${encodeURIComponent(pkg.slug)}#reviews`} className="pc-btn mt-4">See reviews</Link>
          </div>
        ) : !canReview ? (
          <div className="pc-card mt-6 p-5">
            <p className="text-foreground">You can review this trip once it’s over.</p>
            <Link href="/bookings" className="pc-btn mt-4">My trips</Link>
          </div>
        ) : (
          <div className="mt-6">
            <ReviewComposer bookingId={booking.id} tripSlug={pkg.slug} />
          </div>
        )}
      </div>
    </WanderThemeShell>
  )
}
