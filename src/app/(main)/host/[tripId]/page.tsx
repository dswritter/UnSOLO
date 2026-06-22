import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { checkIsHost, getHostTripDetail, getJoinRequestsForTrip, getTripRosterForHost } from '@/actions/hosting'
import { formatPrice, formatDate } from '@/lib/utils'
import { storageThumbnailUrl } from '@/lib/images/storageThumbUrl'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { HostModerationBadge } from '@/components/host/HostModerationBadge'
import { hostHiddenStatusClass } from '@/components/host/hostBadgeStyles'
import { cn } from '@/lib/utils'
import {
  ArrowLeft,
  MapPin,
  Calendar,
  Users,
  IndianRupee,
  Clock,
  Heart,
} from 'lucide-react'
import { ManageRequestsClient } from './ManageRequestsClient'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { packageDurationShortLabel } from '@/lib/package-trip-calendar'
import { PartialCancelManager, type PartialCancellationRow } from '@/components/bookings/PartialCancellation'
import { BookingChangeRequestManager, type ChangeRequestRow } from '@/components/bookings/BookingChangeRequest'
import type { Package } from '@/types'

export default async function ManageTripPage({
  params,
}: {
  params: Promise<{ tripId: string }>
}) {
  const { tripId } = await params

  const hostStatus = await checkIsHost()
  if (!hostStatus.authenticated) redirect('/login')
  if (!hostStatus.isHost) redirect('/host/verify')

  const [trip, requests, roster] = await Promise.all([
    getHostTripDetail(tripId),
    getJoinRequestsForTrip(tripId),
    getTripRosterForHost(tripId).catch(() => []),
  ])

  if (!trip) notFound()

  // Partial (per-traveller) cancellations for this trip's roster bookings.
  const partialByBooking: Record<string, PartialCancellationRow[]> = {}
  const rosterIds = roster.map((r) => r.bookingId)
  if (rosterIds.length) {
    const svc = createServiceRoleClient()
    const { data: pcRows } = await svc
      .from('booking_partial_cancellations')
      .select('*')
      .in('booking_id', rosterIds)
      .order('created_at', { ascending: false })
    for (const r of (pcRows || []) as PartialCancellationRow[]) {
      ;(partialByBooking[r.booking_id] ||= []).push(r)
    }
  }

  // Change requests (traveller edits + tier changes) on this trip's bookings.
  const changesByBooking: Record<string, ChangeRequestRow[]> = {}
  if (rosterIds.length) {
    const svc = createServiceRoleClient()
    const { data: crRows } = await svc
      .from('booking_change_requests')
      .select('*')
      .in('booking_id', rosterIds)
      .order('created_at', { ascending: false })
    for (const r of (crRows || []) as ChangeRequestRow[]) {
      ;(changesByBooking[r.booking_id] ||= []).push(r)
    }
  }
  const tripVariantLabels = Array.isArray((trip as { price_variants?: unknown }).price_variants)
    ? ((trip as { price_variants: Array<{ description?: string }> }).price_variants).map((v) => String(v?.description ?? ''))
    : []

  // Get interest data
  const supabase = await createClient()
  const { data: interests } = await supabase
    .from('package_interests')
    .select('user_id, user:profiles(username, full_name, avatar_url)')
    .eq('package_id', tripId)
  const interestCount = interests?.length || 0

  const pendingRequests = (requests || []).filter((r: { status: string }) => r.status === 'pending')
  const otherRequests = (requests || []).filter((r: { status: string }) => r.status !== 'pending')

  return (
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
                src={storageThumbnailUrl(trip.images[0]) || trip.images[0]}
                alt=""
                className="h-32 w-48 rounded-lg object-cover shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <h1 className="text-2xl font-black">{trip.title}</h1>
                <HostModerationBadge status={trip.moderation_status || 'pending'} />
                {!trip.is_active && (
                  <Badge className={cn('text-xs font-medium', hostHiddenStatusClass())}>
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
                  {packageDurationShortLabel(trip as Package)}
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

              <div className="flex gap-2 mt-3">
                <Button asChild size="sm" variant="outline" className="gap-1.5 text-xs">
                  <Link href={`/host/${tripId}/edit`}>
                    Edit Trip
                  </Link>
                </Button>
                {trip.moderation_status === 'approved' && (
                  <p className="text-[10px] text-muted-foreground self-center">
                    Edits will be sent to admin for review. Trip stays live.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Interest Section */}
        {interestCount > 0 && (
          <div className="rounded-xl border border-border bg-card p-5 mb-8">
            <h2 className="font-bold text-sm flex items-center gap-2 mb-3">
              <Heart className="h-4 w-4 text-red-400 fill-red-400" />
              {interestCount} {interestCount === 1 ? 'person is' : 'people are'} interested
            </h2>
            <div className="flex flex-wrap gap-3">
              {(interests || []).map((i: { user_id: string; user: unknown }) => {
                const u = i.user as { username: string; full_name: string | null; avatar_url: string | null } | null
                return (
                  <Link key={i.user_id} href={`/profile/${u?.username}`} className="flex items-center gap-2 px-3 py-1.5 bg-secondary/50 rounded-lg hover:bg-secondary transition-colors">
                    <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                      {(u?.full_name || u?.username || '?').charAt(0).toUpperCase()}
                    </div>
                    <span className="text-xs font-medium">{u?.full_name || u?.username}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* Join Requests */}
        {roster.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5 mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Users className="h-4 w-4 text-primary" />
              <h2 className="font-bold">Travellers ({roster.reduce((n, r) => n + r.guests, 0)})</h2>
            </div>
            <div className="space-y-3">
              {roster.map((r) => (
                <div key={r.bookingId} className="rounded-lg border border-border bg-secondary/30 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-medium">{r.leadName}{r.leadUsername ? <span className="text-muted-foreground"> @{r.leadUsername}</span> : null}</span>
                    <span className="text-xs text-muted-foreground">
                      {r.guests} guest{r.guests > 1 ? 's' : ''}
                      {r.travelDate ? ` · ${formatDate(r.travelDate)}` : ''}
                      {r.confirmationCode ? ` · #${r.confirmationCode}` : ''}
                    </span>
                  </div>
                  {r.leadPhone && (
                    <div className="text-xs text-muted-foreground mt-1">
                      <a href={`tel:${r.leadPhone.replace(/[^\d+]/g, '')}`} className="text-primary hover:underline">{r.leadPhone}</a>
                    </div>
                  )}
                  {r.couponLabel && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Offer: <span className="text-foreground">{r.couponLabel}</span>
                      {r.discountPaise > 0 ? <span className="text-green-500"> · −{formatPrice(r.discountPaise)}</span> : null}
                    </div>
                  )}
                  {Array.isArray(r.travellers) && r.travellers.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {r.travellers.map((t, i) => (
                        <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                          {t.name}{t.age || t.gender ? ` · ${[t.age || null, t.gender || null].filter(Boolean).join(' · ')}` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                  {((partialByBooking[r.bookingId]?.length) || (r.guests > 1)) && (
                    <div className="mt-2 pt-2 border-t border-border/60">
                      <PartialCancelManager
                        booking={{ id: r.bookingId, status: r.status, guests: r.guests, traveller_details: r.travellers || [] }}
                        existing={partialByBooking[r.bookingId] || []}
                      />
                    </div>
                  )}
                  {(changesByBooking[r.bookingId]?.length || 0) > 0 && (
                    <div className="mt-2 pt-2 border-t border-border/60">
                      <BookingChangeRequestManager existing={changesByBooking[r.bookingId] || []} variantLabels={tripVariantLabels} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <ManageRequestsClient
          tripId={tripId}
          pendingRequests={pendingRequests}
          otherRequests={otherRequests}
        />
    </div>
  )
}
