'use client'

import { useState, useTransition } from 'react'
import { formatPrice, formatDate, ROLE_LABELS, type Booking, type Profile } from '@/types'
import { assignPOC, updateBookingStatus, sharePOCWithCustomer, sendBookingConfirmationEmail, updateBookingNotes } from '@/actions/admin'
import { processCancellation, initiateRefund, markRefundComplete } from '@/actions/booking'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Mail, Send, UserPlus, ChevronDown, ChevronUp, StickyNote, AlertTriangle, Phone, AtSign } from 'lucide-react'

interface Props {
  bookings: Booking[]
  staffMembers: Pick<Profile, 'id' | 'username' | 'full_name' | 'role'>[]
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-900/50 text-yellow-300 border-yellow-700',
  confirmed: 'bg-green-900/50 text-green-300 border-green-700',
  cancelled: 'bg-red-900/50 text-red-300 border-red-700',
  completed: 'bg-blue-900/50 text-blue-300 border-blue-700',
}

export function AdminBookingsClient({ bookings: initialBookings, staffMembers }: Props) {
  const [filter, setFilter] = useState('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<Record<string, string>>({})
  const [searchUser, setSearchUser] = useState('')
  const [filterMonth, setFilterMonth] = useState('')
  const [filterYear, setFilterYear] = useState('')

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
      const d = new Date(b.travel_date)
      return d.getMonth() === parseInt(filterMonth)
    })
  }

  // Year filter
  if (filterYear) {
    filtered = filtered.filter(b => {
      const d = new Date(b.travel_date)
      return d.getFullYear() === parseInt(filterYear)
    })
  }

  function handleProcessCancellation(bookingId: string, approve: boolean, refundPaise?: number, note?: string) {
    startTransition(async () => {
      const res = await processCancellation(bookingId, approve, refundPaise, note)
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

  function handleAssignPOC(bookingId: string, pocId: string) {
    startTransition(async () => {
      const res = await assignPOC(bookingId, pocId)
      if (res.error) showFeedback(bookingId, `Error: ${res.error}`)
      else showFeedback(bookingId, 'POC assigned! Reload to see changes.')
    })
  }

  function handleStatusChange(bookingId: string, status: string) {
    startTransition(async () => {
      const res = await updateBookingStatus(bookingId, status)
      if (res.error) showFeedback(bookingId, `Error: ${res.error}`)
      else showFeedback(bookingId, `Status updated to ${status}. Reload to see changes.`)
    })
  }

  function handleSendConfirmation(bookingId: string) {
    startTransition(async () => {
      const res = await sendBookingConfirmationEmail(bookingId)
      if (res.error) showFeedback(bookingId, `Error: ${res.error}`)
      else showFeedback(bookingId, 'Confirmation email sent!')
    })
  }

  function handleSharePOC(bookingId: string) {
    startTransition(async () => {
      const res = await sharePOCWithCustomer(bookingId)
      if (res.error) showFeedback(bookingId, `Error: ${res.error}`)
      else showFeedback(bookingId, 'POC details shared with customer!')
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
                : 'bg-card text-muted-foreground border-zinc-700 hover:border-zinc-500'
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

        {filtered.map((booking) => {
          const pkg = booking.package as { title?: string; duration_days?: number; destination?: { name?: string; state?: string } } | null
          const usr = booking.user as Profile | null
          const poc = booking.poc as Profile | null
          const isExpanded = expandedId === booking.id

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
                    <p className="font-semibold truncate">{pkg?.title || 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground">
                      {usr?.full_name || usr?.username || 'Unknown'} · {booking.guests} guest{booking.guests > 1 ? 's' : ''} · {formatDate(booking.travel_date)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-primary font-bold">{formatPrice(booking.total_amount_paise)}</span>
                  <span className="text-xs text-zinc-600">{booking.confirmation_code || '—'}</span>
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
                    <div><span className="text-muted-foreground">Customer:</span> <span className="font-medium">{usr?.full_name || 'N/A'}</span> <span className="text-zinc-600">(@{usr?.username})</span></div>
                    {usr?.phone_number && (
                      <div className="flex items-center gap-1"><Phone className="h-3 w-3 text-muted-foreground" /><span className="text-muted-foreground">Phone:</span> <span className="font-medium">{usr.phone_number}</span></div>
                    )}
                    {usr?.email && (
                      <div className="flex items-center gap-1"><AtSign className="h-3 w-3 text-muted-foreground" /><span className="text-muted-foreground">Email:</span> <span className="font-medium">{usr.email}</span></div>
                    )}
                    <div><span className="text-muted-foreground">Destination:</span> {pkg?.destination ? `${pkg.destination.name}, ${pkg.destination.state}` : 'N/A'}</div>
                    <div><span className="text-muted-foreground">Duration:</span> {pkg?.duration_days} days</div>
                    <div><span className="text-muted-foreground">Booked on:</span> {formatDate(booking.created_at)}</div>
                    <div><span className="text-muted-foreground">Payment ID:</span> <span className="text-xs text-zinc-600 font-mono">{booking.stripe_payment_intent || '—'}</span></div>
                    <div><span className="text-muted-foreground">POC:</span> {poc ? `${poc.full_name} (@${poc.username})` : <span className="text-yellow-500">Not assigned</span>}</div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                    {/* Change status */}
                    <select
                      className="bg-secondary border border-zinc-700 rounded-lg px-3 py-1.5 text-xs"
                      defaultValue=""
                      onChange={(e) => { if (e.target.value) handleStatusChange(booking.id, e.target.value) }}
                      disabled={isPending}
                    >
                      <option value="" disabled>Change status...</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>

                    {/* Assign POC */}
                    <select
                      className="bg-secondary border border-zinc-700 rounded-lg px-3 py-1.5 text-xs"
                      defaultValue=""
                      onChange={(e) => { if (e.target.value) handleAssignPOC(booking.id, e.target.value) }}
                      disabled={isPending}
                    >
                      <option value="" disabled>Assign POC...</option>
                      {staffMembers.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.full_name || s.username} ({ROLE_LABELS[s.role as keyof typeof ROLE_LABELS] || s.role})
                        </option>
                      ))}
                    </select>

                    {/* Send confirmation email */}
                    {booking.status === 'confirmed' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs gap-1 border-zinc-700"
                        onClick={() => handleSendConfirmation(booking.id)}
                        disabled={isPending}
                      >
                        <Mail className="h-3 w-3" /> Send Confirmation
                      </Button>
                    )}

                    {/* Share POC with customer */}
                    {poc && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs gap-1 border-zinc-700"
                        onClick={() => handleSharePOC(booking.id)}
                        disabled={isPending}
                      >
                        <Send className="h-3 w-3" /> Share POC
                        {booking.poc_shared_at && <span className="text-green-400 ml-1">✓</span>}
                      </Button>
                    )}
                  </div>

                  {/* Cancellation Review */}
                  {booking.cancellation_status === 'requested' && (
                    <div className="p-3 rounded-lg border border-orange-500/30 bg-orange-500/5 space-y-3">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-orange-400" />
                        <span className="text-sm font-bold text-orange-400">Cancellation Requested</span>
                      </div>
                      {booking.cancellation_reason && (
                        <p className="text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">Reason:</span> {booking.cancellation_reason}
                        </p>
                      )}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-muted-foreground">Refund amount (₹):</label>
                          <input
                            type="number"
                            id={`refund-${booking.id}`}
                            defaultValue={Math.round(booking.total_amount_paise / 100)}
                            className="bg-secondary border border-zinc-700 rounded px-2 py-1 text-sm w-28"
                            min={0}
                            max={Math.round(booking.total_amount_paise / 100)}
                          />
                          <span className="text-xs text-muted-foreground">Max: ₹{Math.round(booking.total_amount_paise / 100).toLocaleString('en-IN')}</span>
                        </div>
                        <textarea
                          id={`cancel-note-${booking.id}`}
                          className="w-full bg-secondary border border-zinc-700 rounded-lg px-3 py-2 text-sm resize-none"
                          rows={2}
                          placeholder="Note to customer (reason for refund amount, deductions etc.)..."
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white text-xs"
                            onClick={() => {
                              const refundEl = document.getElementById(`refund-${booking.id}`) as HTMLInputElement
                              const noteEl = document.getElementById(`cancel-note-${booking.id}`) as HTMLTextAreaElement
                              const refundPaise = Math.round(parseFloat(refundEl?.value || '0') * 100)
                              handleProcessCancellation(booking.id, true, refundPaise, noteEl?.value)
                            }}
                            disabled={isPending}
                          >
                            Approve & Refund
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-red-500/30 text-red-400 text-xs hover:bg-red-500/10"
                            onClick={() => {
                              const noteEl = document.getElementById(`cancel-note-${booking.id}`) as HTMLTextAreaElement
                              handleProcessCancellation(booking.id, false, undefined, noteEl?.value)
                            }}
                            disabled={isPending}
                          >
                            Deny
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Refund Tracking — for approved cancellations */}
                  {booking.cancellation_status === 'approved' && booking.refund_amount_paise && booking.refund_amount_paise > 0 && (
                    <div className="p-3 rounded-lg border border-border bg-secondary/30 space-y-2">
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
                            className="rounded border-zinc-600"
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
                            <span className="text-[10px] text-zinc-600 font-mono ml-auto">{booking.refund_razorpay_id}</span>
                          )}
                        </div>
                      )}

                      {booking.refund_status === 'completed' && (
                        <p className="text-xs text-green-400">Refund credited to customer&apos;s account</p>
                      )}
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
                        className="flex-1 bg-secondary border border-zinc-700 rounded-lg px-3 py-2 text-sm resize-none"
                        rows={2}
                        placeholder="Internal notes about this booking..."
                        id={`notes-${booking.id}`}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0 border-zinc-700 self-end"
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
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
