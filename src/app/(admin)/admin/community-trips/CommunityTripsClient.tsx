'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { moderateCommunityTrip, markHostPayout, updatePackage } from '@/actions/admin'
import { formatPrice, formatDate } from '@/lib/utils'
import { packageDurationShortLabel } from '@/lib/package-trip-calendar'
import { splitInclusiveCommunityPayment } from '@/lib/community-payment'
import { toast } from 'sonner'
import { Check, X, Eye, CreditCard, Star, ChevronDown, ChevronUp, Settings, Info } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import Link from 'next/link'
import { TripDescriptionDisplay } from '@/components/ui/TripDescriptionDisplay'

interface Props {
  trips: any[]
  pendingPayouts: any[]
  /** Current platform fee % (inclusive in list price); from Admin → Settings */
  platformFeePercent: number
}

const MOD_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  approved: 'bg-green-500/20 text-green-400 border-green-500/30',
  rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
}

export default function CommunityTripsClient({
  trips: initialTrips,
  pendingPayouts: initialPayouts,
  platformFeePercent,
}: Props) {
  const router = useRouter()
  const [trips, setTrips] = useState(initialTrips)
  const [pendingPayouts, setPendingPayouts] = useState(initialPayouts)
  const [filter, setFilter] = useState('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    setTrips(initialTrips)
  }, [initialTrips])
  useEffect(() => {
    setPendingPayouts(initialPayouts)
  }, [initialPayouts])
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({})
  const [payoutRef, setPayoutRef] = useState<Record<string, string>>({})
  const [confirmReject, setConfirmReject] = useState<string | null>(null)

  const filtered = filter === 'all'
    ? trips
    : trips.filter(t => t.moderation_status === filter)

  function toggleFeatured(tripId: string, currentlyFeatured: boolean) {
    startTransition(async () => {
      const res = await updatePackage(tripId, { is_featured: !currentlyFeatured })
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(!currentlyFeatured ? 'Trip is now featured on Explore' : 'Removed from featured')
      setTrips((prev) => prev.map((t) => (t.id === tripId ? { ...t, is_featured: !currentlyFeatured } : t)))
    })
  }

  function handleModerate(tripId: string, approve: boolean) {
    if (!approve && confirmReject !== tripId) {
      setConfirmReject(tripId)
      return
    }
    const reason = rejectReason[tripId]
    setConfirmReject(null)
    startTransition(async () => {
      const res = await moderateCommunityTrip(tripId, approve, reason)
      if (res.error) toast.error(res.error)
      else toast.success(approve ? 'Trip approved and published!' : 'Trip rejected — host notified to edit and resubmit')
    })
  }

  function handlePayout(earningId: string) {
    const ref = payoutRef[earningId]
    if (!ref?.trim()) {
      toast.error('Enter a payout reference (e.g. UPI transaction ID)')
      return
    }
    startTransition(async () => {
      const res = await markHostPayout(earningId, ref.trim())
      if (res.error) toast.error(res.error)
      else {
        toast.success('Payout marked completed. Host was notified.')
        setPendingPayouts((prev) => prev.filter((e: { id: string }) => e.id !== earningId))
        setPayoutRef((prev) => {
          const next = { ...prev }
          delete next[earningId]
          return next
        })
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-8">
      {/* Host payouts — always visible so admins find settlement workflow */}
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              Host payouts &amp; settlements
            </h2>
            <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
              After a traveler pays for a <strong>community</strong> trip, Razorpay settles to UnSOLO. Record each host
              transfer here once you&apos;ve paid them manually (UPI/bank). List price includes a{' '}
              <strong>{platformFeePercent}%</strong> platform fee — configure in{' '}
              <Link href="/admin/settings" className="text-primary font-medium hover:underline inline-flex items-center gap-0.5">
                <Settings className="h-3 w-3" /> Settings
              </Link>
              .
            </p>
          </div>
          <Link href="/admin/bookings">
            <Button variant="outline" size="sm" className="text-xs shrink-0">
              View all bookings
            </Button>
          </Link>
        </div>

        {pendingPayouts.length === 0 ? (
          <div className="flex gap-2 rounded-lg border border-border bg-card/80 px-3 py-3 text-sm text-muted-foreground">
            <Info className="h-4 w-4 shrink-0 text-primary mt-0.5" />
            <div>
              <p className="font-medium text-foreground">No pending host payouts</p>
              <p className="text-xs mt-1 leading-relaxed">
                Rows appear when a booking is confirmed and <code className="text-[10px] bg-secondary px-1 rounded">host_earnings</code> is
                created (traveler paid, host share pending). Use <strong>Mark paid</strong> after you send the host their
                share; enter your UPI/bank reference for the audit trail.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs font-medium text-foreground">
              {pendingPayouts.length} pending — pay the host outside the app, then mark complete.
            </p>
            <div className="space-y-2">
              {pendingPayouts.map((earning: any) => {
                const host = earning.host as any
                const booking = earning.booking as any
                const pkg = booking?.package as any
                return (
                  <div
                    key={earning.id}
                    className="border border-border rounded-lg p-3 sm:p-4 bg-card flex flex-col lg:flex-row lg:items-end gap-4"
                  >
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="text-sm font-semibold">{host?.full_name || host?.username || 'Host'}</div>
                      <div className="text-xs text-muted-foreground">
                        <span className="text-foreground font-medium">{pkg?.title || 'Trip'}</span>
                        {booking?.travel_date && (
                          <>
                            {' '}
                            · Travel {formatDate(booking.travel_date)}
                          </>
                        )}
                        {booking?.confirmation_code && (
                          <>
                            {' '}
                            · Code <span className="font-mono text-foreground">{booking.confirmation_code}</span>
                          </>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                        <div className="rounded-md bg-secondary/50 px-2 py-1.5 border border-border">
                          <div className="text-muted-foreground">Traveler paid</div>
                          <div className="font-semibold tabular-nums">{formatPrice(earning.total_paise)}</div>
                        </div>
                        <div className="rounded-md bg-secondary/50 px-2 py-1.5 border border-border">
                          <div className="text-muted-foreground">Platform ({platformFeePercent}%)</div>
                          <div className="font-semibold tabular-nums">{formatPrice(earning.platform_fee_paise)}</div>
                        </div>
                        <div className="rounded-md bg-primary/10 px-2 py-1.5 border border-primary/25">
                          <div className="text-muted-foreground">Pay host</div>
                          <div className="font-bold text-primary tabular-nums">{formatPrice(earning.host_paise)}</div>
                        </div>
                      </div>
                      {host?.upi_id ? (
                        <div className="text-xs">
                          <span className="text-muted-foreground">Host UPI: </span>
                          <span className="font-mono text-primary break-all">{host.upi_id}</span>
                        </div>
                      ) : (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400">
                          Host has not saved a UPI ID — check their profile or contact them for bank details.
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto lg:min-w-[280px]">
                      <input
                        type="text"
                        placeholder="UPI / bank ref (required)"
                        value={payoutRef[earning.id] || ''}
                        onChange={(e) => setPayoutRef((prev) => ({ ...prev, [earning.id]: e.target.value }))}
                        className="text-xs bg-secondary border border-border rounded-lg px-3 py-2 flex-1 min-w-0 focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      <Button
                        size="sm"
                        onClick={() => handlePayout(earning.id)}
                        disabled={isPending}
                        className="bg-green-600 hover:bg-green-700 text-white text-xs shrink-0"
                      >
                        <Check className="h-3.5 w-3.5 mr-1" />
                        Mark paid
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {['all', 'pending', 'approved', 'rejected'].map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              filter === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:border-primary/50'
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
            {s !== 'all' && (
              <span className="ml-1 opacity-70">
                ({trips.filter(t => t.moderation_status === s).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Trips list */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <p className="text-muted-foreground text-center py-12">No community trips found.</p>
        )}

        {filtered.map(trip => {
          const host = trip.host as any
          const dest = trip.destination as any
          const expanded = expandedId === trip.id

          return (
            <div key={trip.id} className="border border-border rounded-xl bg-card overflow-hidden">
              {/* Header */}
              <button
                onClick={() => setExpandedId(expanded ? null : trip.id)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-secondary/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {trip.images?.[0] && (
                    <img src={trip.images[0]} alt="" className="w-10 h-10 rounded-lg object-cover" />
                  )}
                  <div className="text-left">
                    <div className="font-bold text-sm">{trip.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {dest?.name}, {dest?.state} · {packageDurationShortLabel(trip)} · Max {trip.max_group_size}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {trip.is_featured && (
                    <Badge className="bg-primary/20 text-primary border-primary/40 text-[10px]">
                      <Star className="h-3 w-3 mr-0.5 inline fill-primary" /> Featured
                    </Badge>
                  )}
                  <Badge className={MOD_COLORS[trip.moderation_status] || ''}>
                    {trip.moderation_status}
                  </Badge>
                  {!trip.is_active && (
                    <Badge className="bg-red-900/50 text-red-300 border border-red-700 text-[10px]">
                      Hidden by Host
                    </Badge>
                  )}
                  <span className="text-primary font-bold text-sm">{formatPrice(trip.price_paise)}</span>
                  {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </button>

              {/* Expanded details */}
              {expanded && (
                <div className="px-4 pb-4 border-t border-border pt-3 space-y-4">
                  {/* Host info */}
                  <div className="flex items-center gap-3 bg-secondary/30 rounded-lg p-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={host?.avatar_url || ''} />
                      <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                        {(host?.full_name || host?.username || '?').charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium text-sm">
                        {host?.full_name || host?.username}
                        <Link href={`/profile/${host?.username}`} className="text-primary text-xs ml-2 hover:underline">View Profile</Link>
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        @{host?.username}
                        {host?.is_phone_verified && <span className="text-green-400">📱 Verified</span>}
                        {host?.is_email_verified && <span className="text-green-400">✉️ Verified</span>}
                        <span className="flex items-center gap-0.5"><Star className="h-3 w-3 text-primary" /> {host?.host_rating || '0'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Trip details */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-muted-foreground">List price:</span> {formatPrice(trip.price_paise)}/person</div>
                    <div><span className="text-muted-foreground">Duration:</span> {packageDurationShortLabel(trip)}</div>
                    <div><span className="text-muted-foreground">Max Group:</span> {trip.max_group_size}</div>
                    <div><span className="text-muted-foreground">Difficulty:</span> {trip.difficulty}</div>
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Traveler checkout: </span>
                      <span className="text-foreground">
                        {trip.join_preferences?.payment_timing === 'pay_on_booking'
                          ? 'Book & pay immediately'
                          : 'Join request → pay after host approves'}
                      </span>
                    </div>
                  </div>
                  {(() => {
                    const split = splitInclusiveCommunityPayment(trip.price_paise || 0, platformFeePercent)
                    return (
                      <div className="rounded-lg border border-border bg-secondary/20 px-3 py-2 text-[11px] space-y-1">
                        <div className="font-medium text-foreground">Inclusive fee split (per person, lowest list tier)</div>
                        <div className="text-muted-foreground">
                          Traveler pays <span className="text-foreground font-medium">{formatPrice(trip.price_paise)}</span>
                          {' · '}
                          Platform ~{formatPrice(split.platformFeePaise)} ({platformFeePercent}%)
                          {' · '}
                          Host ~{formatPrice(split.hostPaise)}
                        </div>
                      </div>
                    )
                  })()}

                  {trip.short_description && (
                    <div className="text-xs">
                      <span className="font-medium">Short Description: </span>
                      <span className="text-muted-foreground">{trip.short_description}</span>
                    </div>
                  )}

                  {trip.description && (
                    <div className="text-xs">
                      <span className="font-medium">Full Description: </span>
                      <div className="text-muted-foreground mt-1 leading-relaxed">
                        <TripDescriptionDisplay>{trip.description}</TripDescriptionDisplay>
                      </div>
                    </div>
                  )}

                  {/* Departure dates */}
                                   {trip.departure_dates && trip.departure_dates.length > 0 && (
                    <div className="text-xs">
                      <span className="font-medium">Depart → return: </span>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {trip.departure_dates.map((d: string, i: number) => {
                          const ret = trip.return_dates?.[i]
                          const label = ret
                            ? `${new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} → ${new Date(ret).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                            : new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                          return (
                            <Badge key={i} variant="secondary" className="text-[10px]">
                              {label}
                            </Badge>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Includes */}
                  {trip.includes && trip.includes.length > 0 && (
                    <div className="text-xs">
                      <span className="font-medium">Includes: </span>
                      <span className="text-muted-foreground">{trip.includes.join(', ')}</span>
                    </div>
                  )}

                  {/* Images */}
                  {trip.images && trip.images.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {trip.images.map((img: string, i: number) => (
                        <img key={i} src={img} alt="" className="h-20 w-28 rounded-lg object-cover flex-shrink-0" />
                      ))}
                    </div>
                  )}

                  {/* Join preferences */}
                  {trip.join_preferences && Object.keys(trip.join_preferences).length > 0 && (
                    <div className="text-xs space-y-1">
                      <div>
                        <span className="font-medium">Join Preferences: </span>
                        <span className="text-muted-foreground">
                          {trip.join_preferences.gender_preference && trip.join_preferences.gender_preference !== 'all' && `${trip.join_preferences.gender_preference} only · `}
                          {trip.join_preferences.min_age != null && `Age ${trip.join_preferences.min_age}-${trip.join_preferences.max_age ?? '∞'} · `}
                          {trip.join_preferences.min_trips_completed && `Min ${trip.join_preferences.min_trips_completed} trips · `}
                          {trip.join_preferences.interest_tags?.join(', ')}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/packages/${trip.slug}`} target="_blank">
                      <Button variant="outline" size="sm" className="text-xs border-border">
                        <Eye className="h-3 w-3 mr-1" /> Preview
                      </Button>
                    </Link>
                    {trip.moderation_status === 'approved' && (
                      <label className="flex items-center gap-2 text-xs cursor-pointer border border-border rounded-lg px-3 py-2 bg-secondary/30">
                        <input
                          type="checkbox"
                          checked={!!trip.is_featured}
                          onChange={(e) => {
                            e.stopPropagation()
                            toggleFeatured(trip.id, !!trip.is_featured)
                          }}
                          disabled={isPending}
                          className="accent-primary rounded"
                        />
                        <span>
                          <span className="font-medium">Featured on Explore</span>
                          <span className="text-muted-foreground block text-[10px]">Pins to top of Explore (with UnSOLO featured trips)</span>
                        </span>
                      </label>
                    )}
                  </div>

                  {/* Moderation actions */}
                  {trip.moderation_status === 'pending' && (
                    <div className="border-t border-border pt-3 space-y-2">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleModerate(trip.id, true)}
                          disabled={isPending}
                          className="bg-green-600 hover:bg-green-700 text-white text-xs"
                        >
                          <Check className="h-3 w-3 mr-1" /> Approve & Publish
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleModerate(trip.id, false)}
                          disabled={isPending}
                          className="border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs"
                        >
                          <X className="h-3 w-3 mr-1" /> Reject
                        </Button>
                      </div>
                      <input
                        type="text"
                        placeholder="Rejection reason (required for rejection)..."
                        value={rejectReason[trip.id] || ''}
                        onChange={e => setRejectReason(prev => ({ ...prev, [trip.id]: e.target.value }))}
                        className="w-full text-xs bg-secondary border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:border-primary"
                      />
                      {confirmReject === trip.id && (
                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 space-y-2">
                          <p className="text-xs text-red-400 font-medium">Are you sure you want to reject this trip?</p>
                          <p className="text-xs text-muted-foreground">The host will be notified and can edit and resubmit for review.</p>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" className="border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs"
                              onClick={() => handleModerate(trip.id, false)} disabled={isPending || !rejectReason[trip.id]?.trim()}>
                              Confirm Rejection
                            </Button>
                            <Button size="sm" variant="outline" className="text-xs" onClick={() => setConfirmReject(null)}>
                              Cancel
                            </Button>
                          </div>
                          {!rejectReason[trip.id]?.trim() && (
                            <p className="text-[10px] text-red-400">Please provide a reason above</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
