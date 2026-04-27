'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { MapPin, Calendar, Users, MessageCircle, Star, X, CheckCircle, Mountain, ArrowRight, AlertTriangle, Edit2, CreditCard, Clock, Ban, CalendarPlus } from 'lucide-react'
import { formatPrice, formatDate, getTripCountdown } from '@/lib/utils'
import {
  tripEndDateIsoForBooking,
  formatDateRangeFromEdges,
  calendarInclusiveDaysForTravelDate,
  packageDurationShortLabel,
  type TripPackageCalendar,
} from '@/lib/package-trip-calendar'
import { submitReview } from '@/actions/profile'
import { joinGroupByInvite } from '@/actions/group-booking'
import {
  requestCancellation,
  cancelPendingBooking,
  changeBookingDate,
  createBookingBalanceOrder,
  createCommunityTripOrder,
  confirmPayment,
} from '@/actions/booking'
import { withdrawJoinRequest } from '@/actions/hosting'
import { isTokenDepositEnabled } from '@/lib/join-preferences'
import type { GroupBookingInfo, IncompleteJoinTrip, IncompleteTripStatus } from './page'
import { toast } from 'sonner'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Booking, JoinPreferences } from '@/types'
import { HostRatingCard } from '@/components/hosting/HostRatingCard'
import Script from 'next/script'

function tripCalFromPackage(
  pkg: {
    duration_days?: number | null
    departure_dates?: string[] | null
    return_dates?: string[] | null
  } | null | undefined,
): TripPackageCalendar {
  return {
    duration_days: Math.max(1, Number(pkg?.duration_days) || 1),
    departure_dates: pkg?.departure_dates,
    return_dates: pkg?.return_dates,
  }
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  confirmed: 'bg-green-500/20 text-green-400 border-green-500/30',
  cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
  completed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
}

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => {
      open: () => void
      on: (event: string, handler: () => void) => void
    }
  }
}

const INCOMPLETE_JOIN_BADGE: Record<IncompleteTripStatus, { label: string; className: string }> = {
  awaiting_unsolo: {
    label: 'Awaiting UnSOLO approval',
    className: 'bg-amber-500/15 text-amber-300 border-amber-500/35',
  },
  awaiting_host: {
    label: 'Awaiting host approval',
    className: 'bg-sky-500/15 text-sky-300 border-sky-500/35',
  },
  payment_pending: {
    label: 'Payment pending',
    className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  },
}

function firstDepartureMonthKey(trip: IncompleteJoinTrip['trip']): number | null {
  const dates = trip.departure_dates
  if (!dates?.length) return null
  const first = [...dates].sort()[0]
  return new Date(first + 'T12:00:00').getMonth()
}

interface Props {
  bookings: Booking[]
  serviceBookings?: Booking[]
  reviewedBookingIds: string[]
  ratedHostBookingIds?: string[]
  groupBookings?: GroupBookingInfo[]
  incompleteJoinTrips?: IncompleteJoinTrip[]
  currentUserId?: string
}

