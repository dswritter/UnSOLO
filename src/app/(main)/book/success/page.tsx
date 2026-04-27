import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { CheckCircle, MessageCircle, BookOpen, Compass } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import Link from 'next/link'
import type { Booking } from '@/types'

export default async function BookingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const params = await searchParams
  const bookingId = params.booking_id

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let booking: Booking | null = null
  if (bookingId && user) {
    const { data } = await supabase
      .from('bookings')
      .select('*, package:packages(*, destination:destinations(*))')
      .eq('id', bookingId)
      .eq('user_id', user.id)
      .single()
    booking = data as Booking | null
  } else if (user) {
    // Fallback: get the latest confirmed booking
    const { data } = await supabase
      .from('bookings')
      .select('*, package:packages(*, destination:destinations(*))')
      .eq('user_id', user.id)
      .eq('status', 'confirmed')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    booking = data as Booking | null
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="max-w-lg w-full text-center space-y-6">
        {/* Success icon */}
        <div className="mx-auto w-20 h-20 rounded-full bg-primary/15 border-2 border-primary/60 flex items-center justify-center shadow-[0_0_24px_-4px_rgba(252,186,3,0.35)]">
          <CheckCircle className="h-10 w-10 text-primary" />
        </div>

        <div>
          <h1 className="text-3xl font-black mb-2 text-foreground">Booking Confirmed!</h1>
          <p className="text-muted-foreground">Your adventure is officially on the books.</p>
        </div>

        {booking ? (
          <div className="bg-card border border-border rounded-2xl p-6 text-left space-y-4">
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">Confirmation Code</div>
              <div className="text-2xl font-black text-primary tracking-wider">
                {booking.confirmation_code || 'Processing...'}
              </div>
            </div>

            <div className="border-t border-border pt-4 space-y-2 text-sm">
              {booking.package && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Trip</span>
                    <span className="font-medium">{booking.package.title}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Destination</span>
                    <span>{booking.package.destination?.name}, {booking.package.destination?.state}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Travel Date</span>
                <span>{booking.travel_date ? formatDate(booking.travel_date) : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Guests</span>
                <span>{booking.guests}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>Total Paid</span>
                <span className="text-primary">
                  ₹{(booking.total_amount_paise / 100).toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-2xl p-6">
            <p className="text-muted-foreground text-sm">
              Your booking is being processed. Check &quot;My Trips&quot; in a few moments.
            </p>
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          A confirmation email has been sent to your email address.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Button variant="outline" className="border-border" asChild>
            <Link href="/bookings">
              <BookOpen className="mr-2 h-4 w-4" /> My Trips
            </Link>
          </Button>
          <Button variant="outline" className="border-border" asChild>
            <Link href="/tribe">
              <MessageCircle className="mr-2 h-4 w-4" /> Trip Chat
            </Link>
          </Button>
          <Button className="bg-primary text-primary-foreground font-bold hover:bg-primary/90" asChild>
            <Link href="/wander">
              <Compass className="mr-2 h-4 w-4" /> Explore Wander
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
