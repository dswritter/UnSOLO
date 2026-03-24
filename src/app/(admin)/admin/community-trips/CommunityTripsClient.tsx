'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { moderateCommunityTrip, markHostPayout } from '@/actions/admin'
import { formatPrice, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import { Check, X, Eye, CreditCard, Star, ChevronDown, ChevronUp } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import Link from 'next/link'

interface Props {
  trips: any[]
  pendingPayouts: any[]
}

const MOD_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  approved: 'bg-green-500/20 text-green-400 border-green-500/30',
  rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
}

export default function CommunityTripsClient({ trips: initialTrips, pendingPayouts: initialPayouts }: Props) {
  const [filter, setFilter] = useState('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({})
  const [payoutRef, setPayoutRef] = useState<Record<string, string>>({})

  const filtered = filter === 'all'
    ? initialTrips
    : initialTrips.filter(t => t.moderation_status === filter)

  function handleModerate(tripId: string, approve: boolean) {
    const reason = rejectReason[tripId]
    startTransition(async () => {
      const res = await moderateCommunityTrip(tripId, approve, reason)
      if (res.error) toast.error(res.error)
      else toast.success(approve ? 'Trip approved and published!' : 'Trip rejected')
    })
  }

  function handlePayout(earningId: string) {
    const ref = payoutRef[earningId]
    if (!ref?.trim()) { toast.error('Enter payout reference'); return }
    startTransition(async () => {
      const res = await markHostPayout(earningId, ref)
      if (res.error) toast.error(res.error)
      else toast.success('Payout marked as completed!')
    })
  }

  return (
    <div className="space-y-8">
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
                ({initialTrips.filter(t => t.moderation_status === s).length})
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
                      {dest?.name}, {dest?.state} · {trip.duration_days}d · Max {trip.max_group_size}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge className={MOD_COLORS[trip.moderation_status] || ''}>
                    {trip.moderation_status}
                  </Badge>
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
                    <div><span className="text-muted-foreground">Price:</span> {formatPrice(trip.price_paise)}/person</div>
                    <div><span className="text-muted-foreground">Duration:</span> {trip.duration_days} days</div>
                    <div><span className="text-muted-foreground">Max Group:</span> {trip.max_group_size}</div>
                    <div><span className="text-muted-foreground">Difficulty:</span> {trip.difficulty}</div>
                  </div>

                  {trip.description && (
                    <p className="text-xs text-muted-foreground leading-relaxed">{trip.description.slice(0, 300)}{trip.description.length > 300 ? '...' : ''}</p>
                  )}

                  {/* Join preferences */}
                  {trip.join_preferences && Object.keys(trip.join_preferences).length > 0 && (
                    <div className="text-xs">
                      <span className="font-medium">Join Preferences: </span>
                      <span className="text-muted-foreground">
                        {trip.join_preferences.gender_preference && trip.join_preferences.gender_preference !== 'all' && `${trip.join_preferences.gender_preference} only · `}
                        {trip.join_preferences.min_age && `Age ${trip.join_preferences.min_age}-${trip.join_preferences.max_age || '∞'} · `}
                        {trip.join_preferences.min_trips_completed && `Min ${trip.join_preferences.min_trips_completed} trips · `}
                        {trip.join_preferences.interest_tags?.join(', ')}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Link href={`/packages/${trip.slug}`} target="_blank">
                      <Button variant="outline" size="sm" className="text-xs border-border">
                        <Eye className="h-3 w-3 mr-1" /> Preview
                      </Button>
                    </Link>
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
                        placeholder="Rejection reason (optional)..."
                        value={rejectReason[trip.id] || ''}
                        onChange={e => setRejectReason(prev => ({ ...prev, [trip.id]: e.target.value }))}
                        className="w-full text-xs bg-secondary border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:border-primary"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Pending Payouts section */}
      {initialPayouts.length > 0 && (
        <div>
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" /> Pending Host Payouts
          </h2>
          <div className="space-y-2">
            {initialPayouts.map((earning: any) => {
              const host = earning.host as any
              const booking = earning.booking as any
              const pkg = booking?.package as any
              return (
                <div key={earning.id} className="border border-border rounded-lg p-3 bg-card flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{host?.full_name || host?.username}</div>
                    <div className="text-xs text-muted-foreground">
                      {pkg?.title} · {booking?.travel_date ? formatDate(booking.travel_date) : ''} · Host share: {formatPrice(earning.host_paise)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Payout ref..."
                      value={payoutRef[earning.id] || ''}
                      onChange={e => setPayoutRef(prev => ({ ...prev, [earning.id]: e.target.value }))}
                      className="text-xs bg-secondary border border-border rounded px-2 py-1 w-32 focus:outline-none focus:border-primary"
                    />
                    <Button
                      size="sm"
                      onClick={() => handlePayout(earning.id)}
                      disabled={isPending}
                      className="bg-green-600 hover:bg-green-700 text-white text-xs"
                    >
                      Mark Paid
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