export function BookingsClient({
  bookings,
  serviceBookings = [],
  reviewedBookingIds,
  ratedHostBookingIds = [],
  groupBookings = [],
  incompleteJoinTrips = [],
  currentUserId,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [reviewed, setReviewed] = useState<Set<string>>(new Set(reviewedBookingIds))
  const [ratedHosts, setRatedHosts] = useState<Set<string>>(new Set(ratedHostBookingIds))
  const [ratingBookingId, setRatingBookingId] = useState<string | null>(null)
  const [joinCode, setJoinCode] = useState('')
  const [joining, setJoining] = useState(false)
  const router = useRouter()

  // Filter state
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterType, setFilterType] = useState<'all' | 'solo' | 'group'>('all')
  const [filterMonth, setFilterMonth] = useState('')

  // Review form state
  const [ratingDest, setRatingDest] = useState(0)
  const [ratingExp, setRatingExp] = useState(0)
  const [reviewTitle, setReviewTitle] = useState('')
  const [reviewBody, setReviewBody] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Apply filters to bookings
  let filteredBookings = bookings
  if (filterStatus !== 'all') {
    filteredBookings = filteredBookings.filter(b => b.status === filterStatus)
  }
  if (filterMonth) {
    filteredBookings = filteredBookings.filter(b => {
      if (!b.travel_date) return false
      return new Date(b.travel_date).getMonth() === parseInt(filterMonth)
    })
  }

  // Apply filters to group bookings
  let filteredGroupBookings = groupBookings
  if (filterStatus !== 'all') {
    filteredGroupBookings = filteredGroupBookings.filter(g => g.status === filterStatus || (filterStatus === 'confirmed' && g.total_paid === g.total_members))
  }
  if (filterMonth) {
    filteredGroupBookings = filteredGroupBookings.filter(g => new Date(g.travel_date).getMonth() === parseInt(filterMonth))
  }

  const showSolo = filterType === 'all' || filterType === 'solo'
  const showGroup = filterType === 'all' || filterType === 'group'

  let filteredIncompleteJoin = incompleteJoinTrips
  if (filterStatus !== 'all' && filterStatus !== 'pending') {
    filteredIncompleteJoin = []
  }
  if (filterMonth) {
    const m = parseInt(filterMonth, 10)
    filteredIncompleteJoin = filteredIncompleteJoin.filter(row => {
      const mk = firstDepartureMonthKey(row.trip)
      return mk === m
    })
  }
  if (!showSolo) {
    filteredIncompleteJoin = []
  }

  const upcoming = filteredBookings.filter((b) => b.status === 'confirmed' || b.status === 'pending')
  const past = filteredBookings.filter((b) => b.status === 'completed' || b.status === 'cancelled')

  function openReview(bookingId: string) {
    setReviewingId(bookingId)
    setRatingDest(0)
    setRatingExp(0)
    setReviewTitle('')
    setReviewBody('')
  }

  async function handleSubmitReview(booking: Booking) {
    if (ratingDest === 0 || ratingExp === 0) {
      toast.error('Please rate both categories')
      return
    }
    if (!booking.package_id) {
      toast.error('Unable to submit review for this booking')
      return
    }
    setSubmitting(true)
    const result = await submitReview(
      booking.id,
      booking.package_id,
      ratingDest,
      ratingExp,
      reviewTitle,
      reviewBody,
    )
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Review submitted! Thank you!')
      setReviewed(prev => new Set([...prev, booking.id]))
      setReviewingId(null)
    }
    setSubmitting(false)
  }

  function StarRating({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
    return (
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">{label}</label>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map(i => (
            <button key={i} onClick={() => onChange(i)} className="focus:outline-none">
              <Star className={`h-6 w-6 transition-colors ${i <= value ? 'text-primary fill-primary' : 'text-white/35 hover:text-primary/60'}`} />
            </button>
          ))}
        </div>
      </div>
    )
  }

  const hasFilters = filterStatus !== 'all' || filterType !== 'all' || filterMonth !== ''

  return (
    <div className="space-y-8">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        {['all', 'pending', 'confirmed', 'completed', 'cancelled'].map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              filterStatus === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:border-foreground/30'
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
        <span className="text-border">|</span>
        {(['all', 'solo', 'group'] as const).map(t => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              filterType === t ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:border-foreground/30'
            }`}
          >
            {t === 'all' ? 'All Types' : t === 'solo' ? 'Solo' : 'Group'}
          </button>
        ))}
        <select
          value={filterMonth}
          onChange={e => setFilterMonth(e.target.value)}
          className="px-3 py-1.5 rounded-full text-xs bg-card border border-border focus:outline-none focus:border-primary"
        >
          <option value="">All Months</option>
          {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
            <option key={i} value={i}>{m}</option>
          ))}
        </select>
        {hasFilters && (
          <button onClick={() => { setFilterStatus('all'); setFilterType('all'); setFilterMonth('') }} className="text-xs text-destructive hover:underline ml-1">
            Clear
          </button>
        )}
      </div>

      {/* Community trips: join request not yet matched to a booking row */}
      {showSolo && filteredIncompleteJoin.length > 0 && (
        <div>
          <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Trips in progress
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Host or UnSOLO approval pending, or complete payment to confirm your spot.
          </p>
          <div className="space-y-4">
            {filteredIncompleteJoin.map(row => (
              <IncompleteJoinCard key={row.joinRequestId} row={row} />
            ))}
          </div>
        </div>
      )}

      {/* Join Group Trip */}
      <div className="p-4 rounded-xl border border-border bg-card/50">
        <h3 className="text-sm font-bold mb-2 flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          Join a Group Trip
        </h3>
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (!joinCode.trim()) return
            setJoining(true)
            const result = await joinGroupByInvite(joinCode.trim())
            if ('error' in result) {
              toast.error(result.error)
            } else {
              toast.success('Joined group trip!')
              setJoinCode('')
              router.refresh()
            }
            setJoining(false)
          }}
          className="flex gap-2"
        >
          <Input
            value={joinCode}
            onChange={e => setJoinCode(e.target.value)}
            placeholder="Enter invite code..."
            className="bg-secondary border-border flex-1"
          />
          <Button type="submit" disabled={joining || !joinCode.trim()} className="bg-primary text-black font-bold hover:bg-primary/90">
            {joining ? '...' : 'Join'}
          </Button>
        </form>
      </div>

      {/* Group Bookings */}
      {showGroup && filteredGroupBookings.length > 0 && (
        <div>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" /> Group Trips
          </h2>
          <div className="space-y-4">
            {filteredGroupBookings.map(group => {
              const pkg = group.package
              const myStatus = group.my_status
              const isOrganizer = currentUserId === group.organizer_id
              const needsPayment = myStatus === 'invited' || myStatus === 'accepted'

              const isGroupExpanded = expandedId === `group-${group.id}`

              return (
                <Card key={group.id} className="bg-card border-border hover:border-primary/20 transition-colors cursor-pointer" onClick={() => setExpandedId(isGroupExpanded ? null : `group-${group.id}`)}>
                  <CardContent className="p-5">
                    {/* Collapsed header — same layout as solo cards */}
                    <div className="flex flex-col sm:flex-row gap-4">
                      {pkg?.images?.[0] && (
                        <div className="w-full sm:w-28 h-28 rounded-xl overflow-hidden bg-secondary flex-shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={pkg.images[0]} alt={pkg.title} className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                          <h3 className="font-bold text-lg leading-tight">{pkg?.title || 'Group Trip'}</h3>
                          <div className="flex flex-wrap gap-2 justify-end">
                            {needsPayment && (
                              <Badge className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                                Payment pending
                              </Badge>
                            )}
                            <Badge className={group.total_paid === group.total_members ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}>
                              {group.total_paid}/{group.total_members} paid
                            </Badge>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mb-3">
                          {pkg?.destination && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" /> {pkg.destination.name}, {pkg.destination.state}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />{' '}
                            {pkg?.duration_days
                              ? formatDateRangeFromEdges(
                                  group.travel_date,
                                  tripEndDateIsoForBooking(group.travel_date, tripCalFromPackage(pkg)),
                                )
                              : formatDate(group.travel_date)}
                          </span>
                          {group.status === 'confirmed' && (() => {
                            const cal = tripCalFromPackage(pkg)
                            const endIso = tripEndDateIsoForBooking(group.travel_date, cal)
                            const countdown = getTripCountdown(
                              group.travel_date,
                              calendarInclusiveDaysForTravelDate(group.travel_date, cal),
                              endIso,
                            )
                            return countdown ? (
                              <span className="flex items-center gap-1 text-primary font-medium">
                                {countdown.emoji} {countdown.text}
                              </span>
                            ) : null
                          })()}
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" /> {group.total_members} member{group.total_members > 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-bold text-primary text-sm">{formatPrice(group.per_person_paise)}</span>
                          <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                            <Button variant="outline" size="sm" className="border-border text-xs" asChild>
                              <Link href="/tribe">
                                <MessageCircle className="mr-1 h-3 w-3" /> Trip Chat
                              </Link>
                            </Button>
                            {needsPayment && (
                              <Button size="sm" className="bg-primary text-primary-foreground text-xs" asChild>
                                <Link href={`/packages/${pkg?.slug}?group=${group.id}`}>
                                  <CreditCard className="mr-1 h-3 w-3" /> Pay Share
                                </Link>
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isGroupExpanded && (
                      <div className="mt-4 pt-4 border-t border-border space-y-3" onClick={e => e.stopPropagation()}>
                        {/* Price breakdown */}
                        <div className="bg-secondary/50 rounded-lg p-3 text-xs space-y-1">
                          <div className="flex justify-between text-muted-foreground">
                            <span>Total group ({group.total_members} × {formatPrice(group.per_person_paise)})</span>
                            <span>{formatPrice(group.per_person_paise * group.total_members)}</span>
                          </div>
                          <div className="flex justify-between font-bold text-foreground border-t border-border pt-1">
                            <span>Your share</span>
                            <span className="text-primary">{formatPrice(group.per_person_paise)}</span>
                          </div>
                        </div>

                        {/* Members list */}
                        <div className="space-y-1">
                          <span className="text-xs text-muted-foreground font-medium">Members:</span>
                          {group.members.map(m => (
                            <div key={m.user_id} className="flex items-center justify-between text-xs">
                              <span>
                                {m.full_name || m.username}
                                {m.user_id === group.organizer_id && <span className="text-primary ml-1">(organizer)</span>}
                                {m.user_id === currentUserId && <span className="text-muted-foreground ml-1">(you)</span>}
                              </span>
                              <span className={m.status === 'paid' ? 'text-green-400' : 'text-yellow-400'}>
                                {m.status === 'paid' ? '✅ Paid' : '⏳ Pending'}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* 24hr policy note — hide when all paid */}
                        {group.total_paid < group.total_members && (
                          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            All members must pay within 24 hours of group creation or the trip will be auto-cancelled with full refund for those who paid.
                          </p>
                        )}

                        {/* Actions */}
                        <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                          {group.package?.slug && (
                            <Button variant="outline" size="sm" className="border-border text-xs" asChild>
                              <Link href={`/packages/${group.package.slug}`}>
                                <ArrowRight className="mr-1 h-3 w-3" /> View Full Package
                              </Link>
                            </Button>
                          )}
                          {group.total_paid === group.total_members && (
                            <GroupCancellationButton groupId={group.id} />
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* Service Bookings */}
      {serviceBookings.length > 0 && (
        <div>
          <h2 className="text-xl font-bold mb-4">Service Bookings</h2>
          <div className="space-y-4">
            {serviceBookings.map((booking) => {
              const listing = (booking as any).service_listings
              const imageUrl = listing?.images?.[0] || '/placeholder-listing.svg'
              const checkInDate = booking.check_in_date ? formatDate(booking.check_in_date) : 'N/A'
              const checkOutDate = booking.check_out_date ? formatDate(booking.check_out_date) : null

              return (
                <Card key={booking.id} className="bg-card border-border hover:border-primary/20 transition-colors">
                  <CardContent className="p-5">
                    <div className="flex flex-col sm:flex-row gap-4">
                      <div className="w-full sm:w-28 h-28 rounded-xl overflow-hidden bg-secondary flex-shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={imageUrl} alt={listing?.title} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                          <div>
                            <h3 className="font-bold text-lg leading-tight">{listing?.title}</h3>
                            <p className="text-sm text-muted-foreground">{listing?.location}</p>
                          </div>
                          <Badge className={STATUS_COLORS[booking.status] || STATUS_COLORS.pending}>
                            {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mb-3">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" /> {checkInDate}{checkOutDate ? ` — ${checkOutDate}` : ''}
                          </span>
                          {booking.quantity && (
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" /> {booking.quantity} {listing?.type === 'stays' ? 'room(s)' : 'unit(s)'}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-bold text-primary text-sm">{formatPrice(booking.total_amount_paise)}</span>
                          <Link href={`/listings/${listing?.type}/${listing?.slug}`} className="flex">
                            <Button variant="outline" size="sm" className="border-border text-xs">
                              <ArrowRight className="mr-1 h-3 w-3" /> View Booking
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {showSolo && upcoming.length > 0 && (
        <div>
          <h2 className="text-xl font-bold mb-4">Upcoming Trips</h2>
          <div className="space-y-4">
            {upcoming.map((booking) => (
              <BookingItem key={booking.id} booking={booking} expanded={expandedId === booking.id} onToggle={() => setExpandedId(expandedId === booking.id ? null : booking.id)} />
            ))}
          </div>
        </div>
      )}

      {showSolo && past.length > 0 && (
        <div>
          <h2 className="text-xl font-bold mb-4 text-muted-foreground">Past Trips</h2>
          <div className="space-y-4">
            {past.map((booking) => (
              <div key={booking.id}>
                <BookingItem
                  booking={booking}
                  expanded={expandedId === booking.id}
                  onToggle={() => setExpandedId(expandedId === booking.id ? null : booking.id)}
                  showReview={booking.status === 'completed' && !reviewed.has(booking.id)}
                  onReview={() => openReview(booking.id)}
                  hasReviewed={reviewed.has(booking.id)}
                  showHostRating={booking.status === 'completed' && !!booking.package?.host_id && !ratedHosts.has(booking.id)}
                  onRateHost={() => setRatingBookingId(booking.id)}
                  hasRatedHost={ratedHosts.has(booking.id)}
                  ratingOpen={ratingBookingId === booking.id}
                  onRatingClose={() => setRatingBookingId(null)}
                  onRatingSubmitted={() => {
                    setRatedHosts(prev => new Set([...prev, booking.id]))
                    setRatingBookingId(null)
                  }}
                />

                {/* Review form */}
                {reviewingId === booking.id && (
                  <Card className="bg-card border-primary/30 mt-2 ml-4">
                    <CardContent className="p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-sm">Write a Review</h3>
                        <button onClick={() => setReviewingId(null)}><X className="h-4 w-4 text-muted-foreground" /></button>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <StarRating value={ratingDest} onChange={setRatingDest} label="Destination / Landscape" />
                        <StarRating value={ratingExp} onChange={setRatingExp} label="Experience with UnSOLO" />
                      </div>

                      <Input
                        placeholder="Review title (optional)"
                        value={reviewTitle}
                        onChange={e => setReviewTitle(e.target.value)}
                        className="bg-secondary border-border"
                      />
                      <Textarea
                        placeholder="Share your experience..."
                        value={reviewBody}
                        onChange={e => setReviewBody(e.target.value)}
                        rows={3}
                        className="bg-secondary border-border resize-none"
                      />
                      <Button
                        onClick={() => handleSubmitReview(booking)}
                        disabled={submitting || ratingDest === 0 || ratingExp === 0}
                        className="bg-primary text-black font-bold hover:bg-primary/90"
                      >
                        {submitting ? 'Submitting...' : 'Submit Review'}
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SoloBookingStatusBadge({ booking }: { booking: Booking }) {
  const pkg = booking.package
  const isHostTrip = !!pkg?.host_id
  if (booking.status === 'confirmed') {
    return <Badge className={`text-xs border ${STATUS_COLORS.confirmed}`}>Confirmed</Badge>
  }
  if (booking.status === 'cancelled') {
    return <Badge className={`text-xs border ${STATUS_COLORS.cancelled}`}>Cancelled</Badge>
  }
  if (booking.status === 'completed') {
    return <Badge className={`text-xs border ${STATUS_COLORS.completed}`}>Completed</Badge>
  }
  if (booking.status === 'pending') {
    if (isHostTrip && pkg?.moderation_status === 'pending') {
      return (
        <Badge className="text-xs border bg-amber-500/15 text-amber-300 border-amber-500/35">
          Awaiting UnSOLO approval
        </Badge>
      )
    }
    return <Badge className={`text-xs border ${STATUS_COLORS.pending}`}>Payment pending</Badge>
  }
  return (
    <Badge className={`text-xs border ${STATUS_COLORS[booking.status] || 'bg-secondary text-muted-foreground border-border'}`}>
      {booking.status}
    </Badge>
  )
}

function CompleteJoinRequestPayment({
  joinRequestId,
  packageTitle,
}: {
  joinRequestId: string
  packageTitle: string
}) {
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const router = useRouter()

  async function onPay() {
    setLoading(true)
    try {
      const result = await createCommunityTripOrder(joinRequestId, {})
      if ('error' in result) {
        toast.error(result.error)
        setLoading(false)
        return
      }
      if ('instant' in result && result.instant) {
        toast.success('Booking confirmed!')
        router.push(`/book/success?booking_id=${result.bookingId}`)
        router.refresh()
        setLoading(false)
        return
      }
      const options = {
        key: result.keyId,
        amount: result.amount,
        currency: result.currency,
        name: 'UnSOLO',
        description: packageTitle || 'Community trip',
        order_id: result.orderId,
        prefill: result.prefill,
        notes: result.notes,
        theme: { color: '#FFAA00', backdrop_color: '#000000' },
        handler: async (response: {
          razorpay_order_id: string
          razorpay_payment_id: string
          razorpay_signature: string
        }) => {
          setVerifying(true)
          const verification = await confirmPayment(
            response.razorpay_order_id,
            response.razorpay_payment_id,
            response.razorpay_signature,
          )
          if ('error' in verification && verification.error) {
            toast.error(verification.error)
          } else if ('success' in verification && verification.success) {
            toast.success('Payment confirmed!')
            router.push(`/book/success?booking_id=${verification.bookingId}`)
            router.refresh()
          } else {
            toast.error('Payment verification failed')
          }
          setVerifying(false)
          setLoading(false)
        },
        modal: { ondismiss: () => setLoading(false) },
      }
      const Rzp = window.Razorpay
      if (!Rzp) {
        toast.error('Payment could not load. Refresh the page.')
        setLoading(false)
        return
      }
      const rzp = new Rzp(options)
      rzp.on('payment.failed', () => {
        toast.error('Payment failed. Please try again.')
        setLoading(false)
      })
      rzp.open()
    } catch {
      toast.error('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <>
      {verifying && (
        <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-card border border-border rounded-xl p-8 text-center max-w-sm mx-4">
            <div className="h-12 w-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4" />
            <p className="font-bold">Confirming your booking...</p>
            <p className="text-sm text-muted-foreground mt-1">Please wait while we verify your payment.</p>
          </div>
        </div>
      )}
      <Button
        size="sm"
        className="bg-primary text-primary-foreground text-xs font-bold"
        disabled={loading || verifying}
        onClick={() => void onPay()}
      >
        <CreditCard className="mr-1 h-3 w-3" />
        {loading ? 'Opening…' : verifying ? 'Confirming…' : 'Complete payment'}
      </Button>
    </>
  )
}

function IncompleteJoinCancelTrip({
  joinRequestId,
  label,
}: {
  joinRequestId: string
  label: string
}) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function onClick() {
    if (!window.confirm('Are you sure? This will cancel this trip request.')) return
    setLoading(true)
    const r = await withdrawJoinRequest(joinRequestId)
    if (r.error) toast.error(r.error)
    else {
      toast.success('Cancelled')
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="border-red-500/30 text-red-400 text-xs hover:bg-red-500/10"
      disabled={loading}
      onClick={() => void onClick()}
    >
      <Ban className="mr-1 h-3 w-3" />
      {loading ? '…' : label}
    </Button>
  )
}

function IncompleteJoinCard({ row }: { row: IncompleteJoinTrip }) {
  const cfg = INCOMPLETE_JOIN_BADGE[row.status]
  const pkg = row.trip
  const cal = tripCalFromPackage(pkg)
  const firstDep = pkg.departure_dates?.length ? [...pkg.departure_dates].sort()[0] : null
  const tripEndIso = firstDep ? tripEndDateIsoForBooking(firstDep, cal) : null
  const cancelLabel = row.status === 'payment_pending' ? 'Cancel trip' : 'Withdraw request'

  const deadlinePassed = row.status === 'payment_pending' && row.paymentDeadline && new Date(row.paymentDeadline) < new Date()

  return (
    <Card className="bg-card border-border hover:border-primary/20 transition-colors">
      <CardContent className="p-5">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="w-full sm:w-28 h-28 rounded-xl overflow-hidden bg-secondary flex-shrink-0">
            {pkg.images?.[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pkg.images[0]} alt={pkg.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-2xl">🏔️</div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
              <h3 className="font-bold text-lg leading-tight">{pkg.title}</h3>
              {!deadlinePassed && <Badge className={`text-xs border ${cfg.className}`}>{cfg.label}</Badge>}
              {deadlinePassed && (
                <Badge className="text-xs border bg-red-500/20 text-red-400 border-red-500/30">
                  Request expired
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mb-3">
              {pkg.destination && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {pkg.destination.name}, {pkg.destination.state}
                </span>
              )}
              {firstDep && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {pkg.duration_days > 0 && tripEndIso
                    ? formatDateRangeFromEdges(firstDep, tripEndIso)
                    : formatDate(firstDep)}
                </span>
              )}
              {row.status === 'payment_pending' && row.paymentDeadline && !deadlinePassed && (
                <span className="flex items-center gap-1 text-amber-400/90">
                  <Clock className="h-3 w-3" />
                  Pay by {formatDate(row.paymentDeadline.split('T')[0])}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {deadlinePassed ? (
                <>
                  <Button
                    size="sm"
                    className="bg-primary text-primary-foreground text-xs"
                    asChild
                  >
                    <Link href={`/packages/${pkg.slug}?rejoin=true`}>
                      <ArrowRight className="mr-1 h-3 w-3" /> Re-join Trip
                    </Link>
                  </Button>
                  <IncompleteJoinCancelTrip joinRequestId={row.joinRequestId} label="Remove" />
                </>
              ) : (
                <>
                  {row.status === 'payment_pending' && (
                    <CompleteJoinRequestPayment joinRequestId={row.joinRequestId} packageTitle={pkg.title} />
                  )}
                  <IncompleteJoinCancelTrip joinRequestId={row.joinRequestId} label={cancelLabel} />
                  <Button
                    size="sm"
                    variant={row.status === 'payment_pending' ? 'outline' : 'default'}
                    className={
                      row.status === 'payment_pending'
                        ? 'border-border text-xs'
                        : 'bg-primary text-primary-foreground text-xs'
                    }
                    asChild
                  >
                    <Link href={`/packages/${pkg.slug}`}>
                      <ArrowRight className="mr-1 h-3 w-3" /> Open trip
                    </Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function TokenBalancePay({ bookingId }: { bookingId: string }) {
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const router = useRouter()

  async function onPay() {
    setLoading(true)
    const result = await createBookingBalanceOrder(bookingId)
    if ('error' in result) {
      toast.error(result.error)
      setLoading(false)
      return
    }
    const options = {
      key: result.keyId,
      amount: result.amount,
      currency: result.currency,
      name: 'UnSOLO',
      description: 'Trip balance payment',
      order_id: result.orderId,
      prefill: result.prefill,
      notes: result.notes,
      theme: { color: '#FFAA00', backdrop_color: '#000000' },
      handler: async (response: {
        razorpay_order_id: string
        razorpay_payment_id: string
        razorpay_signature: string
      }) => {
        setVerifying(true)
        const v = await confirmPayment(
          response.razorpay_order_id,
          response.razorpay_payment_id,
          response.razorpay_signature,
        )
        if ('error' in v && v.error) {
          toast.error(v.error)
        } else if ('success' in v && v.success) {
          toast.success('Trip fully paid!')
          router.refresh()
        } else {
          toast.error('Payment verification failed')
        }
        setVerifying(false)
        setLoading(false)
      },
      modal: { ondismiss: () => setLoading(false) },
    }
    const Rzp = window.Razorpay
    if (!Rzp) {
      toast.error('Payment could not load. Refresh the page and try again.')
      setLoading(false)
      return
    }
    const rzp = new Rzp(options)
    rzp.on('payment.failed', () => {
      toast.error('Payment failed. Please try again.')
      setLoading(false)
    })
    rzp.open()
  }

  return (
    <Button
      size="sm"
      className="bg-primary text-primary-foreground text-xs"
      disabled={loading || verifying}
      onClick={(e) => {
        e.stopPropagation()
        void onPay()
      }}
    >
      <CreditCard className="mr-1 h-3 w-3" />
      {verifying ? 'Verifying…' : loading ? 'Opening…' : 'Pay remaining balance'}
    </Button>
  )
}

function addToCalendar(booking: Booking, tripEndIso: string | null) {
  const pkg = booking.package
  const title = pkg?.title || 'UnSOLO Trip'
  const location = pkg?.destination ? `${pkg.destination.name}, ${pkg.destination.state}` : ''
  const start = booking.travel_date ? booking.travel_date.replace(/-/g, '') : ''
  const end = tripEndIso ? tripEndIso.replace(/-/g, '') : start
  const endPlusOne = end
    ? (() => {
        const d = new Date(tripEndIso + 'T00:00:00')
        d.setDate(d.getDate() + 1)
        return d.toISOString().split('T')[0].replace(/-/g, '')
      })()
    : start

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    `SUMMARY:${title}`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${endPlusOne}`,
    `LOCATION:${location}`,
    `DESCRIPTION:UnSOLO trip #${booking.confirmation_code || booking.id.slice(0, 8)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')

  const blob = new Blob([ics], { type: 'text/calendar' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${title.replace(/\s+/g, '-')}.ics`
  a.click()
  URL.revokeObjectURL(url)
}

function BookingItem({
  booking,
  expanded,
  onToggle,
  showReview,
  onReview,
  hasReviewed,
  showHostRating,
  onRateHost,
  hasRatedHost,
  ratingOpen,
  onRatingClose,
  onRatingSubmitted,
}: {
  booking: Booking
  expanded: boolean
  onToggle: () => void
  showReview?: boolean
  onReview?: () => void
  hasReviewed?: boolean
  showHostRating?: boolean
  onRateHost?: () => void
  hasRatedHost?: boolean
  ratingOpen?: boolean
  onRatingClose?: () => void
  onRatingSubmitted?: () => void
}) {
  const pkg = booking.package
  const jp = (pkg?.join_preferences ?? null) as JoinPreferences | null
  const isTokenTrip = !!pkg?.host_id && isTokenDepositEnabled(jp ?? undefined)
  const paidToward = booking.deposit_paise ?? 0
  const balanceDue = Math.max(0, booking.total_amount_paise - paidToward)
  const showTokenBalance = isTokenTrip && booking.status === 'confirmed' && balanceDue > 0
  const duration = pkg?.duration_days || 0
  const cal = tripCalFromPackage(pkg)
  const tripEndIso = booking.travel_date ? tripEndDateIsoForBooking(booking.travel_date, cal) : null

  return (
    <Card className="bg-card border-border hover:border-primary/20 transition-colors cursor-pointer" onClick={onToggle}>
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
              <div className="flex flex-wrap gap-1.5 justify-end">
                <SoloBookingStatusBadge booking={booking} />
                {booking.cancellation_status === 'approved' && booking.refund_status && (
                  <Badge className={`text-xs border ${
                    booking.refund_status === 'completed'
                      ? 'bg-green-500/20 text-green-400 border-green-500/30'
                      : booking.refund_status === 'processing'
                      ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                      : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                  }`}>
                    {booking.refund_status === 'completed' ? '✅ Refunded' : booking.refund_status === 'processing' ? '⏳ Refund in process' : '⏸ Refund pending'}
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mb-3">
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {pkg?.destination?.name}, {pkg?.destination?.state}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />{' '}
                {duration > 0 && tripEndIso
                  ? formatDateRangeFromEdges(booking.travel_date!, tripEndIso)
                  : booking.travel_date ? formatDate(booking.travel_date) : '—'}
              </span>
              {booking.status === 'confirmed' && booking.travel_date && tripEndIso && (() => {
                const countdown = getTripCountdown(
                  booking.travel_date,
                  calendarInclusiveDaysForTravelDate(booking.travel_date, cal),
                  tripEndIso,
                )
                return countdown ? (
                  <span className="flex items-center gap-1 text-primary font-medium">
                    {countdown.emoji} {countdown.text}
                  </span>
                ) : null
              })()}
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" /> {booking.guests} guest{booking.guests > 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm">
                {showTokenBalance ? (
                  <>
                    <span className="text-muted-foreground">Paid </span>
                    <span className="font-bold text-primary">{formatPrice(paidToward)}</span>
                    <span className="text-muted-foreground"> of </span>
                    <span className="font-bold text-primary">{formatPrice(booking.total_amount_paise)}</span>
                    <span className="text-xs text-amber-600/90 dark:text-amber-400/90 ml-2">Balance due</span>
                    {booking.confirmation_code && (
                      <span className="text-muted-foreground ml-2 text-xs">#{booking.confirmation_code}</span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="font-bold text-primary">{formatPrice(booking.total_amount_paise)}</span>
                    {booking.confirmation_code && (
                      <span className="text-muted-foreground ml-2 text-xs">#{booking.confirmation_code}</span>
                    )}
                  </>
                )}
              </div>
              <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                {showTokenBalance && <TokenBalancePay bookingId={booking.id} />}
                {booking.status === 'confirmed' && booking.travel_date && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-border text-xs"
                    onClick={() => addToCalendar(booking, tripEndIso)}
                  >
                    <CalendarPlus className="mr-1 h-3 w-3" /> Add to Calendar
                  </Button>
                )}
                {booking.status !== 'pending' && (
                  <Button variant="outline" size="sm" className="border-border text-xs" asChild>
                    <Link href="/tribe">
                      <MessageCircle className="mr-1 h-3 w-3" /> Trip Chat
                    </Link>
                  </Button>
                )}
                {showReview && onReview && (
                  <Button size="sm" className="bg-primary text-primary-foreground text-xs relative z-10" onClick={(e) => { e.stopPropagation(); e.preventDefault(); onReview(); }}>
                    <Star className="mr-1 h-3 w-3" /> Write Review
                  </Button>
                )}
                {hasReviewed && (
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                    <CheckCircle className="mr-1 h-3 w-3" /> Reviewed
                  </Badge>
                )}
                {showHostRating && onRateHost && (
                  <Button size="sm" className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs relative z-10" onClick={(e) => { e.stopPropagation(); e.preventDefault(); onRateHost(); }}>
                    <Star className="mr-1 h-3 w-3" /> Rate Host
                  </Button>
                )}
                {hasRatedHost && (
                  <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs">
                    <CheckCircle className="mr-1 h-3 w-3" /> Host Rated
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Host Rating Card */}
        {ratingOpen && onRatingClose && onRatingSubmitted && (
          <div className="mt-2 ml-0" onClick={e => e.stopPropagation()}>
            <HostRatingCard
              hostName={pkg?.host?.full_name || pkg?.host?.username || 'Your host'}
              hostAvatar={pkg?.host?.avatar_url}
              bookingId={booking.id}
              onSubmit={async (rating, comment) => {
                const response = await fetch('/api/host-ratings', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    booking_id: booking.id,
                    rating,
                    comment: comment || null,
                  }),
                })
                if (!response.ok) {
                  throw new Error('Failed to submit rating')
                }
                onRatingSubmitted()
              }}
              onSkip={onRatingClose}
            />
          </div>
        )}

        {/* Expanded details */}
        {expanded && (
          <div className="mt-4 pt-4 border-t border-border space-y-3 text-sm" onClick={e => e.stopPropagation()}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-muted-foreground text-xs block">Booking ID</span>
                <span className="font-mono text-xs">{booking.id.slice(0, 8)}...</span>
              </div>
              <div>
                <span className="text-muted-foreground text-xs block">Confirmation Code</span>
                <span className="font-bold text-primary">{booking.confirmation_code || '—'}</span>
              </div>
              <div>
                <span className="text-muted-foreground text-xs block">Departure</span>
                <span>{booking.travel_date ? formatDate(booking.travel_date) : '—'}</span>
              </div>
              {duration > 0 && tripEndIso && (
                <div>
                  <span className="text-muted-foreground text-xs block">Return</span>
                  <span>{formatDate(tripEndIso)}</span>
                </div>
              )}
              <div>
                <span className="text-muted-foreground text-xs block">Duration</span>
                <span>{pkg ? packageDurationShortLabel(pkg) : `${duration} days`}</span>
              </div>
              <div>
                <span className="text-muted-foreground text-xs block">
                  {showTokenBalance ? 'Paid toward trip' : 'Total paid'}
                </span>
                <span className="font-bold text-primary">
                  {showTokenBalance ? formatPrice(paidToward) : formatPrice(booking.total_amount_paise)}
                </span>
              </div>
              {showTokenBalance && (
                <div>
                  <span className="text-muted-foreground text-xs block">Balance remaining</span>
                  <span className="font-bold text-amber-600 dark:text-amber-400">{formatPrice(balanceDue)}</span>
                </div>
              )}
            </div>

            {/* What's Included */}
            {pkg?.includes && pkg.includes.length > 0 && (
              <div>
                <span className="text-muted-foreground text-xs block mb-1">What&apos;s Included</span>
                <div className="flex flex-wrap gap-1.5">
                  {pkg.includes.map(item => (
                    <Badge key={item} variant="outline" className="text-xs border-border">
                      <CheckCircle className="mr-1 h-2.5 w-2.5 text-primary" /> {item}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="outline" size="sm" className="border-border text-xs" asChild>
                <Link href={`/packages/${pkg?.slug}`}>
                  View Full Package <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>

              {/* Date change - only for pending bookings */}
              {booking.status === 'pending' && booking.travel_date && (
                <DateChanger bookingId={booking.id} currentDate={booking.travel_date} />
              )}

              {/* Cancellation - for pending or confirmed bookings that haven't ended yet */}
              {(booking.status === 'pending' || booking.status === 'confirmed') && !booking.cancellation_status && (() => {
                const end = new Date(tripEndIso + 'T23:59:59')
                const tripEnded = end < new Date()
                return tripEnded ? null : (
                  <CancelRequester bookingId={booking.id} bookingStatus={booking.status} />
                )
              })()}

              {booking.cancellation_status === 'requested' && (
                <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-xs">
                  <AlertTriangle className="mr-1 h-3 w-3" /> Cancellation Pending
                </Badge>
              )}
              {booking.cancellation_status === 'approved' && (
                <div className="text-xs space-y-0.5">
                  <span className="text-red-400 font-medium">Cancelled</span>
                  {booking.refund_amount_paise ? (
                    <span className="block">
                      Refund: {formatPrice(booking.refund_amount_paise)}
                      {booking.refund_status === 'completed' && <span className="text-green-400 ml-1">✅ Credited</span>}
                      {booking.refund_status === 'processing' && <span className="text-blue-400 ml-1">⏳ In process</span>}
                      {(!booking.refund_status || booking.refund_status === 'pending') && <span className="text-yellow-400 ml-1">⏸ Pending</span>}
                    </span>
                  ) : null}
                  {booking.refund_note && <span className="block text-muted-foreground">{booking.refund_note}</span>}
                </div>
              )}
              {booking.cancellation_status === 'denied' && (
                <div className="text-xs">
                  <span className="text-red-400 font-medium">Cancellation Denied</span>
                  {booking.admin_cancellation_note && (
                    <span className="text-muted-foreground block mt-0.5">{booking.admin_cancellation_note}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Date Changer (inline) ───────────────────────────────────
function DateChanger({ bookingId, currentDate }: { bookingId: string; currentDate: string }) {
  const [editing, setEditing] = useState(false)
  const [newDate, setNewDate] = useState(currentDate)
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  async function save() {
    if (newDate === currentDate) { setEditing(false); return }
    setSaving(true)
    const result = await changeBookingDate(bookingId, newDate)
    if (result.error) toast.error(result.error)
    else { toast.success('Date updated!'); router.refresh() }
    setSaving(false)
    setEditing(false)
  }

  if (!editing) {
    return (
      <Button variant="outline" size="sm" className="border-border text-xs" onClick={() => setEditing(true)}>
        <Edit2 className="mr-1 h-3 w-3" /> Change Date
      </Button>
    )
  }

  const today = new Date().toISOString().split('T')[0]
  return (
    <div className="flex items-center gap-2">
      <input
        type="date"
        value={newDate}
        min={today}
        onChange={e => setNewDate(e.target.value)}
        className="bg-secondary border border-border rounded px-2 py-1 text-xs focus:outline-none focus:border-primary"
      />
      <Button size="sm" className="bg-primary text-primary-foreground text-xs h-7" onClick={save} disabled={saving}>
        {saving ? '...' : 'Save'}
      </Button>
      <button onClick={() => setEditing(false)} className="text-muted-foreground hover:text-white">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// ── Cancellation: unpaid = instant cancel + notify host/staff; paid = request flow ──
function CancelRequester({
  bookingId,
  bookingStatus,
}: {
  bookingId: string
  bookingStatus: 'pending' | 'confirmed'
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const router = useRouter()
  const isPending = bookingStatus === 'pending'

  async function submit() {
    if (!isPending && !reason.trim()) {
      toast.error('Please provide a reason')
      return
    }
    setSubmitting(true)
    const result = isPending
      ? await cancelPendingBooking(bookingId, reason.trim() || undefined)
      : await requestCancellation(bookingId, reason)
    if (result.error) toast.error(result.error)
    else {
      toast.success(isPending ? 'Booking cancelled' : 'Cancellation request submitted')
      router.refresh()
    }
    setSubmitting(false)
    setOpen(false)
  }

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="border-red-500/30 text-red-400 text-xs hover:bg-red-500/10"
        onClick={() => setOpen(true)}
      >
        {isPending ? (
          <>
            <Ban className="mr-1 h-3 w-3" /> Cancel booking
          </>
        ) : (
          <>
            <AlertTriangle className="mr-1 h-3 w-3" /> Request Cancellation
          </>
        )}
      </Button>
    )
  }

  return (
    <div className="w-full space-y-2 mt-2 p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
      {isPending ? (
        <>
          <p className="text-xs font-medium text-foreground">Cancel before payment?</p>
          <p className="text-[11px] text-muted-foreground leading-snug">
            No payment has been completed. Your booking will be cancelled immediately and the host and UnSOLO will be
            notified.
          </p>
          <Textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Optional note for the host…"
            rows={2}
            className="bg-secondary border-border resize-none text-xs"
          />
        </>
      ) : (
        <>
          <p className="text-xs font-medium text-red-400">Why do you want to cancel?</p>
          <Textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Reason for cancellation..."
            rows={2}
            className="bg-secondary border-border resize-none text-xs"
          />
        </>
      )}
      <div className="flex gap-2">
        <Button size="sm" className="bg-red-500 text-white text-xs hover:bg-red-600" onClick={submit} disabled={submitting}>
          {submitting ? 'Submitting...' : isPending ? 'Cancel booking' : 'Submit Request'}
        </Button>
        <Button variant="outline" size="sm" className="border-border text-xs" onClick={() => setOpen(false)}>
          Back
        </Button>
      </div>
    </div>
  )
}

// ── Group Cancellation ──────────────────────────────────────
function GroupCancellationButton({ groupId }: { groupId: string }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const router = useRouter()

  async function submit() {
    if (!reason.trim()) { toast.error('Please provide a reason'); return }
    setSubmitting(true)
    try {
      const { requestGroupCancellation } = await import('@/actions/group-booking')
      const result = await requestGroupCancellation(groupId, reason)
      if (result.error) toast.error(result.error)
      else { toast.success('Group cancellation request submitted'); router.refresh() }
    } catch {
      toast.error('Something went wrong')
    }
    setSubmitting(false)
    setOpen(false)
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="border-red-500/30 text-red-400 text-xs hover:bg-red-500/10" onClick={() => setOpen(true)}>
        <AlertTriangle className="mr-1 h-3 w-3" /> Request Cancellation
      </Button>
    )
  }

  return (
    <div className="w-full space-y-2 mt-2 p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
      <p className="text-xs font-medium text-red-400">Why do you want to cancel the group trip?</p>
      <Textarea
        value={reason}
        onChange={e => setReason(e.target.value)}
        placeholder="Reason for cancellation..."
        rows={2}
        className="bg-secondary border-border resize-none text-xs"
      />
      <div className="flex gap-2">
        <Button size="sm" className="bg-red-500 text-white text-xs hover:bg-red-600" onClick={submit} disabled={submitting}>
          {submitting ? 'Submitting...' : 'Submit Request'}
        </Button>
        <Button variant="outline" size="sm" className="border-border text-xs" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
