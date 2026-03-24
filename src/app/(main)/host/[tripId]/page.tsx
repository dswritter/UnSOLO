import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { checkIsHost, getHostTripDetail, getJoinRequestsForTrip } from '@/actions/hosting'
import { formatPrice, formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ArrowLeft,
  MapPin,
  Calendar,
  Users,
  IndianRupee,
  Clock,
} from 'lucide-react'
import { ManageRequestsClient } from './ManageRequestsClient'

export default async function ManageTripPage({
  params,
}: {
  params: Promise<{ tripId: string }>
}) {
  const { tripId } = await params

  const hostStatus = await checkIsHost()
  if (!hostStatus.authenticated) redirect('/login')
  if (!hostStatus.isHost) redirect('/host/verify')

  const [trip, requests] = await Promise.all([
    getHostTripDetail(tripId),
    getJoinRequestsForTrip(tripId),
  ])

  if (!trip) notFound()

  const pendingRequests = (requests || []).filter((r: { status: string }) => r.status === 'pending')
  const otherRequests = (requests || []).filter((r: { status: string }) => r.status !== 'pending')

  function ModerationBadge({ status }: { status: string }) {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-900/50 text-green-300 border border-green-700 text-xs">Approved</Badge>
      case 'pending':
        return <Badge className="bg-yellow-900/50 text-yellow-300 border border-yellow-700 text-xs">Pending Review</Badge>
      case 'rejected':
        return <Badge className="bg-red-900/50 text-red-300 border border-red-700 text-xs">Rejected</Badge>
      default:
        return <Badge className="bg-zinc-700 text-zinc-200 text-xs">{status}</Badge>
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-10">
        {/* Back button */}
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground mb-4 gap-1.5">
          <Link href="/host">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
        </Button>

        {/* Trip Info Card */}
        <div className="rounded-xl border border-border bg-card p-6 mb-8">
          <div className="flex flex-col md:flex-row md:items-start gap-4">
            {trip.images?.[0] && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={trip.images[0]}
                alt=""
                className="h-32 w-48 rounded-lg object-cover shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <h1 className="text-2xl font-black">{trip.title}</h1>
                <ModerationBadge status={trip.moderation_status || 'pending'} />
                {!trip.is_active && (
                  <Badge className="bg-red-900/50 text-red-300 border border-red-700 text-xs">
                    Inactive
                  </Badge>
                )}
              </div>

              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-3">
                {trip.destination && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {trip.destination.name}, {trip.destination.state}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {trip.duration_days} days
                </span>
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  Max {trip.max_group_size}
                </span>
                <span className="flex items-center gap-1 text-primary font-semibold">
                  <IndianRupee className="h-3.5 w-3.5" />
                  {formatPrice(trip.price_paise)}
                </span>
              </div>

              {(trip.departure_dates || []).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {trip.departure_dates!.map((d: string, i: number) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {formatDate(d)}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Join Requests */}
        <ManageRequestsClient
          tripId={tripId}
          pendingRequests={pendingRequests}
          otherRequests={otherRequests}
        />
      </div>
    </div>
  )
}
