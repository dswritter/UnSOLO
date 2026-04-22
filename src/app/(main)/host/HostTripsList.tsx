'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { toggleHostTripActive, toggleHostTripDateClosed, getJoinRequestsForTrip, approveJoinRequest, rejectJoinRequest } from '@/actions/hosting'
import { formatPrice, formatDate } from '@/lib/utils'
import { packageDurationShortLabel, tripDepartureDateKey } from '@/lib/package-trip-calendar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/EmptyState'
import { toast } from 'sonner'
import {
  MapPin,
  Calendar,
  Users,
  IndianRupee,
  TrendingUp,
  Clock,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Check,
  X,
} from 'lucide-react'

interface Trip {
  id: string
  title: string
  slug: string
  is_active: boolean
  moderation_status: string | null
  price_paise: number
  duration_days: number
  trip_days?: number | null
  trip_nights?: number | null
  departure_dates: string[] | null
  departure_dates_closed?: string[] | null
  images: string[] | null
  max_group_size: number
  pending_requests: number
  approved_requests: number
  destination: { name: string; state: string } | null
}

function nextOpenDeparture(dates: string[] | null, closed: string[] | null): string | null {
  const todayStr = new Date().toISOString().split('T')[0]
  const c = new Set((closed || []).map(tripDepartureDateKey))
  const sorted = [...(dates || [])].sort()
  for (const d of sorted) {
    const k = tripDepartureDateKey(d)
    if (k >= todayStr && !c.has(k)) return d
  }
  return null
}

interface Stats {
  totalTrips: number
  activeTrips: number
  pendingRequests: number
  totalEarned: number
  pendingPayout: number
}

interface HostTripsListProps {
  stats: Stats
  trips: Trip[]
}

function ModerationBadge({ status }: { status: string }) {
  switch (status) {
    case 'approved': return <Badge className="bg-green-900/50 text-green-300 border border-green-700 text-[10px]">Approved</Badge>
    case 'pending': return <Badge className="bg-yellow-900/50 text-yellow-300 border border-yellow-700 text-[10px]">Pending Review</Badge>
    case 'rejected': return <Badge className="bg-red-900/50 text-red-300 border border-red-700 text-[10px]">Rejected</Badge>
    default: return <Badge className="bg-zinc-700 text-zinc-200 text-[10px]">{status}</Badge>
  }
}

type JoinRequest = Awaited<ReturnType<typeof getJoinRequestsForTrip>>[number]

