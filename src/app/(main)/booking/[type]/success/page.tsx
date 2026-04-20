import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CheckCircle2, Share2, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/server'
import { formatPrice, formatDate } from '@/lib/utils'
import type { ServiceListingType } from '@/types'
import { HostContactCard } from '@/components/bookings/HostContactCard'

const validTypes: ServiceListingType[] = ['stays', 'activities', 'rentals', 'getting_around']

interface BookingSuccessPageProps {
  params: Promise<{ type: string }>
  searchParams: Promise<{ booking_id?: string }>
}

async function BookingDetails({ bookingId }: { bookingId: string }) {
  const supabase = await createClient()

  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select(`
      id,
      booking_type,
      check_in_date,
      check_out_date,
      quantity,
      amount_paise,
      wallet_deducted_paise,
      status,
      created_at,
      service_listing_id,
      service_listings!service_listing_id (
        id,
        title,
        slug,
        type,
        price_paise,
        unit,
        location,
        images,
        host_id
      )
    `)
    .eq('id', bookingId)
    .eq('booking_type', 'service')
    .single()

  if (bookingError || !booking) {
    return (
      <div className="text-center space-y-4">
        <p className="text-muted-foreground">Booking not found</p>
      </div>
    )
  }

  const listing = booking.service_listings as any
  const imageUrl = listing?.images?.[0] || '/placeholder-listing.svg'

  // Fetch host profile separately. The service_listings row may have a null
  // host_id for UnSOLO-hosted listings — in that case we skip the contact
  // card entirely. Phone privacy here is booking.com-style: show the number
  // once the booking is confirmed/completed, regardless of the host's
  // general `phone_public` preference, since the traveler now has a
  // legitimate paid-booking reason to reach them.
  const hostId: string | null = listing?.host_id ?? null
  const bookingConfirmed = booking.status === 'confirmed' || booking.status === 'completed'
  let host: {
    id: string
    username: string | null
    full_name: string | null
    phone_number: string | null
    avatar_url: string | null
  } | null = null
  if (hostId && bookingConfirmed) {
    const { data: hostRow } = await supabase
      .from('profiles')
      .select('id, username, full_name, phone_number, avatar_url')
      .eq('id', hostId)
      .single()
    host = (hostRow as typeof host) ?? null
  }

  return (
    <div className="space-y-6">
      {/* Confirmation card */}
      <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/30 rounded-2xl p-8 text-center space-y-4">
        <div className="flex justify-center">
          <CheckCircle2 className="h-16 w-16 text-green-500 drop-shadow-lg" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Booking Confirmed!</h1>
          <p className="text-muted-foreground text-sm mt-2">
            Your confirmation code is <code className="bg-secondary/60 px-2 py-1 rounded font-mono font-bold text-primary">{booking.id}</code>
          </p>
        </div>
      </div>

      {/* Booking details card */}
      <div className="border border-border rounded-xl overflow-hidden">
        {/* Listing preview */}
        <div className="relative h-48 bg-secondary/50 overflow-hidden">
          <img src={imageUrl} alt={listing?.title} className="w-full h-full object-cover" />
        </div>

        <div className="p-6 space-y-4">
          {/* Listing info */}
          <div>
            <h2 className="text-xl font-bold text-foreground">{listing?.title}</h2>
            <p className="text-sm text-muted-foreground mt-1">{listing?.location}</p>
          </div>

          {/* Booking dates/details */}
          <div className="grid grid-cols-2 gap-4 bg-secondary/50 rounded-lg p-4">
            {booking.check_in_date && (
              <div>
                <p className="text-xs text-muted-foreground font-medium">
                  {listing?.type === 'stays' ? 'Check-in' : 'Date'}
                </p>
                <p className="font-semibold text-foreground">{formatDate(booking.check_in_date)}</p>
              </div>
            )}

            {booking.check_out_date && listing?.type === 'stays' && (
              <div>
                <p className="text-xs text-muted-foreground font-medium">Check-out</p>
                <p className="font-semibold text-foreground">{formatDate(booking.check_out_date)}</p>
              </div>
            )}

            {booking.quantity && (
              <div>
                <p className="text-xs text-muted-foreground font-medium">
                  {listing?.type === 'stays' ? 'Rooms' : 'Quantity'}
                </p>
                <p className="font-semibold text-foreground">{booking.quantity}</p>
              </div>
            )}

            <div>
              <p className="text-xs text-muted-foreground font-medium">Status</p>
              <p className="font-semibold text-green-500">Confirmed</p>
            </div>
          </div>

          {/* Price breakdown */}
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total amount</span>
              <span className="font-semibold">{formatPrice(booking.amount_paise)}</span>
            </div>
            {booking.wallet_deducted_paise > 0 && (
              <div className="flex justify-between text-sm text-green-500">
                <span>Credits applied</span>
                <span>-{formatPrice(booking.wallet_deducted_paise)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-foreground pt-2 border-t border-border">
              <span>Paid</span>
              <span className="text-primary">
                {formatPrice(Math.max(0, booking.amount_paise - (booking.wallet_deducted_paise || 0)))}
              </span>
            </div>
          </div>

          {/* Next steps */}
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 space-y-2">
            <p className="text-sm font-semibold text-blue-400">What's next?</p>
            <ul className="text-xs text-muted-foreground space-y-1.5">
              <li>✓ Check your email for confirmation details</li>
              <li>✓ Save your confirmation code for reference</li>
              <li>✓ View or manage your booking anytime in My Bookings</li>
              {listing?.type === 'stays' && <li>✓ Host may contact you before your arrival</li>}
            </ul>
          </div>
        </div>
      </div>

      {/* Host contact — shown once the booking is confirmed. Gives the
          traveler the host's number (click to call) plus a direct chat
          so they don't have to dig through the listing to reach them. */}
      {host && <HostContactCard host={host} />}

      {/* Action buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link href="/bookings" className="flex-1">
          <Button className="w-full" variant="outline">
            <Home className="h-4 w-4 mr-2" /> My Bookings
          </Button>
        </Link>

        <Button className="flex-1" variant="outline">
          <Share2 className="h-4 w-4 mr-2" /> Share
        </Button>

        <Link href={`/listings/${listing?.type}/${listing?.slug}`} className="flex-1">
          <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
            View Listing
          </Button>
        </Link>
      </div>

      {/* Back to explore */}
      <div className="text-center">
        <Link href="/explore" className="text-primary hover:underline text-sm font-medium">
          ← Explore more services
        </Link>
      </div>
    </div>
  )
}

export default async function ServiceBookingSuccessPage({
  params,
  searchParams,
}: BookingSuccessPageProps) {
  const { type: typeParam } = await params
  const { booking_id } = await searchParams

  // Validate type
  if (!validTypes.includes(typeParam as ServiceListingType)) {
    notFound()
  }

  if (!booking_id) {
    notFound()
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-12">
        <Suspense
          fallback={
            <div className="space-y-6">
              <div className="h-32 bg-secondary/50 rounded-2xl animate-pulse" />
              <div className="h-64 bg-secondary/50 rounded-xl animate-pulse" />
            </div>
          }
        >
          <BookingDetails bookingId={booking_id} />
        </Suspense>
      </div>
    </div>
  )
}
