import { redirect } from 'next/navigation'
import Link from 'next/link'
import { checkIsHost, getHostDashboardStats, getMyHostedTrips } from '@/actions/hosting'
import { formatPrice, formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Plus,
  MapPin,
  Calendar,
  Users,
  IndianRupee,
  TrendingUp,
  Clock,
  Eye,
} from 'lucide-react'

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

export default async function HostDashboardPage() {
  const hostStatus = await checkIsHost()

  if (!hostStatus.authenticated) {
    redirect('/login')
  }

  if (!hostStatus.isHost) {
    redirect('/host/verify')
  }

  const [stats, trips] = await Promise.all([
    getHostDashboardStats(),
    getMyHostedTrips(),
  ])

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-black">
              Host <span className="text-primary">Dashboard</span>
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage your community trips and join requests
            </p>
          </div>
          <Button asChild className="bg-primary text-primary-foreground font-bold gap-2">
            <Link href="/host/create">
              <Plus className="h-4 w-4" />
              Create New Trip
            </Link>
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <MapPin className="h-5 w-5 text-primary" />
              </div>
              <p className="text-xs text-muted-foreground">Total Trips</p>
            </div>
            <p className="text-2xl font-black">{stats.totalTrips}</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-green-500" />
              </div>
              <p className="text-xs text-muted-foreground">Active Trips</p>
            </div>
            <p className="text-2xl font-black">{stats.activeTrips}</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-yellow-500" />
              </div>
              <p className="text-xs text-muted-foreground">Pending Requests</p>
            </div>
            <p className="text-2xl font-black">{stats.pendingRequests}</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <IndianRupee className="h-5 w-5 text-primary" />
              </div>
              <p className="text-xs text-muted-foreground">Total Earned</p>
            </div>
            <p className="text-2xl font-black">{formatPrice(stats.totalEarned)}</p>
            {stats.pendingPayout > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {formatPrice(stats.pendingPayout)} pending payout
              </p>
            )}
          </div>
        </div>

        {/* Hosted Trips List */}
        <div>
          <h2 className="text-xl font-bold mb-4">Your Trips</h2>

          {trips.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
              <MapPin className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-bold text-lg mb-2">No trips yet</h3>
              <p className="text-muted-foreground mb-6">
                Create your first community trip and start hosting fellow travelers.
              </p>
              <Button asChild className="bg-primary text-primary-foreground font-bold gap-2">
                <Link href="/host/create">
                  <Plus className="h-4 w-4" />
                  Create Your First Trip
                </Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {trips.map((trip) => (
                <div
                  key={trip.id}
                  className={`rounded-xl border bg-card p-5 ${
                    trip.is_active ? 'border-border' : 'border-red-900/30 opacity-70'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    {/* Trip Info */}
                    <div className="flex items-start gap-4 min-w-0">
                      {trip.images?.[0] && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={trip.images[0]}
                          alt=""
                          className="h-16 w-24 rounded-lg object-cover shrink-0 hidden sm:block"
                        />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-lg truncate">{trip.title}</h3>
                          <ModerationBadge status={trip.moderation_status || 'pending'} />
                          {!trip.is_active && (
                            <Badge className="bg-red-900/50 text-red-300 border border-red-700 text-xs">
                              Inactive
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1 flex-wrap">
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
                            <IndianRupee className="h-3.5 w-3.5" />
                            {formatPrice(trip.price_paise)}
                          </span>
                        </div>
                        {(trip.departure_dates || []).length > 0 && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Next departure: {formatDate(trip.departure_dates![0])}
                            {trip.departure_dates!.length > 1 &&
                              ` (+${trip.departure_dates!.length - 1} more)`}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Request Counts + Actions */}
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex items-center gap-4 text-sm">
                        {trip.pending_requests > 0 && (
                          <span className="flex items-center gap-1.5 text-yellow-400">
                            <Clock className="h-4 w-4" />
                            {trip.pending_requests} pending
                          </span>
                        )}
                        <span className="flex items-center gap-1.5 text-green-400">
                          <Users className="h-4 w-4" />
                          {trip.approved_requests} approved
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {trip.moderation_status === 'rejected' && (
                          <form action={async () => {
                            'use server'
                            const { resubmitTrip } = await import('@/actions/hosting')
                            await resubmitTrip(trip.id)
                          }}>
                            <Button type="submit" size="sm" className="bg-primary text-primary-foreground gap-1.5 text-xs">
                              Resubmit for Review
                            </Button>
                          </form>
                        )}
                        <Button asChild size="sm" variant="outline" className="gap-1.5">
                          <Link href={`/host/${trip.id}`}>
                            <Eye className="h-3.5 w-3.5" />
                            Manage
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
