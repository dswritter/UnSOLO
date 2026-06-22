'use client'

import { useState, useEffect, useTransition } from 'react'
import { formatPrice, formatDate, type Booking, type Profile } from '@/types'
import { assignMemberPOC, assignExternalPOC, searchMembersForPOC, updateBookingStatus, sharePOCWithCustomer, sendBookingConfirmationEmail, sendBookingMessage, updateBookingNotes, adminDeleteBooking } from '@/actions/admin'
import { processCancellation, initiateRefund, markRefundComplete, recordManualPayment, adminUpdateBookingPriceTier, refundBookingOverpayment, adminSetBookingCoupon } from '@/actions/booking'
import { formatDiscountLabel } from '@/lib/checkout-promos'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Mail, Send, UserPlus, ChevronDown, ChevronUp, StickyNote, AlertTriangle, Phone, AtSign, Trash2, IndianRupee } from 'lucide-react'
import { CancellationReviewPanel } from './CancellationReviewPanel'
import { PartialCancelManager, type PartialCancellationRow } from '@/components/bookings/PartialCancellation'
import { BookingChangeRequestManager, type ChangeRequestRow } from '@/components/bookings/BookingChangeRequest'
import { packageDurationShortLabel, type PackageDurationDisplay } from '@/lib/package-trip-calendar'

interface Props {
  bookings: Booking[]
  staffMembers: Pick<Profile, 'id' | 'username' | 'full_name' | 'role'>[]
  partialCancellationsByBooking?: Record<string, PartialCancellationRow[]>
  changeRequestsByBooking?: Record<string, ChangeRequestRow[]>
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-900/50 text-yellow-300 border-yellow-700',
  confirmed: 'bg-green-900/50 text-green-300 border-green-700',
  cancelled: 'bg-red-900/50 text-red-300 border-red-700',
  completed: 'bg-blue-900/50 text-blue-300 border-blue-700',
}