function InlinePendingRequests({ tripId }: { tripId: string }) {
  const [requests, setRequests] = useState<JoinRequest[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  async function load() {
    if (requests !== null) return
    setLoading(true)
    const data = await getJoinRequestsForTrip(tripId)
    setRequests(data.filter(r => r.status === 'pending'))
    setLoading(false)
  }

  async function onApprove(requestId: string) {
    setActionLoading(requestId)
    const res = await approveJoinRequest(requestId)
    if ('error' in res) toast.error(res.error)
    else {
      toast.success('Request approved!')
      setRequests(prev => (prev || []).filter(r => r.id !== requestId))
    }
    setActionLoading(null)
  }

  async function onReject(requestId: string) {
    setActionLoading(requestId)
    const res = await rejectJoinRequest(requestId)
    if ('error' in res) toast.error(res.error)
    else {
      toast.success('Request rejected')
      setRequests(prev => (prev || []).filter(r => r.id !== requestId))
    }
    setActionLoading(null)
  }

  // Auto-load on first render
  if (requests === null && !loading) {
    load()
  }

  if (loading) {
    return <p className="text-xs text-muted-foreground py-2">Loading…</p>
  }

  if (!requests?.length) {
    return <p className="text-xs text-muted-foreground py-2">No pending requests.</p>
  }

  return (
    <div className="space-y-2 mt-2">
      {requests.map(req => {
        const profile = req.user as { username?: string; full_name?: string | null } | null
        const name = profile?.full_name || profile?.username || 'Unknown'
        const busy = actionLoading === req.id
        return (
          <div key={req.id} className="flex items-center justify-between gap-2 bg-secondary/40 rounded-lg px-3 py-2 text-xs">
            <div>
              <span className="font-medium">{name}</span>
              {profile?.username && <span className="text-muted-foreground ml-1">@{profile.username}</span>}
              {req.message && <p className="text-muted-foreground mt-0.5 line-clamp-1">{req.message}</p>}
            </div>
            <div className="flex gap-1.5 shrink-0">
              <Button size="sm" className="h-7 px-2 bg-green-600 hover:bg-green-500 text-white text-[11px]" disabled={busy} onClick={() => onApprove(req.id)}>
                <Check className="h-3 w-3 mr-1" />Approve
              </Button>
              <Button size="sm" variant="outline" className="h-7 px-2 border-red-500/40 text-red-400 hover:bg-red-500/10 text-[11px]" disabled={busy} onClick={() => onReject(req.id)}>
                <X className="h-3 w-3 mr-1" />Reject
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function HostTripsList({ stats, trips: initialTrips }: HostTripsListProps) {
  const [filter, setFilter] = useState<'all' | 'active' | 'pending' | 'earned'>('all')
  const [trips, setTrips] = useState(initialTrips)
  const [isPending, startTransition] = useTransition()
  const [expandedRequests, setExpandedRequests] = useState<Set<string>>(new Set())

  const filtered = trips.filter(t => {
    if (filter === 'active') return t.is_active
    if (filter === 'pending') return t.pending_requests > 0
    return true
  })

  function handleToggle(tripId: string) {
    startTransition(async () => {
      const res = await toggleHostTripActive(tripId)
      if (res.error) { toast.error(res.error); return }
      setTrips(prev => prev.map(t => t.id === tripId ? { ...t, is_active: res.is_active! } : t))
      toast.success(res.is_active ? 'Trip activated' : 'Trip hidden')
    })
  }

  function handleToggleDateClosed(tripId: string, date: string, closed: boolean) {
    startTransition(async () => {
      const res = await toggleHostTripDateClosed(tripId, date, closed)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      setTrips(prev => prev.map(t =>
        t.id === tripId ? { ...t, departure_dates_closed: res.departure_dates_closed } : t,
      ))
      toast.success(closed ? 'Marked full for that date' : 'Reopened spots for that date')
    })
  }

  return (
    <>
      {/* Compact stats row */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setFilter('all')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm transition-colors ${
            filter === 'all' ? 'bg-primary/10 border-primary/40 text-primary' : 'bg-card border-border hover:border-primary/20'
          }`}
        >
          <MapPin className="h-3.5 w-3.5" />
          <span className="font-bold">{stats.totalTrips}</span>
          <span className="text-xs text-muted-foreground">Total</span>
        </button>
        <button
          onClick={() => setFilter('active')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm transition-colors ${
            filter === 'active' ? 'bg-green-500/10 border-green-500/40 text-green-400' : 'bg-card border-border hover:border-green-500/20'
          }`}
        >
          <TrendingUp className="h-3.5 w-3.5" />
          <span className="font-bold">{stats.activeTrips}</span>
          <span className="text-xs text-muted-foreground">Active</span>
        </button>
        <button
          onClick={() => setFilter('pending')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm transition-colors ${
            filter === 'pending' ? 'bg-yellow-500/10 border-yellow-500/40 text-yellow-400' : 'bg-card border-border hover:border-yellow-500/20'
          }`}
        >
          <Clock className="h-3.5 w-3.5" />
          <span className="font-bold">{stats.pendingRequests}</span>
          <span className="text-xs text-muted-foreground">Pending</span>
        </button>
        <button
          onClick={() => setFilter('earned')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm transition-colors ${
            filter === 'earned' ? 'bg-primary/10 border-primary/40 text-primary' : 'bg-card border-border hover:border-primary/20'
          }`}
        >
          <IndianRupee className="h-3.5 w-3.5" />
          <span className="font-bold">{formatPrice(stats.totalEarned)}</span>
          <span className="text-xs text-muted-foreground">Earned</span>
        </button>
      </div>

      {/* Earnings breakdown (shown when earned filter active) */}
      {filter === 'earned' && stats.totalEarned > 0 && (
        <div className="mb-6 p-4 rounded-xl border border-primary/20 bg-primary/5">
          <h3 className="text-sm font-bold mb-3">Earnings Breakdown</h3>
          <div className="space-y-2">
            {trips.filter(t => t.approved_requests > 0).map(t => (
              <div key={t.id} className="flex items-center justify-between text-sm">
                <span className="truncate">{t.title}</span>
                <span className="font-bold text-primary shrink-0 ml-2">
                  {t.approved_requests} booking{t.approved_requests !== 1 ? 's' : ''} · {formatPrice(t.price_paise * t.approved_requests)}
                </span>
              </div>
            ))}
          </div>
          {stats.pendingPayout > 0 && (
            <div className="mt-3 pt-3 border-t border-primary/20 flex justify-between text-sm">
              <span className="text-muted-foreground">Pending Payout</span>
              <span className="font-bold text-yellow-400">{formatPrice(stats.pendingPayout)}</span>
            </div>
          )}
        </div>
      )}

      {/* Trip list */}
      <h2 className="text-lg font-bold mb-3">
        {filter === 'all' ? 'Your Trips' : filter === 'active' ? 'Active Trips' : filter === 'pending' ? 'Trips with Pending Requests' : 'Your Trips'}
      </h2>

      {filtered.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title={filter === 'all' ? 'No trips yet' : 'No matching trips'}
          description={filter === 'all' ? 'Create your first trip and start hosting fellow travelers.' : 'Try a different filter.'}
          action={filter === 'all' ? { label: 'Create Your First Trip', href: '/host/create' } : undefined}
          dashed
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((trip) => (
            <div
              key={trip.id}
              className={`rounded-xl border bg-card p-4 ${
                trip.is_active ? 'border-border' : 'border-red-900/30 opacity-70'
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  {trip.images?.[0] && (
                    <img src={trip.images[0]} alt="" className="h-14 w-20 rounded-lg object-cover shrink-0 hidden sm:block" />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold truncate">{trip.title}</h3>
                      <ModerationBadge status={trip.moderation_status || 'pending'} />
                      {!trip.is_active && <Badge className="bg-red-900/50 text-red-300 border border-red-700 text-[10px]">Hidden</Badge>}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                      {trip.destination && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{trip.destination.name}, {trip.destination.state}</span>}
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{packageDurationShortLabel(trip)}</span>
                      <span className="flex items-center gap-1"><IndianRupee className="h-3 w-3" />{formatPrice(trip.price_paise)}</span>
                    </div>
                    {(trip.departure_dates || []).length > 0 && (() => {
                      const next = nextOpenDeparture(trip.departure_dates, trip.departure_dates_closed ?? null)
                      return (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {next
                            ? <>Next open: {formatDate(next)}{trip.departure_dates!.length > 1 && ` (+${trip.departure_dates!.length - 1} date${trip.departure_dates!.length > 2 ? 's' : ''})`}</>
                            : <>All upcoming departures are full or past</>}
                        </p>
                      )
                    })()}
                    {(trip.departure_dates || []).length > 0 && (
                      <div className="mt-2 pt-2 border-t border-border/60 space-y-1.5 max-h-36 overflow-y-auto">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Mark seats full (per date)</p>
                        {[...trip.departure_dates!].sort().map((date) => {
                          const isClosed = new Set((trip.departure_dates_closed || []).map(tripDepartureDateKey))
                            .has(tripDepartureDateKey(date))
                          return (
                            <div key={date} className="flex items-center justify-between gap-2 flex-wrap text-[11px]">
                              <span className="text-muted-foreground">{formatDate(date)}</span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <Badge className={isClosed ? 'bg-amber-900/50 text-amber-200 border border-amber-700 text-[9px]' : 'bg-emerald-900/40 text-emerald-200 border border-emerald-800 text-[9px]'}>
                                  {isClosed ? 'Full' : 'Open'}
                                </Badge>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-[10px] px-2"
                                  disabled={isPending}
                                  onClick={() => handleToggleDateClosed(trip.id, date, !isClosed)}
                                >
                                  {isClosed ? 'Reopen' : 'Mark full'}
                                </Button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {trip.pending_requests > 0 && (
                    <button
                      onClick={() => setExpandedRequests(prev => {
                        const next = new Set(prev)
                        if (next.has(trip.id)) next.delete(trip.id); else next.add(trip.id)
                        return next
                      })}
                      className="text-xs text-yellow-400 flex items-center gap-1 hover:text-yellow-300 transition-colors"
                      title="View pending join requests"
                    >
                      <Clock className="h-3 w-3" />{trip.pending_requests}
                      {expandedRequests.has(trip.id) ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                  )}
                  <span className="text-xs text-green-400 flex items-center gap-1"><Users className="h-3 w-3" />{trip.approved_requests}</span>
                  <Button
                    size="sm" variant="ghost"
                    className={trip.is_active ? 'text-red-400 hover:text-red-300' : 'text-green-400 hover:text-green-300'}
                    onClick={() => handleToggle(trip.id)}
                    disabled={isPending}
                    title={trip.is_active ? 'Hide trip' : 'Show trip'}
                  >
                    {trip.is_active ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                  <Button asChild size="sm" variant="outline" className="gap-1 text-xs">
                    <Link href={`/host/${trip.id}`}>Manage</Link>
                  </Button>
                </div>
              </div>
              {expandedRequests.has(trip.id) && (
                <div className="mt-3 pt-3 border-t border-border/60">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Pending Join Requests</p>
                  <InlinePendingRequests tripId={trip.id} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
