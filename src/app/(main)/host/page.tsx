import { redirect } from 'next/navigation'
import Link from 'next/link'
import { checkIsHost, getHostDashboardStats, getMyHostedTrips } from '@/actions/hosting'
import { getPayoutDetails } from '@/actions/payout'
import { createClient } from '@/lib/supabase/server'
import { formatPrice, formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { HostModerationBadge } from '@/components/host/HostModerationBadge'
import { hostHiddenStatusClassForest } from '@/components/host/hostBadgeStyles'
import { cn } from '@/lib/utils'
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
  Wallet,
  AlertTriangle,
} from 'lucide-react'

export default async function HostDashboardPage() {
  const hostStatus = await checkIsHost()

  if (!hostStatus.authenticated) redirect('/login')
  if (!hostStatus.isHost) redirect('/host/verify')

  const [stats, trips, payout] = await Promise.all([
    getHostDashboardStats(),
    getMyHostedTrips(),
    getPayoutDetails(),
  ])

  const payoutConfigured = !!(payout && !('error' in payout) && (
    (payout.upi_id && payout.upi_id.includes('@')) ||
    (payout.bank_account_number && payout.bank_ifsc)
  ))

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
    <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-black text-white">
              Host <span className="text-primary">Dashboard</span>
            </h1>
            <p className="text-sm text-white/75 mt-0.5">
              Host your own trips or experiences and invite travelers to join
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/host/payout" className="gap-2">
                <Wallet className="h-4 w-4" />
                {payoutConfigured ? 'Payout Details' : 'Add Payout Details'}
              </Link>
            </Button>
            <HostCreateDropdown />
          </div>
        </div>

        {!payoutConfigured && (
          <div className="mb-6 rounded-xl border border-amber-300/50 bg-amber-500/15 p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-200 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-white">Add your payout details</p>
              <p className="text-xs text-white/70 mt-0.5">
                You need a UPI ID or bank account on file before you can publish new listings and receive earnings.
              </p>
            </div>
            <Button asChild size="sm" className="bg-primary text-primary-foreground font-bold flex-shrink-0">
              <Link href="/host/payout">Set up</Link>
            </Button>
          </div>
        )}

        <div className="mb-6 rounded-xl border border-white/25 bg-white/[0.06] p-4 text-xs">
          <p className="font-semibold text-white">Fair-split refunds — your share is protected</p>
          <p className="text-white/70 mt-1 leading-relaxed">
            On cancellations, UnSOLO and you absorb the refund proportionally to our earnings. You only ever lose
            your fair portion — never the platform fee, promo codes, or referral credits.{' '}
            <Link href="/refund-policy" className="text-primary hover:underline">See refund policy</Link>.
          </p>
        </div>

        <HostTripDraftsPanel />

        {/* Compact Stats Row */}
        <HostTripsList wanderHost stats={stats} trips={trips as { id: string; title: string; slug: string; is_active: boolean; moderation_status: string | null; price_paise: number; duration_days: number; trip_days?: number | null; trip_nights?: number | null; departure_dates: string[] | null; departure_dates_closed?: string[] | null; images: string[] | null; max_group_size: number; pending_requests: number; approved_requests: number; destination: { name: string; state: string } | null }[]} />

        {serviceListings && serviceListings.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-bold mb-3 text-white">Your Services</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {serviceListings.map(listing => (
                <div
                  key={listing.id}
                  className={cn(
                    'rounded-xl border p-4 transition-opacity backdrop-blur-sm bg-[oklch(0.16_0.038_152/0.92)]',
                    listing.is_active === false && 'border-red-400/40 opacity-90',
                    listing.is_active !== false && 'border-white/25',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-semibold truncate text-white">{listing.title}</h3>
                        {listing.is_active === false && (
                          <span
                            className={cn(
                              'flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-md border font-medium',
                              hostHiddenStatusClassForest(),
                            )}
                          >
                            Hidden
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-white/75 mt-0.5 capitalize">
                        {String(listing.type).replace('_', ' ')} · {countByListing[listing.id] || 0} item{countByListing[listing.id] === 1 ? '' : 's'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <ToggleServiceListingButton
                        listingId={listing.id}
                        isActive={listing.is_active !== false}
                      />
                      <HostModerationBadge forestContrast status={listing.status} />
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
  )
}