export function AdminBookingsClient({ bookings: initialBookings, partialCancellationsByBooking = {}, changeRequestsByBooking = {} }: Props) {
  // Read initial filter from URL params
  const [filter, setFilter] = useState(() => {
    if (typeof window === 'undefined') return 'all'
    const params = new URLSearchParams(window.location.search)
    const s = params.get('status')
    const c = params.get('cancellation')
    if (c === 'requested') return 'cancellation_requested'
    if (s && ['pending', 'confirmed', 'completed', 'cancelled'].includes(s)) return s
    return 'all'
  })
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<Record<string, string>>({})
  const [searchUser, setSearchUser] = useState('')
  const [filterMonth, setFilterMonth] = useState('')
  const [filterYear, setFilterYear] = useState('')
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set())

  // Apply all filters
  let filtered = filter === 'all'
    ? initialBookings
    : filter === 'cancellation_requested'
    ? initialBookings.filter(b => b.cancellation_status === 'requested')
    : initialBookings.filter(b => b.status === filter)

  // Username/name search
  if (searchUser.trim()) {
    const q = searchUser.toLowerCase()
    filtered = filtered.filter(b => {
      const usr = b.user as Profile | null
      return usr?.username?.toLowerCase().includes(q) || usr?.full_name?.toLowerCase().includes(q) || usr?.email?.toLowerCase().includes(q)
    })
  }

  // Month filter
  if (filterMonth) {
    filtered = filtered.filter(b => {
      if (!b.travel_date) return false
      const d = new Date(b.travel_date)
      return d.getMonth() === parseInt(filterMonth)
    })
  }

  // Year filter
  if (filterYear) {
    filtered = filtered.filter(b => {
      if (!b.travel_date) return false
      const d = new Date(b.travel_date)
      return d.getFullYear() === parseInt(filterYear)
    })
  }

  function handleProcessCancellation(bookingId: string, approve: boolean, refundPaise?: number, note?: string, tierPercent?: number) {
    startTransition(async () => {
      const res = await processCancellation(bookingId, approve, refundPaise, note, tierPercent)
      if (res.error) showFeedback(bookingId, `Error: ${res.error}`)
      else showFeedback(bookingId, approve ? 'Cancellation approved — user notified. Now initiate refund.' : 'Cancellation denied & user notified')
    })
  }

  function handleInitiateRefund(bookingId: string) {
    startTransition(async () => {
      const res = await initiateRefund(bookingId)
      if (res.error) showFeedback(bookingId, `Error: ${res.error}`)
      else showFeedback(bookingId, `Refund initiated via Razorpay! ID: ${res.refundId}`)
    })
  }

  function handleMarkRefundComplete(bookingId: string) {
    startTransition(async () => {
      const res = await markRefundComplete(bookingId)
      if (res.error) showFeedback(bookingId, `Error: ${res.error}`)
      else showFeedback(bookingId, 'Refund marked complete — customer notified!')
    })
  }

  function showFeedback(id: string, msg: string) {
    setFeedback(f => ({ ...f, [id]: msg }))
    setTimeout(() => setFeedback(f => { const next = { ...f }; delete next[id]; return next }), 3000)
  }

  function handleStatusChange(bookingId: string, status: string) {
    startTransition(async () => {
      const res = await updateBookingStatus(bookingId, status)
      if (res.error) showFeedback(bookingId, `Error: ${res.error}`)
      else showFeedback(bookingId, `Status updated to ${status}. Reload to see changes.`)
    })
  }

  function handleSendConfirmation(bookingId: string) {
    const el = document.getElementById(`msg-${bookingId}`) as HTMLTextAreaElement | null
    const message = el?.value?.trim() || undefined
    startTransition(async () => {
      const res = await sendBookingConfirmationEmail(bookingId, message)
      if (res.error) showFeedback(bookingId, `Error: ${res.error}`)
      else {
        showFeedback(bookingId, message ? 'Email sent with your message!' : 'Confirmation email sent!')
        if (el) el.value = ''
      }
    })
  }

  function handleSharePOC(bookingId: string) {
    startTransition(async () => {
      const res = await sharePOCWithCustomer(bookingId)
      if (res.error) showFeedback(bookingId, `Error: ${res.error}`)
      else showFeedback(bookingId, 'POC details shared with customer!')
    })
  }

  function handleDeleteBooking(bookingId: string) {
    if (!confirm('Permanently delete this booking? This cannot be undone.')) return
    startTransition(async () => {
      const res = await adminDeleteBooking(bookingId)
      if (res.error) showFeedback(bookingId, `Error: ${res.error}`)
      else setDeletedIds(prev => new Set([...prev, bookingId]))
    })
  }

  function handleSendMessage(bookingId: string, message: string) {
    if (!message.trim()) return
    startTransition(async () => {
      const res = await sendBookingMessage(bookingId, message)
      if (res.error) showFeedback(bookingId, `Error: ${res.error}`)
      else {
        showFeedback(bookingId, 'Message sent to customer!')
        const el = document.getElementById(`msg-${bookingId}`) as HTMLTextAreaElement | null
        if (el) el.value = ''
      }
    })
  }

  function handleRecordPayment(bookingId: string) {
    const el = document.getElementById(`pay-${bookingId}`) as HTMLInputElement | null
    const rupees = parseFloat(el?.value || '')
    if (!rupees || rupees <= 0) { showFeedback(bookingId, 'Error: Enter a valid amount'); return }
    startTransition(async () => {
      const res = await recordManualPayment(bookingId, Math.round(rupees * 100))
      if (res.error) showFeedback(bookingId, `Error: ${res.error}`)
      else showFeedback(
        bookingId,
        res.fullyPaid
          ? 'Payment recorded — booking now fully paid! Reload to see changes.'
          : `₹${((res.appliedPaise || 0) / 100).toLocaleString('en-IN')} recorded · balance ₹${((res.balanceDuePaise || 0) / 100).toLocaleString('en-IN')}. Reload to see changes.`,
      )
    })
  }

  function handleSetCoupon(bookingId: string, code: string | null) {
    startTransition(async () => {
      const res = await adminSetBookingCoupon(bookingId, code)
      if (res.error) { showFeedback(bookingId, `Error: ${res.error}`); return }
      const tail = res.overpaidPaise && res.overpaidPaise > 0
        ? ` · overpaid ₹${(res.overpaidPaise / 100).toLocaleString('en-IN')} (refund due)`
        : res.balanceDuePaise && res.balanceDuePaise > 0
          ? ` · balance ₹${(res.balanceDuePaise / 100).toLocaleString('en-IN')}`
          : ' · fully paid'
      showFeedback(
        bookingId,
        `${code ? `Applied ${res.label || code}` : 'Offer removed'} · new total ₹${((res.totalPaise || 0) / 100).toLocaleString('en-IN')}${tail}. Reload to see changes.`,
      )
    })
  }

  function handleApplyCouponInput(bookingId: string) {
    const el = document.getElementById(`coupon-${bookingId}`) as HTMLInputElement | null
    const code = (el?.value || '').trim()
    if (!code) { showFeedback(bookingId, 'Error: enter a promo code'); return }
    handleSetCoupon(bookingId, code)
  }

  function handleRefundOverpayment(bookingId: string) {
    startTransition(async () => {
      const res = await refundBookingOverpayment(bookingId)
      if (res.error) showFeedback(bookingId, `Error: ${res.error}`)
      else showFeedback(
        bookingId,
        `Refund of ₹${((res.refundedPaise || 0) / 100).toLocaleString('en-IN')} ${res.manual ? 'recorded — process it offline to the customer' : 'initiated to the original payment method'}. Reload to see changes.`,
      )
    })
  }

  function handleUpdateTier(bookingId: string) {
    const el = document.getElementById(`tier-${bookingId}`) as HTMLSelectElement | null
    const idx = parseInt(el?.value ?? '', 10)
    if (Number.isNaN(idx) || idx < 0) { showFeedback(bookingId, 'Error: pick a price tier'); return }
    startTransition(async () => {
      const res = await adminUpdateBookingPriceTier(bookingId, idx)
      if (res.error) showFeedback(bookingId, `Error: ${res.error}`)
      else showFeedback(
        bookingId,
        `Updated to “${res.label}” · new total ₹${((res.newTotalPaise || 0) / 100).toLocaleString('en-IN')}`
        + (res.overpaidPaise && res.overpaidPaise > 0
            ? ` · overpaid ₹${(res.overpaidPaise / 100).toLocaleString('en-IN')} (refund due)`
            : res.balanceDuePaise && res.balanceDuePaise > 0
              ? ` · balance ₹${(res.balanceDuePaise / 100).toLocaleString('en-IN')}`
              : ' · fully paid')
        + '. Reload to see changes.',
      )
    })
  }

  function handleSaveNotes(bookingId: string, notes: string) {
    startTransition(async () => {
      const res = await updateBookingNotes(bookingId, notes)
      if (res.error) showFeedback(bookingId, `Error: ${res.error}`)
      else showFeedback(bookingId, 'Notes saved!')
    })
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        {['all', 'pending', 'confirmed', 'cancellation_requested', 'cancelled', 'completed'].map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              filter === s
                ? 'bg-primary text-black border-primary'
                : 'bg-card text-muted-foreground border-border hover:border-primary/35'
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
            {s !== 'all' && (
              <span className="ml-1 opacity-70">
                ({s === 'cancellation_requested'
                  ? initialBookings.filter(b => b.cancellation_status === 'requested').length
                  : initialBookings.filter(b => b.status === s).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Advanced filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="text"
          placeholder="Search user/email..."
          value={searchUser}
          onChange={e => setSearchUser(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-xs bg-card border border-border focus:outline-none focus:border-primary w-44"
        />
        <select
          value={filterMonth}
          onChange={e => setFilterMonth(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-xs bg-card border border-border focus:outline-none focus:border-primary"
        >
          <option value="">All Months</option>
          {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
            <option key={i} value={i}>{m}</option>
          ))}
        </select>
        <select
          value={filterYear}
          onChange={e => setFilterYear(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-xs bg-card border border-border focus:outline-none focus:border-primary"
        >
          <option value="">All Years</option>
          {[2025, 2026, 2027, 2028].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        {(searchUser || filterMonth || filterYear) && (
          <button
            onClick={() => { setSearchUser(''); setFilterMonth(''); setFilterYear('') }}
            className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300"
          >
            Clear filters
          </button>
        )}
        <span className="text-xs text-muted-foreground self-center ml-auto">{filtered.length} results</span>
      </div>

      {/* Bookings list */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <p className="text-muted-foreground text-center py-12">No bookings found.</p>
        )}

        {filtered.filter(b => !deletedIds.has(b.id)).map((booking) => {
          const pkg = booking.package as (PackageDurationDisplay & { title?: string; destination?: { name?: string; state?: string } }) | null
          const sl = booking.service_listing as { id: string; title: string; type: string } | null
          const slItem = (booking as { service_listing_item?: { name?: string } | null }).service_listing_item
          const slQty = booking.quantity ?? booking.guests ?? 1
          const slUnit = sl?.type === 'stays' ? 'room' : sl?.type === 'activities' ? 'guest' : 'unit'
          const displayTitle = sl?.title || pkg?.title || 'Unknown'
          const usr = booking.user as Profile | null
          const poc = booking.poc as Profile | null
          const isExpanded = expandedId === booking.id
          const isDeletable = booking.status === 'cancelled' || booking.status === 'pending'

          return (
            <div key={booking.id} className="rounded-xl border border-border bg-card/50 overflow-hidden">
              {/* Header row */}
              <div
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 cursor-pointer hover:bg-secondary/30 transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : booking.id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Badge className={`${STATUS_COLORS[booking.status] || ''} border text-xs shrink-0`}>
                    {booking.status}
                  </Badge>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold truncate">{displayTitle}</p>
                      {sl && (
                        <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/20 capitalize">
                          {sl.type}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {usr?.full_name || usr?.username || 'Unknown'} · {sl
                        ? `${slQty} ${slUnit}${slQty > 1 ? 's' : ''}${slItem?.name ? ` · ${slItem.name}` : ''}`
                        : `${booking.guests} guest${booking.guests > 1 ? 's' : ''}`} · {booking.travel_date ? formatDate(booking.travel_date) : '—'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-primary font-bold">{formatPrice(booking.total_amount_paise)}</span>
                  <span className="text-xs text-muted-foreground">{booking.confirmation_code || '—'}</span>
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="border-t border-border p-4 space-y-4">
                  {/* Feedback */}
                  {feedback[booking.id] && (
                    <p className={`text-sm px-3 py-2 rounded-lg border ${feedback[booking.id].startsWith('Error') ? 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700' : 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700'}`}>
                      {feedback[booking.id]}
                    </p>
                  )}

                  {/* Details grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                    <div><span className="text-muted-foreground">Customer:</span> <span className="font-medium">{usr?.full_name || 'N/A'}</span> <span className="text-muted-foreground">(@{usr?.username})</span></div>
                    {usr?.phone_number && (
                      <div className="flex items-center gap-1"><Phone className="h-3 w-3 text-muted-foreground" /><span className="text-muted-foreground">Phone:</span> <span className="font-medium">{usr.phone_number}</span></div>
                    )}
                    {usr?.email && (
                      <div className="flex items-center gap-1"><AtSign className="h-3 w-3 text-muted-foreground" /><span className="text-muted-foreground">Email:</span> <span className="font-medium">{usr.email}</span></div>
                    )}
                    <div><span className="text-muted-foreground">Destination:</span> {pkg?.destination ? `${pkg.destination.name}, ${pkg.destination.state}` : 'N/A'}</div>
                    <div><span className="text-muted-foreground">Duration:</span> {pkg ? packageDurationShortLabel(pkg) : 'N/A'}</div>
                    <div><span className="text-muted-foreground">Booked on:</span> {formatDate(booking.created_at)}</div>
                    <div><span className="text-muted-foreground">Payment ID:</span> <span className="text-xs text-muted-foreground font-mono">{booking.stripe_payment_intent || '—'}</span></div>
                    <div><span className="text-muted-foreground">POC:</span> {poc ? `${poc.full_name} (@${poc.username})` : booking.poc_external_name ? `${booking.poc_external_name} · ${booking.poc_external_phone || ''} (outsider)` : <span className="text-yellow-500">Not assigned</span>}</div>
                  </div>

                  {/* Travellers */}
                  {Array.isArray(booking.traveller_details) && booking.traveller_details.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">Travellers</p>
                      <div className="flex flex-wrap gap-1.5">
                        {booking.traveller_details.map((t, i) => (
                          <span key={i} className="text-xs px-2 py-1 rounded-lg bg-secondary border border-border">
                            <span className="font-medium">{t.name}</span>
                            {(t.age || t.gender) && (
                              <span className="text-muted-foreground"> · {[t.age || null, t.gender || null].filter(Boolean).join(' · ')}</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Payment — cash collected vs balance; record offline payments here */}
                  {(() => {
                    const total = booking.total_amount_paise || 0
                    const collected = (booking as { deposit_paise?: number | null }).deposit_paise || 0
                    const balance = Math.max(0, total - collected)
                    const overpaid = Math.max(0, collected - total)
                    const isCancelled = booking.status === 'cancelled'
                    return (
                      <div className="p-3 rounded-lg border border-border bg-secondary/30 space-y-2">
                        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                          <span><span className="text-muted-foreground">Trip total:</span> <span className="font-medium">{formatPrice(total)}</span></span>
                          <span><span className="text-muted-foreground">Collected:</span> <span className="font-medium text-green-500">{formatPrice(collected)}</span></span>
                          <span><span className="text-muted-foreground">Balance:</span> <span className={`font-medium ${balance > 0 ? 'text-amber-500' : 'text-green-500'}`}>{formatPrice(balance)}</span></span>
                          {overpaid > 0 && (
                            <span><span className="text-muted-foreground">Overpaid:</span> <span className="font-medium text-amber-500">{formatPrice(overpaid)}</span></span>
                          )}
                        </div>
                        {!isCancelled && overpaid > 0 && (
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs gap-1 border-amber-500/40 text-amber-500 hover:bg-amber-500/10"
                              onClick={() => handleRefundOverpayment(booking.id)}
                              disabled={isPending}
                            >
                              <IndianRupee className="h-3 w-3" /> Refund overpayment ({formatPrice(overpaid)})
                            </Button>
                            <p className="text-[10px] text-muted-foreground w-full">
                              The customer has paid more than the current total (e.g. after a price-tier change). Refunds {formatPrice(overpaid)} to their original payment method and reduces collected to match — the booking stays active.
                            </p>
                          </div>
                        )}
                        {!isCancelled && balance > 0 && (
                          <div className="flex flex-wrap items-end gap-2">
                            <div>
                              <label className="text-[11px] text-muted-foreground block mb-0.5">Record offline payment (₹)</label>
                              <input
                                type="number"
                                min="1"
                                defaultValue={Math.round(balance / 100)}
                                id={`pay-${booking.id}`}
                                className="bg-secondary border border-border rounded-lg px-3 py-1.5 text-sm w-36"
                              />
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs gap-1 border-border"
                              onClick={() => handleRecordPayment(booking.id)}
                              disabled={isPending}
                            >
                              <IndianRupee className="h-3 w-3" /> Record payment
                            </Button>
                            <p className="text-[10px] text-muted-foreground w-full">
                              Cash / bank transfer collected outside the app. Adds to earnings; marks the booking fully paid when the balance reaches zero (sends the paid-in-full receipt).
                            </p>
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {/* Price tier — admin can re-tier the booking; net payable recomputes, offer kept */}
                  {(() => {
                    const src = booking.package_id
                      ? (booking.package as { price_variants?: unknown } | null)
                      : (booking.service_listing as { price_variants?: unknown } | null)
                    const variants = Array.isArray(src?.price_variants)
                      ? (src!.price_variants as Array<{ description?: string; price_paise?: number }>).filter((v) => v && typeof v.description === 'string')
                      : []
                    if (variants.length < 2 || booking.status === 'cancelled') return null
                    const currentLabel = (booking as { price_variant_label?: string | null }).price_variant_label || null
                    const currentIdx = Math.max(0, variants.findIndex((v) => v.description === currentLabel))
                    return (
                      <div className="p-3 rounded-lg border border-border bg-secondary/30 space-y-2">
                        <div className="text-sm">
                          <span className="text-muted-foreground">Price tier:</span>{' '}
                          <span className="font-medium">{currentLabel || '—'}</span>
                        </div>
                        <div className="flex flex-wrap items-end gap-2">
                          <select
                            id={`tier-${booking.id}`}
                            defaultValue={String(currentIdx)}
                            className="bg-secondary border border-border rounded-lg px-3 py-1.5 text-sm"
                          >
                            {variants.map((v, i) => (
                              <option key={i} value={i}>
                                {v.description} — {formatPrice(v.price_paise || 0)}
                              </option>
                            ))}
                          </select>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs border-border"
                            onClick={() => handleUpdateTier(booking.id)}
                            disabled={isPending}
                          >
                            Update tier
                          </Button>
                          <p className="text-[10px] text-muted-foreground w-full">
                            Recomputes the net payable (gross rescaled by the new tier). The customer’s offer/discount is kept; deposit is unchanged, so the balance — or any overpayment — updates accordingly.
                          </p>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Offer / coupon — applied at checkout; admin can change or remove it */}
                  {(() => {
                    const offer = (booking as { promo_offer?: {
                      name?: string | null; promo_code?: string | null; discount_kind?: 'fixed' | 'percent' | 'free_guests' | null
                      discount_paise?: number | null; discount_percent?: number | null; discount_percent_cap_paise?: number | null
                      free_guest_count?: number | null; free_guests_min_group?: number | null
                    } | null }).promo_offer || null
                    const discount = (booking as { discount_paise?: number | null }).discount_paise || 0
                    const isCancelled = booking.status === 'cancelled'
                    const hover = offer
                      ? `${offer.promo_code ? offer.promo_code.toUpperCase() + ' · ' : ''}${formatDiscountLabel(offer)}${offer.name ? ` · ${offer.name}` : ''}`
                      : undefined
                    return (
                      <div className="p-3 rounded-lg border border-border bg-secondary/30 space-y-2">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                          <span className="text-muted-foreground">Offer applied:</span>
                          {offer ? (
                            <span className="font-medium cursor-help underline decoration-dotted underline-offset-2" title={hover}>
                              {offer.name || offer.promo_code?.toUpperCase() || 'Offer'}{' '}
                              <span className="text-muted-foreground">({formatDiscountLabel(offer)})</span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">None</span>
                          )}
                          {discount > 0 && (
                            <span className="text-green-500 text-xs">− {formatPrice(discount)} off</span>
                          )}
                        </div>
                        {!isCancelled && (
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              id={`coupon-${booking.id}`}
                              defaultValue={offer?.promo_code?.toUpperCase() || ''}
                              placeholder="Promo code"
                              className="bg-secondary border border-border rounded-lg px-3 py-1.5 text-sm w-40 uppercase"
                            />
                            <Button size="sm" variant="outline" className="text-xs border-border" onClick={() => handleApplyCouponInput(booking.id)} disabled={isPending}>
                              Apply offer
                            </Button>
                            {offer && (
                              <Button size="sm" variant="outline" className="text-xs border-border text-muted-foreground" onClick={() => handleSetCoupon(booking.id, null)} disabled={isPending}>
                                Remove
                              </Button>
                            )}
                            <p className="text-[10px] text-muted-foreground w-full">
                              Re-derives the discount against the current price (free-guests / percent coupons resize accordingly) and recomputes the balance. Any non-coupon discount (e.g. referral) is preserved.
                            </p>
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                    {/* Change status */}
                    <select
                      className="bg-secondary border border-border rounded-lg px-3 py-1.5 text-xs"
                      defaultValue=""
                      onChange={(e) => { if (e.target.value) handleStatusChange(booking.id, e.target.value) }}
                      disabled={isPending}
                    >
                      <option value="" disabled>Change status...</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>

                    {/* Assign POC — registered member or outsider */}
                    <PocAssigner bookingId={booking.id} />

                    {/* Send confirmation / status email (includes the message box if filled) */}
                    {(booking.status === 'confirmed' || booking.status === 'completed' || booking.status === 'cancelled') && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs gap-1 border-border"
                        onClick={() => handleSendConfirmation(booking.id)}
                        disabled={isPending}
                      >
                        <Mail className="h-3 w-3" />
                        {booking.status === 'completed' ? 'Email completion' : booking.status === 'cancelled' ? 'Email cancellation' : 'Send Confirmation'}
                      </Button>
                    )}

                    {/* Share POC with customer */}
                    {poc && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs gap-1 border-border"
                        onClick={() => handleSharePOC(booking.id)}
                        disabled={isPending}
                      >
                        <Send className="h-3 w-3" /> Share POC
                        {booking.poc_shared_at && <span className="text-green-400 ml-1">✓</span>}
                      </Button>
                    )}
                  </div>

                  {/* Partial (per-traveller) cancellations — review requests, or cancel some travellers directly */}
                  {!sl && (
                    <div className="pt-2 border-t border-border">
                      <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> Per-traveller cancellation
                      </p>
                      <PartialCancelManager
                        booking={booking as unknown as { id: string; status: string; guests: number; total_amount_paise: number; deposit_paise?: number | null; traveller_details?: { name?: string; age?: number | string | null; gender?: string | null }[] | null }}
                        existing={partialCancellationsByBooking[booking.id] || []}
                      />
                    </div>
                  )}

                  {/* Change requests (traveller edits / tier change) — approve or deny */}
                  {(changeRequestsByBooking[booking.id]?.length || 0) > 0 && (() => {
                    const src = booking.package_id
                      ? (booking.package as { price_variants?: unknown } | null)
                      : (booking.service_listing as { price_variants?: unknown } | null)
                    const variantLabels = Array.isArray(src?.price_variants)
                      ? (src!.price_variants as Array<{ description?: string }>).map((v) => String(v?.description ?? ''))
                      : []
                    return (
                      <div className="pt-2 border-t border-border">
                        <BookingChangeRequestManager existing={changeRequestsByBooking[booking.id] || []} variantLabels={variantLabels} />
                      </div>
                    )
                  })()}

                  {/* Cancellation Review */}
                  {booking.cancellation_status === 'requested' && (
                    <CancellationReviewPanel
                      bookingId={booking.id}
                      totalAmountPaise={booking.total_amount_paise}
                      cancellationReason={booking.cancellation_reason}
                      disabled={isPending}
                      onApprove={(refundPaise, tierPercent, note) =>
                        handleProcessCancellation(booking.id, true, refundPaise, note, tierPercent)
                      }
                      onDeny={(note) => handleProcessCancellation(booking.id, false, undefined, note)}
                    />
                  )}

                  {/* Refund Tracking — admin-approved or traveler self-service */}
                  {(booking.cancellation_status === 'approved' ||
                    booking.cancellation_status === 'self_service') &&
                    booking.refund_amount_paise &&
                    booking.refund_amount_paise > 0 && (
                    <div className="p-3 rounded-lg border border-border bg-secondary/30 space-y-2">
                      {booking.cancellation_status === 'self_service' && (
                        <p className="text-[11px] text-muted-foreground">
                          Self-service cancellation — refund may already be initiated via Razorpay. Use the button below only if status is still pending.
                        </p>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold">Refund: {formatPrice(booking.refund_amount_paise)}</span>
                        <Badge className={
                          booking.refund_status === 'completed' ? 'bg-green-900/50 text-green-300 border-green-700' :
                          booking.refund_status === 'processing' ? 'bg-blue-900/50 text-blue-300 border-blue-700' :
                          'bg-yellow-900/50 text-yellow-300 border-yellow-700'
                        }>
                          {booking.refund_status === 'completed' ? '✅ Refunded' :
                           booking.refund_status === 'processing' ? '⏳ Processing' :
                           '⏸ Pending'}
                        </Badge>
                      </div>
                      {(booking as { refund_email_sent_at?: string | null }).refund_email_sent_at && (
                        <p className="text-[11px] text-green-500">✉️ Refund receipt emailed to customer</p>
                      )}

                      {(!booking.refund_status || booking.refund_status === 'pending') && (
                        <Button
                          size="sm"
                          className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
                          onClick={() => handleInitiateRefund(booking.id)}
                          disabled={isPending}
                        >
                          💳 Initiate Razorpay Refund
                        </Button>
                      )}

                      {booking.refund_status === 'processing' && (
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`refund-done-${booking.id}`}
                            className="rounded border-border"
                            onChange={(e) => {
                              if (e.target.checked) {
                                handleMarkRefundComplete(booking.id)
                              }
                            }}
                            disabled={isPending}
                          />
                          <label htmlFor={`refund-done-${booking.id}`} className="text-xs text-muted-foreground cursor-pointer">
                            Mark refund as credited to customer
                          </label>
                          {booking.refund_razorpay_id && (
                            <span className="text-[10px] text-muted-foreground font-mono ml-auto">{booking.refund_razorpay_id}</span>
                          )}
                        </div>
                      )}

                      {booking.refund_status === 'completed' && (
                        <p className="text-xs text-green-400">Refund credited to customer&apos;s account</p>
                      )}
                    </div>
                  )}

                  {/* Delete booking */}
                  {isDeletable && (
                    <div className="pt-2 border-t border-border">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs gap-1 border-red-800 text-red-400 hover:bg-red-950 hover:text-red-300"
                        onClick={() => handleDeleteBooking(booking.id)}
                        disabled={isPending}
                      >
                        <Trash2 className="h-3 w-3" /> Delete booking
                      </Button>
                      <p className="text-[10px] text-muted-foreground mt-1">Permanently remove this {booking.status} booking record.</p>
                    </div>
                  )}

                  {/* Admin notes */}
                  <div className="pt-2">
                    <label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                      <StickyNote className="h-3 w-3" /> Admin Notes
                    </label>
                    <div className="flex gap-2">
                      <textarea
                        defaultValue={booking.admin_notes || ''}
                        className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2 text-sm resize-none"
                        rows={2}
                        placeholder="Internal notes about this booking..."
                        id={`notes-${booking.id}`}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0 border-border self-end"
                        onClick={() => {
                          const el = document.getElementById(`notes-${booking.id}`) as HTMLTextAreaElement
                          if (el) handleSaveNotes(booking.id, el.value)
                        }}
                        disabled={isPending}
                      >
                        Save
                      </Button>
                    </div>
                  </div>

                  {/* Message the customer — a short update emailed to them (not a full receipt) */}
                  <div className="pt-2">
                    <label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                      <Mail className="h-3 w-3" /> Message customer
                    </label>
                    <p className="text-[11px] text-muted-foreground mb-1">
                      <strong>Send</strong> emails just this message · use the <strong>Send Confirmation</strong> button above to include it with the full receipt.
                    </p>
                    <div className="flex gap-2">
                      <textarea
                        className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2 text-sm resize-none"
                        rows={2}
                        placeholder="Send a short update to the traveller by email…"
                        id={`msg-${booking.id}`}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0 border-border self-end gap-1"
                        onClick={() => {
                          const el = document.getElementById(`msg-${booking.id}`) as HTMLTextAreaElement
                          if (el) handleSendMessage(booking.id, el.value)
                        }}
                        disabled={isPending}
                      >
                        <Send className="h-3 w-3" /> Send
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PocAssigner({ bookingId }: { bookingId: string }) {
  const [mode, setMode] = useState<'member' | 'outsider'>('member')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ id: string; username: string | null; full_name: string | null }[]>([])
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [msg, setMsg] = useState('')
  const [isError, setIsError] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Live search as the admin types (debounced).
  useEffect(() => {
    if (mode !== 'member' || query.trim().length < 2) { setResults([]); return }
    let cancelled = false
    const t = setTimeout(async () => {
      const res = await searchMembersForPOC(query)
      if (!cancelled) setResults(res.members || [])
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query, mode])

  function pickMember(m: { id: string; username: string | null; full_name: string | null }) {
    startTransition(async () => {
      const res = await assignMemberPOC(bookingId, m.id)
      if (res.error) { setIsError(true); setMsg(`Error: ${res.error}`) }
      else { setIsError(false); setMsg(`POC set to ${res.name}. Reload to see changes.`); setQuery(''); setResults([]) }
    })
  }

  function assignOutsider() {
    startTransition(async () => {
      const res = await assignExternalPOC(bookingId, name, phone)
      if (res.error) { setIsError(true); setMsg(`Error: ${res.error}`) }
      else { setIsError(false); setMsg(`POC set to ${res.name}. Reload to see changes.`); setName(''); setPhone('') }
    })
  }

  const inputCls = 'bg-secondary border border-border rounded-lg px-2 py-1.5 text-xs'

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <select value={mode} onChange={e => setMode(e.target.value as 'member' | 'outsider')} className={inputCls}>
          <option value="member">Registered member</option>
          <option value="outsider">Outsider</option>
        </select>
        {mode === 'member' ? (
          <div className="relative">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Type name or @username"
              className={`${inputCls} w-52`}
            />
            {results.length > 0 && (
              <div className="absolute z-20 mt-1 w-60 max-h-56 overflow-auto rounded-lg border border-border bg-card shadow-lg">
                {results.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    disabled={isPending}
                    onClick={() => pickMember(m)}
                    className="block w-full text-left px-3 py-1.5 text-xs hover:bg-secondary disabled:opacity-50"
                  >
                    {m.full_name || m.username}{m.username ? <span className="text-muted-foreground"> @{m.username}</span> : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="POC name" className={`${inputCls} w-32`} />
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone" className={`${inputCls} w-32`} />
            <Button size="sm" variant="outline" className="text-xs gap-1 border-border" onClick={assignOutsider} disabled={isPending}>
              <UserPlus className="h-3 w-3" /> Assign
            </Button>
          </>
        )}
        {msg && <span className={`text-xs ${isError ? 'text-red-400' : 'text-muted-foreground'}`}>{msg}</span>}
      </div>
    </div>
  )
}
