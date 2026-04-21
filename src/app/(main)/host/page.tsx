import { redirect } from 'next/navigation'
import Link from 'next/link'
import { checkIsHost, getHostDashboardStats, getMyHostedTrips } from '@/actions/hosting'
import { createClient } from '@/lib/supabase/server'
import { formatPrice, formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { HostTripsList } from './HostTripsList'
import { HostTripDraftsPanel } from './HostTripDraftsPanel'
import { HostCreateDropdown } from './HostCreateDropdown'
import { ResubmitServiceListingButton } from './ResubmitServiceListingButton'
import { ToggleServiceListingButton } from './ToggleServiceListingButton'
import {
  Plus,
  MapPin,
  Calendar,
  Users,
  IndianRupee,
  TrendingUp,
  Clock,
} from 'lucide-react'

function ModerationBadge({ status }: { status: string }) {
  switch (status) {
    case 'approved':
      return <Badge className="bg-green-900/50 text-green-300 border border-green-700 text-xs">Approved</Badge>
    case 'pending':
      return <Badge className="bg-yellow-900/50 text-yellow-300 border border-yellow-700 text-xs">Pending Review</Badge>
    case 'rejected':
      return <Badge className="bg-red-900/50 text-red-300 border border-red-700 text-xs">Rejected</Badge>
    default:
      return <Badge className="bg-zinc-700 text-zinc-200 text-xs">{status}</Badge>
  }
}

export default async function HostDashboardPage() {
  const hostStatus = await checkIsHost()

  if (!hostStatus.authenticated) redirect('/login')
  if (!hostStatus.isHost) redirect('/host/verify')

  const [stats, trips] = await Promise.all([
    getHostDashboardStats(),
    getMyHostedTrips(),
  ])

  // Fetch this host's service listings (stays/activities/rentals/getting_around).
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: serviceListings } = user
    ? await supabase
        .from('service_listings')
        .select('id, title, type, status, is_active, images')
        .eq('host_id', user.id)
        .order('created_at', { ascending: false })
    : { data: null }

  // Best-effort item counts. Returns silently if the items table does not yet
  // exist (migration 049 not applied) so the dashboard still renders.
  const countByListing: Record<string, number> = {}
  if (serviceListings && serviceListings.length > 0) {
    const { data: itemCounts, error: itemCountsError } = await supabase
      .from('service_listing_items')
      .select('service_listing_id')
      .in('service_listing_id', serviceListings.map(l => l.id))
    if (!itemCountsError) {
      for (const row of itemCounts || []) {
        countByListing[row.service_listing_id] = (countByListing[row.service_listing_id] || 0) + 1
      }
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-black">
              Host <span className="text-primary">Dashboard</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Host your own trips or experiences and invite travelers to join
            </p>
          </div>
          <HostCreateDropdown />
        </div>

        <HostTripDraftsPanel />

        {/* Compact Stats Row */}
        <HostTripsList
          stats={stats}
          trips={trips as { id: string; title: string; slug: string; is_active: boolean; moderation_status: string | null; price_paise: number; duration_days: number; trip_days?: number | null; trip_nights?: number | null; departure_dates: string[] | null; departure_dates_closed?: string[] | null; images: string[] | null; max_group_size: number; pending_requests: number; approved_requests: number; destination: { name: string; state: string } | null }[]}
        />

        {serviceListings && serviceListings.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-bold mb-3">Your Services</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {serviceListings.map(listing => (
                <div
                  key={listing.id}
                  className={`rounded-xl border bg-card p-4 transition-opacity ${
                    listing.is_active === false
                      ? 'border-red-900/30 opacity-70'
                      : 'border-border'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-semibold truncate">{listing.title}</h3>
                        {listing.is_active === false && (
                          <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-300">
                            Hidden
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                        {String(listing.type).replace('_', ' ')} · {countByListing[listing.id] || 0} item{countByListing[listing.id] === 1 ? '' : 's'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <ToggleServiceListingButton
                        listingId={listing.id}
                        isActive={listing.is_active !== false}
                      />
                      <ModerationBadge status={listing.status} />
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <Link
                      href={`/host/service-listings/${listing.id}/edit`}
                      className="text-xs text-primary hover:underline"
                    >
                      Edit listing →
                    </Link>
                    <Link
                      href={`/host/service-listings/${listing.id}/edit?tab=items`}
                      className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                    >
                      Items
                    </Link>
                    {listing.status === 'rejected' && (
                      <ResubmitServiceListingButton listingId={listing.id} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
