'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { toggleHostTripActive } from '@/actions/hosting'
import { formatPrice, formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
  Plus,
  MapPin,
  Calendar,
  Users,
  IndianRupee,
  TrendingUp,
  Clock,
  Eye,
  EyeOff,
} from 'lucide-react'

interface Trip {
  id: string
  title: string
  slug: string
  is_active: boolean
  moderation_status: string | null
  price_paise: number
  duration_days: number
  departure_dates: string[] | null
  images: string[] | null
  max_group_size: number
  pending_requests: number
  approved_requests: number
  destination: { name: string; state: string } | null
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

export function HostTripsList({ stats, trips: initialTrips }: HostTripsListProps) {
  const [filter, setFilter] = useState<'all' | 'active' | 'pending' | 'earned'>('all')
  const [trips, setTrips] = useState(initialTrips)
  const [isPending, startTransition] = useTransition()

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
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center">
          <MapPin className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-bold mb-1">{filter === 'all' ? 'No trips yet' : 'No matching trips'}</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {filter === 'all' ? 'Create your first trip and start hosting fellow travelers.' : 'Try a different filter.'}
          </p>
          {filter === 'all' && (
            <Button asChild className="bg-primary text-primary-foreground font-bold gap-2" size="sm">
              <Link href="/host/create"><Plus className="h-4 w-4" />Create Your First Trip</Link>
            </Button>
          )}
        </div>
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
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{trip.duration_days} days</span>
                      <span className="flex items-center gap-1"><IndianRupee className="h-3 w-3" />{formatPrice(trip.price_paise)}</span>
                    </div>
                    {(trip.departure_dates || []).length > 0 && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Next: {formatDate(trip.departure_dates![0])}
                        {trip.departure_dates!.length > 1 && ` (+${trip.departure_dates!.length - 1} more)`}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {trip.pending_requests > 0 && (
                    <span className="text-xs text-yellow-400 flex items-center gap-1"><Clock className="h-3 w-3" />{trip.pending_requests}</span>
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
            </div>
          ))}
        </div>
      )}
    </>
  )
}
