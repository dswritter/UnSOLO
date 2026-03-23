'use client'

import { useState, useTransition } from 'react'
import { formatPrice, formatDate, ROLE_LABELS, type Booking, type Profile } from '@/types'
import { assignPOC, updateBookingStatus, sharePOCWithCustomer, sendBookingConfirmationEmail, updateBookingNotes } from '@/actions/admin'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Mail, Send, UserPlus, ChevronDown, ChevronUp, StickyNote } from 'lucide-react'

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

  const filtered = filter === 'all'
    ? initialBookings
    : initialBookings.filter(b => b.status === filter)

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
        {['all', 'pending', 'confirmed', 'cancelled', 'completed'].map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              filter === s
                ? 'bg-primary text-black border-primary'
                : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-zinc-500'
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
            {s !== 'all' && (
              <span className="ml-1 opacity-70">
                ({initialBookings.filter(b => b.status === s).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Bookings list */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <p className="text-zinc-500 text-center py-12">No bookings found.</p>
        )}

        {filtered.map((booking) => {
          const pkg = booking.package as { title?: string; duration_days?: number; destination?: { name?: string; state?: string } } | null
          const usr = booking.user as Profile | null
          const poc = booking.poc as Profile | null
          const isExpanded = expandedId === booking.id

          return (
            <div key={booking.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
              {/* Header row */}
              <div
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 cursor-pointer hover:bg-zinc-800/30 transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : booking.id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Badge className={`${STATUS_COLORS[booking.status] || ''} border text-xs shrink-0`}>
                    {booking.status}
                  </Badge>
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{pkg?.title || 'Unknown'}</p>
                    <p className="text-xs text-zinc-500">
                      {usr?.full_name || usr?.username || 'Unknown'} · {booking.guests} guest{booking.guests > 1 ? 's' : ''} · {formatDate(booking.travel_date)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-primary font-bold">{formatPrice(booking.total_amount_paise)}</span>
                  <span className="text-xs text-zinc-600">{booking.confirmation_code || '—'}</span>
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-zinc-500" /> : <ChevronDown className="h-4 w-4 text-zinc-500" />}
                </div>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="border-t border-zinc-800 p-4 space-y-4">
                  {/* Feedback */}
                  {feedback[booking.id] && (
                    <p className={`text-sm px-3 py-2 rounded-lg ${feedback[booking.id].startsWith('Error') ? 'bg-red-900/30 text-red-300' : 'bg-green-900/30 text-green-300'}`}>
                      {feedback[booking.id]}
                    </p>
                  )}

                  {/* Details grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                    <div><span className="text-zinc-500">Customer:</span> <span className="font-medium">{usr?.full_name || 'N/A'}</span> <span className="text-zinc-600">(@{usr?.username})</span></div>
                    <div><span className="text-zinc-500">Destination:</span> {pkg?.destination ? `${pkg.destination.name}, ${pkg.destination.state}` : 'N/A'}</div>
                    <div><span className="text-zinc-500">Duration:</span> {pkg?.duration_days} days</div>
                    <div><span className="text-zinc-500">Booked on:</span> {formatDate(booking.created_at)}</div>
                    <div><span className="text-zinc-500">Payment ID:</span> <span className="text-xs text-zinc-600 font-mono">{booking.stripe_payment_intent || '—'}</span></div>
                    <div><span className="text-zinc-500">POC:</span> {poc ? `${poc.full_name} (@${poc.username})` : <span className="text-yellow-500">Not assigned</span>}</div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-zinc-800">
                    {/* Change status */}
                    <select
                      className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs"
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
                      className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs"
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

                  {/* Admin notes */}
                  <div className="pt-2">
                    <label className="text-xs text-zinc-500 flex items-center gap-1 mb-1">
                      <StickyNote className="h-3 w-3" /> Admin Notes
                    </label>
                    <div className="flex gap-2">
                      <textarea
                        defaultValue={booking.admin_notes || ''}
                        className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm resize-none"
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
