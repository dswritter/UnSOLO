import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MapPin, Calendar, Users, MessageCircle, BookOpen } from 'lucide-react'
import { formatPrice, formatDate } from '@/lib/utils'
import Link from 'next/link'
import type { Booking } from '@/types'

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  confirmed: 'bg-green-500/20 text-green-400 border-green-500/30',
  cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
  completed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
}

export default async function BookingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data } = await supabase
    .from('bookings')
    .select('*, package:packages(*, destination:destinations(*))')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const bookings = (data || []) as Booking[]
  const upcoming = bookings.filter((b) => b.status === 'confirmed' || b.status === 'pending')
  const past = bookings.filter((b) => b.status === 'completed' || b.status === 'cancelled')

  return (
    <div className="min-h-screen bg-black">
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-black">My <span className="text-primary">Trips</span></h1>
          <p className="text-muted-foreground mt-1">Your travel history and upcoming adventures</p>
        </div>

        {bookings.length === 0 ? (
          <div className="text-center py-24">
            <BookOpen className="h-16 w-16 text-primary/30 mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-2">No trips yet</h3>
            <p className="text-muted-foreground mb-6">Start your solo adventure across India</p>
            <Button className="bg-primary text-black font-bold" asChild>
              <Link href="/explore">Explore Trips</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-8">
            {upcoming.length > 0 && (
              <div>
                <h2 className="text-xl font-bold mb-4">Upcoming Trips</h2>
                <div className="space-y-4">
                  {upcoming.map((booking) => (
                    <BookingCard key={booking.id} booking={booking} />
                  ))}
                </div>
              </div>
            )}

            {past.length > 0 && (
              <div>
                <h2 className="text-xl font-bold mb-4 text-muted-foreground">Past Trips</h2>
                <div className="space-y-4">
                  {past.map((booking) => (
                    <BookingCard key={booking.id} booking={booking} showReview />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function BookingCard({ booking, showReview }: { booking: Booking; showReview?: boolean }) {
  const pkg = booking.package
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-5">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Image */}
          <div className="w-full sm:w-28 h-28 rounded-xl overflow-hidden bg-secondary flex-shrink-0">
            {pkg?.images?.[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pkg.images[0]} alt={pkg.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-2xl">🏔️</div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
              <h3 className="font-bold text-lg leading-tight">{pkg?.title || 'Trip'}</h3>
              <Badge className={`text-xs ${STATUS_COLORS[booking.status] || 'bg-secondary text-muted-foreground'}`}>
                {booking.status}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mb-3">
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {pkg?.destination?.name}, {pkg?.destination?.state}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" /> {formatDate(booking.travel_date)}
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" /> {booking.guests} guest{booking.guests > 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm">
                <span className="font-bold text-primary">{formatPrice(booking.total_amount_paise)}</span>
                {booking.confirmation_code && (
                  <span className="text-muted-foreground ml-2 text-xs">#{booking.confirmation_code}</span>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="border-border text-xs" asChild>
                  <Link href="/chat">
                    <MessageCircle className="mr-1 h-3 w-3" /> Trip Chat
                  </Link>
                </Button>
                {showReview && booking.status === 'completed' && (
                  <Button size="sm" className="bg-primary text-black text-xs" asChild>
                    <Link href={`/packages/${pkg?.slug}#review`}>Write Review</Link>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
