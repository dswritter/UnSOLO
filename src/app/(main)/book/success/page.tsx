import { getRequestAuth } from '@/lib/auth/request-session'
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

  const { supabase, user } = await getRequestAuth()

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

  const paidToward = booking?.deposit_paise ?? booking?.total_amount_paise ?? 0
  const balanceDue = booking ? Math.max(0, booking.total_amount_paise - paidToward) : 0
  const isToken = balanceDue > 0

  // Contact: host's WhatsApp for community trips, else UnSOLO support.
  let whatsappUrl = ''
  let whatsappLabel = ''
  if (booking?.package) {
    const { getSupportWhatsappNumber, resolveWhatsappNumber } = await import('@/lib/platform-settings')
    const support = await getSupportWhatsappNumber()
    const p = booking.package as { host_id?: string | null; whatsapp_number?: string | null }
    let number = ''
    if (p.host_id) {
      const { data: host } = await supabase.from('profiles').select('phone_number').eq('id', p.host_id).single()
      number = resolveWhatsappNumber(host?.phone_number, resolveWhatsappNumber(p.whatsapp_number, support))
      whatsappLabel = 'Message your host on WhatsApp'
    } else {
      number = resolveWhatsappNumber(p.whatsapp_number, support)
      whatsappLabel = 'Chat with UnSOLO on WhatsApp'
    }
    const msg = encodeURIComponent(`Hi! Regarding my booking ${booking.confirmation_code ?? ''}.`)
    whatsappUrl = `https://wa.me/${number}?text=${msg}`
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="max-w-lg w-full text-center space-y-6">
        {/* Success icon */}
        <div className="mx-auto w-20 h-20 rounded-full bg-primary/15 border-2 border-primary/60 flex items-center justify-center shadow-[0_0_24px_-4px_rgba(252,186,3,0.35)]">
          <CheckCircle className="h-10 w-10 text-primary" />
        </div>

        <div>
          <h1 className="text-3xl font-black mb-2 text-foreground">{isToken ? 'Spot Secured!' : 'Booking Confirmed!'}</h1>
          <p className="text-muted-foreground">
            {isToken ? 'Your spot is secured with a token payment.' : 'Your adventure is officially on the books.'}
          </p>
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
              {isToken ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Trip total</span>
                    <span>₹{(booking.total_amount_paise / 100).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span>Token paid</span>
                    <span className="text-primary">₹{(paidToward / 100).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span>Balance due</span>
                    <span className="text-amber-600 dark:text-amber-400">₹{(balanceDue / 100).toLocaleString('en-IN')}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between font-bold">
                  <span>Total Paid</span>
                  <span className="text-primary">
                    ₹{(booking.total_amount_paise / 100).toLocaleString('en-IN')}
                  </span>
                </div>
              )}
            </div>

            {isToken && (
              <Button className="w-full bg-primary text-primary-foreground font-bold hover:bg-primary/90" asChild>
                <Link href="/bookings">
                  Pay remaining ₹{(balanceDue / 100).toLocaleString('en-IN')}
                </Link>
              </Button>
            )}

            {whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full rounded-lg border border-border bg-secondary/40 py-2.5 text-sm font-medium hover:border-primary/40 transition-colors"
              >
                <MessageCircle className="h-4 w-4 text-green-500" /> {whatsappLabel}
              </a>
            )}
          </div>
        ) : (
          <div className="bg-card border border-border rounded-2xl p-6">
            <p className="text-muted-foreground text-sm">
              Your booking is being processed. Check &quot;My Trips&quot; in a few moments.
            </p>
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          {isToken
            ? 'A receipt with your balance due has been emailed to you. Pay the rest anytime from My Trips.'
            : 'A confirmation email with your receipt has been sent to your email address.'}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Button variant="outline" className="border-border" asChild>
            <Link href="/bookings">
              <BookOpen className="mr-2 h-4 w-4" /> My Trips
            </Link>
          </Button>
          <Button variant="outline" className="border-border" asChild>
            <Link href="/community">
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
