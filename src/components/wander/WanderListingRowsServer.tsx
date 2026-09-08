import Link from 'next/link'
import { getRequestAuth, getRequestProfile } from '@/lib/auth/request-session'
import {
  getWanderTripRow,
  getWanderStayRow,
  getWanderActivityRow,
  getWanderRentalRow,
  getWanderServiceItemsForListings,
} from '@/lib/wander/wanderQueries'
import { fetchPackagePopularityMaps } from '@/lib/explore-package-popularity'
import { WanderListingsSectionsWrapper } from '@/components/wander/WanderListingsSectionsWrapper'
import { WanderRecentlyViewedStrip } from '@/components/wander/WanderRecentlyViewedStrip'
import { WanderStatusRail } from '@/components/wander/WanderStatusRail'
import type { SupabaseClient } from '@supabase/supabase-js'

async function fetchInterestedPackageIds(
  supabase: SupabaseClient,
  userId: string | null,
  packageIds: string[],
): Promise<string[]> {
  if (!userId || packageIds.length === 0) return []
  const { data } = await supabase
    .from('package_interests')
    .select('package_id')
    .eq('user_id', userId)
    .in('package_id', packageIds)
  return (data || []).map((row) => (row as { package_id: string }).package_id)
}

export async function WanderListingRowsServer() {
  const { supabase, user } = await getRequestAuth()
  const userId = user?.id ?? null

  // All independent of each other — run in one round trip instead of a chain
  // of sequential awaits. `getRequestProfile` is request-cached, so this
  // shares its result with WanderHeroSection's call instead of double-fetching.
  const [tp, stayListings, actListings, rentListings, profile] = await Promise.all([
    getWanderTripRow(),
    getWanderStayRow(),
    getWanderActivityRow(),
    getWanderRentalRow(),
    userId ? getRequestProfile(userId) : Promise.resolve(null),
  ])
  const profileAvatar = profile?.avatar_url ?? null

  const tripPackageIds = tp.packages.map((p) => p.id)

  const [stays, activities, rentals, landingInterestedPackageIds, popularity] = await Promise.all([
    getWanderServiceItemsForListings(stayListings),
    getWanderServiceItemsForListings(actListings),
    getWanderServiceItemsForListings(rentListings),
    fetchInterestedPackageIds(supabase, userId, tripPackageIds),
    tripPackageIds.length > 0 ? fetchPackagePopularityMaps(supabase, tripPackageIds) : null,
  ])

  if (!stays || !activities || !rentals) return null

  // Booked-guests per trip → "Only N left" badge on the home cards (same source as Explore).
  const spotsBookedByTrip: Record<string, number> = popularity
    ? Object.fromEntries(popularity.bookedGuests)
    : {}

  return (
    <div className="border-t border-border/50">
      <div className="mx-auto w-full max-w-[min(100%,1920px)] px-4 sm:px-6 lg:px-10 py-6 md:py-9">
        <WanderRecentlyViewedStrip />
        <WanderListingsSectionsWrapper
          trips={tp.packages}
          tripInterestCounts={tp.interestCounts}
          spotsBookedByTrip={spotsBookedByTrip}
          interestedPackageIds={landingInterestedPackageIds}
          stays={stays}
          activities={activities}
          rentals={rentals}
          interludeSlot={
            <div className="md:hidden">
              <div className="wander-frost-panel">
                {userId ? (
                  <WanderStatusRail avatarUrl={profileAvatar} />
                ) : (
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold">Traveler status</h3>
                    <p className="mb-3 text-sm text-muted-foreground">
                      Sign in to see recent stories from people you follow — unread first.
                    </p>
                    <Link
                      href="/login?redirectTo=/"
                      className="text-sm font-semibold text-primary hover:underline"
                    >
                      Sign in
                    </Link>
                  </div>
                )}
              </div>
            </div>
          }
        />
        <div className="mt-6 grid gap-3 md:hidden">
          <div className="rounded-2xl border border-white/14 bg-white/[0.05] p-4 shadow-[0_14px_44px_rgba(0,0,0,0.2)] backdrop-blur-[42px]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary/90">
              Keep planning
            </p>
            <h3 className="mt-1 text-lg font-black text-white">
              Check deals and meet other travellers
            </h3>
            <p className="mt-1 text-sm text-white/62">
              Save on bundles, or jump into communities while you shape the plan.
            </p>
            <div className="mt-4 flex gap-2">
              <Link
                href="/offers"
                className="inline-flex flex-1 items-center justify-center rounded-xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground"
              >
                View Offers
              </Link>
              <Link
                href="/community"
                className="inline-flex flex-1 items-center justify-center rounded-xl border border-white/14 bg-white/[0.04] px-3 py-2 text-sm font-bold text-white"
              >
                Meet Travellers
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function WanderListingRowsSkeleton() {
  return (
    <div className="border-t border-border/50">
      <div className="mx-auto w-full max-w-[min(100%,1920px)] px-4 sm:px-6 lg:px-10 py-6 md:py-9">
        {[0, 1, 2].map((i) => (
          <div key={i} className="mb-8 animate-pulse">
            <div className="mb-3 h-5 w-36 rounded-md bg-white/10" />
            <div className="flex gap-3 overflow-hidden">
              {[0, 1, 2].map((j) => (
                <div
                  key={j}
                  className="h-52 w-52 shrink-0 rounded-2xl bg-white/[0.07]"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
