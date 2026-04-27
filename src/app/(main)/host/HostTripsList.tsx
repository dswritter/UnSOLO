'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { toggleHostTripActive, toggleHostTripDateClosed, getJoinRequestsForTrip, approveJoinRequest, rejectJoinRequest } from '@/actions/hosting'
import { formatPrice, formatDate } from '@/lib/utils'
import { packageDurationShortLabel, tripDepartureDateKey } from '@/lib/package-trip-calendar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { HostModerationBadge } from '@/components/host/HostModerationBadge'
import {
  hostHiddenStatusClass,
  hostHiddenStatusClassForest,
  hostSeatDateBadgeClass,
  hostSeatDateBadgeClassForest,
} from '@/components/host/hostBadgeStyles'
import { cn } from '@/lib/utils'
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
  /** Host layout uses `WanderThemeShell` — bump contrast on cards and icons */
  wanderHost?: boolean
}

type JoinRequest = Awaited<ReturnType<typeof getJoinRequestsForTrip>>[number]

function InlinePendingRequests({ tripId, wanderHost: wh }: { tripId: string; wanderHost?: boolean }) {
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
    return <p className={cn('text-xs py-2', wh ? 'text-white/65' : 'text-muted-foreground')}>Loading…</p>
  }

  if (!requests?.length) {
    return <p className={cn('text-xs py-2', wh ? 'text-white/65' : 'text-muted-foreground')}>No pending requests.</p>
  }

  return (
    <div className="space-y-2 mt-2">
      {requests.map(req => {
        const profile = req.user as { username?: string; full_name?: string | null } | null
        const name = profile?.full_name || profile?.username || 'Unknown'
        const busy = actionLoading === req.id
        return (
          <div
            key={req.id}
            className={cn(
              'flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs',
              wh ? 'bg-white/[0.08] border border-white/15 text-white/90' : 'bg-secondary/40',
            )}
          >
            <div>
              <span className="font-medium">{name}</span>
              {profile?.username && (
                <span className={cn('ml-1', wh ? 'text-white/60' : 'text-muted-foreground')}>@{profile.username}</span>
              )}
              {req.message && (
                <p className={cn('mt-0.5 line-clamp-1', wh ? 'text-white/65' : 'text-muted-foreground')}>{req.message}</p>
              )}
            </div>
            <div className="flex gap-1.5 shrink-0">
              <Button
                size="sm"
                className="h-7 px-2 bg-emerald-600 text-white hover:bg-emerald-500 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-[11px]"
                disabled={busy}
                onClick={() => onApprove(req.id)}
              >
                <Check className="h-3 w-3 mr-1" />Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-[11px] border-destructive/40 text-destructive hover:bg-destructive/10"
                disabled={busy}
                onClick={() => onReject(req.id)}
              >
                <X className="h-3 w-3 mr-1" />Reject
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function HostTripsList({ stats, trips: initialTrips, wanderHost = false }: HostTripsListProps) {
  const [filter, setFilter] = useState<'all' | 'active' | 'pending' | 'earned'>('all')
  const [trips, setTrips] = useState(initialTrips)
  const [isPending, startTransition] = useTransition()
  const [expandedRequests, setExpandedRequests] = useState<Set<string>>(new Set())

  const filtered = trips.filter(t => {
    if (filter === 'active') return t.is_active
    if (filter === 'pending') return t.pending_requests > 0
    return true
  })

  const w = wanderHost

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
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg border text-sm transition-colors',
            filter === 'all'
              ? w
                ? 'bg-[#fcba03]/20 border-[#fcba03]/55 text-[#fcba03]'
                : 'bg-primary/10 border-primary/40 text-primary'
              : w
                ? 'border-white/20 bg-white/[0.06] text-white hover:border-[#fcba03]/35'
                : 'bg-card border-border hover:border-primary/20',
          )}
        >
          <MapPin className="h-3.5 w-3.5" />
          <span className="font-bold">{stats.totalTrips}</span>
          <span className={cn('text-xs', w ? 'text-white/75' : 'text-muted-foreground')}>Total</span>
        </button>
        <button
          onClick={() => setFilter('active')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg border text-sm transition-colors',
            filter === 'active'
              ? w
                ? 'bg-emerald-400/20 border-emerald-200/45 text-white'
                : 'bg-emerald-500/12 border-emerald-500/40 text-emerald-900 dark:text-emerald-200'
              : w
                ? 'border-white/20 bg-white/[0.06] text-white hover:border-emerald-200/35'
                : 'bg-card border-border hover:border-emerald-500/25',
          )}
        >
          <TrendingUp className="h-3.5 w-3.5" />
          <span className="font-bold">{stats.activeTrips}</span>
          <span className={cn('text-xs', w ? 'text-white/75' : 'text-muted-foreground')}>Active</span>
        </button>
        <button
          onClick={() => setFilter('pending')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg border text-sm transition-colors',
            filter === 'pending'
              ? w
                ? 'bg-amber-400/25 border-amber-200/50 text-white'
                : 'bg-amber-500/12 border-amber-500/45 text-amber-900 dark:text-amber-200'
              : w
                ? 'border-white/20 bg-white/[0.06] text-white hover:border-amber-200/35'
                : 'bg-card border-border hover:border-amber-500/25',
          )}
        >
          <Clock className="h-3.5 w-3.5" />
          <span className="font-bold">{stats.pendingRequests}</span>
          <span className={cn('text-xs', w ? 'text-white/75' : 'text-muted-foreground')}>Pending</span>
        </button>
        <button
          onClick={() => setFilter('earned')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg border text-sm transition-colors',
            filter === 'earned'
              ? w
                ? 'bg-[#fcba03]/20 border-[#fcba03]/55 text-[#fcba03]'
                : 'bg-primary/10 border-primary/40 text-primary'
              : w
                ? 'border-white/20 bg-white/[0.06] text-white hover:border-[#fcba03]/35'
                : 'bg-card border-border hover:border-primary/20',
          )}
        >
          <IndianRupee className="h-3.5 w-3.5" />
          <span className="font-bold">{formatPrice(stats.totalEarned)}</span>
          <span className={cn('text-xs', w ? 'text-white/75' : 'text-muted-foreground')}>Earned</span>
        </button>
      </div>

      {/* Earnings breakdown (shown when earned filter active) */}
      {filter === 'earned' && stats.totalEarned > 0 && (
        <div
          className={cn(
            'mb-6 p-4 rounded-xl border',
            w ? 'border-white/25 bg-white/[0.07]' : 'border-primary/20 bg-primary/5',
          )}
        >
          <h3 className={cn('text-sm font-bold mb-3', w && 'text-white')}>Earnings Breakdown</h3>
          <div className="space-y-2">
            {trips.filter(t => t.approved_requests > 0).map(t => (
              <div key={t.id} className={cn('flex items-center justify-between text-sm', w && 'text-white/90')}>
                <span className="truncate">{t.title}</span>
                <span className={cn('font-bold shrink-0 ml-2', w ? 'text-[#fcba03]' : 'text-primary')}>
                  {t.approved_requests} booking{t.approved_requests !== 1 ? 's' : ''} · {formatPrice(t.price_paise * t.approved_requests)}
                </span>
              </div>
            ))}
          </div>
          {stats.pendingPayout > 0 && (
            <div
              className={cn(
                'mt-3 pt-3 border-t flex justify-between text-sm',
                w ? 'border-white/20 text-white/85' : 'border-primary/20',
              )}
            >
              <span className={cn(!w && 'text-muted-foreground')}>Pending Payout</span>
              <span className={cn('font-bold', w ? 'text-amber-200' : 'text-amber-800 dark:text-amber-300')}>
                {formatPrice(stats.pendingPayout)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Trip list */}
      <h2 className={cn('text-lg font-bold mb-3', w && 'text-white')}>
        {filter === 'all' ? 'Your Trips' : filter === 'active' ? 'Active Trips' : filter === 'pending' ? 'Trips with Pending Requests' : 'Your Trips'}
      </h2>

      {filtered.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title={filter === 'all' ? 'No trips yet' : 'No matching trips'}
          description={filter === 'all' ? 'Create your first trip and start hosting fellow travelers.' : 'Try a different filter.'}
          action={filter === 'all' ? { label: 'Create Your First Trip', href: '/host/create' } : undefined}
          dashed
          className={
            w
              ? 'border-white/25 bg-white/[0.06] [&_h3]:text-white [&_p]:text-white/75 [&_svg]:text-[#fcba03]/80'
              : ''
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((trip) => (
            <div
              key={trip.id}
              className={cn(
                'rounded-xl border p-4 backdrop-blur-sm',
                w
                  ? cn(
                      'bg-[oklch(0.16_0.038_152/0.92)]',
                      trip.is_active ? 'border-white/25' : 'border-red-400/40 opacity-95',
                    )
                  : cn('bg-card', trip.is_active ? 'border-border' : 'border-destructive/30 opacity-80'),
              )}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  {trip.images?.[0] && (
                    <img
                      src={trip.images[0]}
                      alt=""
                      className={cn('h-14 w-20 rounded-lg object-cover shrink-0 hidden sm:block', w && 'ring-1 ring-white/15')}
                    />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className={cn('font-bold truncate', w && 'text-white')}>{trip.title}</h3>
                      <HostModerationBadge
                        size="sm"
                        forestContrast={w}
                        status={trip.moderation_status || 'pending'}
                      />
                      {!trip.is_active && (
                        <Badge
                          className={cn(
                            'text-[10px] font-medium',
                            w ? hostHiddenStatusClassForest() : hostHiddenStatusClass(),
                          )}
                        >
                          Hidden
                        </Badge>
                      )}
                    </div>
                    <div
                      className={cn(
                        'flex items-center gap-3 text-xs mt-1 flex-wrap',
                        w ? 'text-white/90' : 'text-muted-foreground',
                      )}
                    >
                      {trip.destination && (
                        <span className="flex items-center gap-1">
                          <MapPin className={cn('h-3 w-3 shrink-0', w && 'text-[#fcba03]')} />
                          {trip.destination.name}, {trip.destination.state}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar className={cn('h-3 w-3 shrink-0', w && 'text-[#fcba03]')} />
                        {packageDurationShortLabel(trip)}
                      </span>
                      <span className="flex items-center gap-1">
                        <IndianRupee className={cn('h-3 w-3 shrink-0', w && 'text-[#fcba03]')} />
                        {formatPrice(trip.price_paise)}
                      </span>
                    </div>
                    {(trip.departure_dates || []).length > 0 && (() => {
                      const next = nextOpenDeparture(trip.departure_dates, trip.departure_dates_closed ?? null)
                      return (
                        <p className={cn('text-[10px] mt-0.5', w ? 'text-white/70' : 'text-muted-foreground')}>
                          {next
                            ? <>Next open: {formatDate(next)}{trip.departure_dates!.length > 1 && ` (+${trip.departure_dates!.length - 1} date${trip.departure_dates!.length > 2 ? 's' : ''})`}</>
                            : <>All upcoming departures are full or past</>}
                        </p>
                      )
                    })()}
                    {(trip.departure_dates || []).length > 0 && (
                      <div
                        className={cn(
                          'mt-2 pt-2 border-t space-y-1.5 max-h-36 overflow-y-auto',
                          w ? 'border-white/20' : 'border-border/60',
                        )}
                      >
                        <p
                          className={cn(
                            'text-[10px] font-semibold uppercase tracking-wide',
                            w ? 'text-white/80' : 'text-muted-foreground',
                          )}
                        >
                          Mark seats full (per date)
                        </p>
                        {[...trip.departure_dates!].sort().map((date) => {
                          const isClosed = new Set((trip.departure_dates_closed || []).map(tripDepartureDateKey))
                            .has(tripDepartureDateKey(date))
                          return (
                            <div
                              key={date}
                              className={cn(
                                'flex items-center justify-between gap-2 flex-wrap text-[11px]',
                                w && 'text-white/85',
                              )}
                            >
                              <span className={cn(!w && 'text-muted-foreground')}>{formatDate(date)}</span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <Badge
                                  className={cn(
                                    'text-[9px] font-medium border',
                                    w ? hostSeatDateBadgeClassForest(isClosed) : hostSeatDateBadgeClass(isClosed),
                                  )}
                                >
                                  {isClosed ? 'Full' : 'Open'}
                                </Badge>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className={cn(
                                    'h-7 text-[10px] px-2',
                                    w &&
                                      'border-white/35 bg-white/[0.08] text-white hover:bg-white/15 hover:text-white',
                                  )}
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
                      className={cn(
                        'text-xs flex items-center gap-1 hover:underline transition-colors',
                        w ? 'text-amber-200' : 'text-amber-800 dark:text-amber-300',
                      )}
                      title="View pending join requests"
                    >
                      <Clock className={cn('h-3 w-3', w && 'text-[#fcba03]')} />
                      {trip.pending_requests}
                      {expandedRequests.has(trip.id) ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                  )}
                  <span
                    className={cn(
                      'text-xs flex items-center gap-1 font-medium tabular-nums',
                      w ? 'text-white' : 'text-emerald-800 dark:text-emerald-300',
                    )}
                    title="Approved bookings"
                  >
                    <Users className={cn('h-3.5 w-3.5', w && 'text-[#fcba03]')} />
                    {trip.approved_requests}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className={cn(
                      w && 'hover:bg-white/10',
                      trip.is_active
                        ? w
                          ? 'text-red-200 hover:text-red-100'
                          : 'text-destructive hover:text-destructive/90'
                        : w
                          ? 'text-[#fcba03] hover:text-[#fcba03]/90'
                          : 'text-emerald-800 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300',
                    )}
                    onClick={() => handleToggle(trip.id)}
                    disabled={isPending}
                    title={trip.is_active ? 'Hide trip' : 'Show trip'}
                  >
                    {trip.is_active ? (
                      <EyeOff className={cn('h-4 w-4', w && 'text-red-200')} />
                    ) : (
                      <Eye className={cn('h-4 w-4', w && 'text-[#fcba03]')} />
                    )}
                  </Button>
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className={cn(
                      'gap-1 text-xs',
                      w && 'border-white/35 bg-white/[0.08] text-white hover:bg-white/15 hover:text-white',
                    )}
                  >
                    <Link href={`/host/${trip.id}`}>Manage</Link>
                  </Button>
                </div>
              </div>
              {expandedRequests.has(trip.id) && (
                <div className={cn('mt-3 pt-3 border-t', w ? 'border-white/20' : 'border-border/60')}>
                  <p
                    className={cn(
                      'text-[11px] font-semibold uppercase tracking-wide mb-1',
                      w ? 'text-white/80' : 'text-muted-foreground',
                    )}
                  >
                    Pending Join Requests
                  </p>
                  <InlinePendingRequests tripId={trip.id} wanderHost={w} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
