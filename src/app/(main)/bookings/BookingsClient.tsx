'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { MapPin, Calendar, Users, MessageCircle, Star, X, CheckCircle, Mountain, ArrowRight, AlertTriangle, Edit2 } from 'lucide-react'
import { formatPrice, formatDate, formatDateRange } from '@/lib/utils'
import { submitReview } from '@/actions/profile'
import { joinGroupByInvite } from '@/actions/group-booking'
import { requestCancellation, changeBookingDate } from '@/actions/booking'
import { toast } from 'sonner'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Booking } from '@/types'

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  confirmed: 'bg-green-500/20 text-green-400 border-green-500/30',
  cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
  completed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
}

interface Props {
  bookings: Booking[]
  reviewedBookingIds: string[]
}

export function BookingsClient({ bookings, reviewedBookingIds }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [reviewed, setReviewed] = useState<Set<string>>(new Set(reviewedBookingIds))
  const [joinCode, setJoinCode] = useState('')
  const [joining, setJoining] = useState(false)
  const router = useRouter()

  // Review form state
  const [ratingDest, setRatingDest] = useState(0)
  const [ratingExp, setRatingExp] = useState(0)
  const [reviewTitle, setReviewTitle] = useState('')
  const [reviewBody, setReviewBody] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const upcoming = bookings.filter((b) => b.status === 'confirmed' || b.status === 'pending')
  const past = bookings.filter((b) => b.status === 'completed' || b.status === 'cancelled')

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
              <Star className={`h-6 w-6 transition-colors ${i <= value ? 'text-primary fill-primary' : 'text-zinc-600 hover:text-zinc-400'}`} />
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
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

      {upcoming.length > 0 && (
        <div>
          <h2 className="text-xl font-bold mb-4">Upcoming Trips</h2>
          <div className="space-y-4">
            {upcoming.map((booking) => (
              <BookingItem key={booking.id} booking={booking} expanded={expandedId === booking.id} onToggle={() => setExpandedId(expandedId === booking.id ? null : booking.id)} />
            ))}
          </div>
        </div>
      )}

      {past.length > 0 && (
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
                />

                {/* Review form */}
                {reviewingId === booking.id && (
                  <Card className="bg-card border-primary/30 mt-2 ml-4">
                    <CardContent className="p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-sm">Write a Review</h3>
                        <button onClick={() => setReviewingId(null)}><X className="h-4 w-4 text-zinc-500" /></button>
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

function BookingItem({
  booking,
  expanded,
  onToggle,
  showReview,
  onReview,
  hasReviewed,
}: {
  booking: Booking
  expanded: boolean
  onToggle: () => void
  showReview?: boolean
  onReview?: () => void
  hasReviewed?: boolean
}) {
  const pkg = booking.package
  const duration = pkg?.duration_days || 0

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
              <Badge className={`text-xs ${STATUS_COLORS[booking.status] || 'bg-secondary text-muted-foreground'}`}>
                {booking.status}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mb-3">
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {pkg?.destination?.name}, {pkg?.destination?.state}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" /> {duration > 0 ? formatDateRange(booking.travel_date, duration) : formatDate(booking.travel_date)}
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
              <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                <Button variant="outline" size="sm" className="border-border text-xs" asChild>
                  <Link href="/chat">
                    <MessageCircle className="mr-1 h-3 w-3" /> Trip Chat
                  </Link>
                </Button>
                {showReview && onReview && (
                  <Button size="sm" className="bg-primary text-black text-xs" onClick={onReview}>
                    <Star className="mr-1 h-3 w-3" /> Write Review
                  </Button>
                )}
                {hasReviewed && (
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                    <CheckCircle className="mr-1 h-3 w-3" /> Reviewed
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>

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
                <span>{formatDate(booking.travel_date)}</span>
              </div>
              {duration > 0 && (
                <div>
                  <span className="text-muted-foreground text-xs block">Return</span>
                  <span>{formatDate((() => { const d = new Date(booking.travel_date); d.setDate(d.getDate() + duration - 1); return d.toISOString() })())}</span>
                </div>
              )}
              <div>
                <span className="text-muted-foreground text-xs block">Duration</span>
                <span>{duration} days</span>
              </div>
              <div>
                <span className="text-muted-foreground text-xs block">Total Paid</span>
                <span className="font-bold text-primary">{formatPrice(booking.total_amount_paise)}</span>
              </div>
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
              {booking.status === 'pending' && (
                <DateChanger bookingId={booking.id} currentDate={booking.travel_date} />
              )}

              {/* Cancellation - for pending or confirmed bookings */}
              {(booking.status === 'pending' || booking.status === 'confirmed') && !booking.cancellation_status && (
                <CancelRequester bookingId={booking.id} />
              )}

              {booking.cancellation_status === 'requested' && (
                <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-xs">
                  <AlertTriangle className="mr-1 h-3 w-3" /> Cancellation Pending
                </Badge>
              )}
              {booking.cancellation_status === 'approved' && (
                <div className="text-xs text-muted-foreground">
                  <span className="text-red-400 font-medium">Cancelled</span>
                  {booking.refund_amount_paise ? ` — Refund: ${formatPrice(booking.refund_amount_paise)}` : ''}
                  {booking.refund_note && <span className="block mt-0.5">{booking.refund_note}</span>}
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

// ── Cancellation Requester (inline) ─────────────────────────
function CancelRequester({ bookingId }: { bookingId: string }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const router = useRouter()

  async function submit() {
    if (!reason.trim()) { toast.error('Please provide a reason'); return }
    setSubmitting(true)
    const result = await requestCancellation(bookingId, reason)
    if (result.error) toast.error(result.error)
    else { toast.success('Cancellation request submitted'); router.refresh() }
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
      <p className="text-xs font-medium text-red-400">Why do you want to cancel?</p>
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
