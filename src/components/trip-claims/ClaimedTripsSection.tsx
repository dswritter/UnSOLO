import Link from 'next/link'
import { formatPrice, formatDate, type Booking } from '@/types'
import { Users, MapPin } from 'lucide-react'

/**
 * Read-only display of bookings the current user didn't make themselves but
 * has an APPROVED trip-claim on — same financial visibility as the account
 * holder (total/collected/refund/balance), no write actions (can't cancel,
 * can't record payments — that stays with the booker/host/admin).
 */
export function ClaimedTripsSection({ bookings }: { bookings: Booking[] }) {
  if (bookings.length === 0) return null

  return (
    <div className="mb-8">
      <h2 className="text-lg font-bold mb-1 flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" /> Trips you joined
      </h2>
      <p className="text-xs text-muted-foreground mb-3">
        You weren&apos;t the one who booked these — you&apos;re seeing them because your request to join was approved.
      </p>
      <div className="space-y-3">
        {bookings.map((booking) => {
          const pkg = booking.package as { title?: string; slug?: string; destination?: { name?: string; state?: string } } | null
          const total = booking.total_amount_paise || 0
          const collected = (booking as { deposit_paise?: number | null }).deposit_paise || 0
          const balance = Math.max(0, total - collected)
          const refunded = booking.refund_amount_paise || 0

          return (
            <div key={booking.id} className="rounded-xl border border-border bg-card/50 p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">{pkg?.title || 'Trip'}</p>
                  {pkg?.destination && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {pkg.destination.name}, {pkg.destination.state}
                    </p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {booking.travel_date ? formatDate(booking.travel_date) : '—'} · {booking.confirmation_code || '—'}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
                <span><span className="text-muted-foreground">Trip total:</span> <span className="font-medium">{formatPrice(total)}</span></span>
                <span><span className="text-muted-foreground">Collected:</span> <span className="font-medium text-green-500">{formatPrice(collected)}</span></span>
                {refunded > 0 && (
                  <span><span className="text-muted-foreground">Refunded:</span> <span className="font-medium text-blue-400">{formatPrice(refunded)}</span></span>
                )}
                <span><span className="text-muted-foreground">Balance:</span> <span className={`font-medium ${balance > 0 ? 'text-amber-500' : 'text-green-500'}`}>{formatPrice(balance)}</span></span>
              </div>
              <div className="flex items-center gap-3">
                {pkg?.slug && (
                  <Link href={`/packages/${pkg.slug}`} className="text-xs text-primary hover:underline">
                    View trip →
                  </Link>
                )}
                <Link href="/tribe" className="text-xs text-muted-foreground hover:text-foreground">
                  Trip chat is in your Community inbox
                </Link>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
