import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MapPin, Calendar, Users, BookOpen } from 'lucide-react'
import { formatPrice, formatDate } from '@/lib/utils'
import Link from 'next/link'
import type { Booking } from '@/types'
import { BookingsClient } from './BookingsClient'

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

  // Check which bookings already have reviews
  const { data: reviews } = await supabase
    .from('reviews')
    .select('booking_id')
    .eq('user_id', user.id)

  const reviewedBookingIds = new Set((reviews || []).map(r => r.booking_id))

  const bookings = (data || []) as Booking[]

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
          <BookingsClient bookings={bookings} reviewedBookingIds={Array.from(reviewedBookingIds)} />
        )}
      </div>
    </div>
  )
}
