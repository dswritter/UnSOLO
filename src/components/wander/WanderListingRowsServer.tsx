import Link from 'next/link'
import { getRequestAuth } from '@/lib/auth/request-session'
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

export async function WanderListingRowsServer() {
  const { supabase, user } = await getRequestAuth()
  let profileAvatar: string | null = null
  if (user) {
    const { data: p } = await supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', user.id)
      .single()
    profileAvatar = p?.avatar_url ?? null
  }
  const userId = user?.id ?? null

  const [tp, stayListings, actListings, rentListings] = await Promise.all([
    getWanderTripRow(),
    getWanderStayRow(),
    getWanderActivityRow(),
    getWanderRentalRow(),
  ])

  const [stays, activities, rentals] = await Promise.all([
    getWanderServiceItemsForListings(stayListings),
    getWanderServiceItemsForListings(actListings),
    getWanderServiceItemsForListings(rentListings),
  ])

  let landingInterestedPackageIds: string[] = []
  if (userId && tp.packages.length > 0) {
    const { data: interests } = await supabase
      .from('package_interests')
      .select('package_id')
      .eq('user_id', userId)
      .in(
        'package_id',
        tp.packages.map((p) => p.id),
      )
    landingInterestedPackageIds = (interests || []).map(
      (row) => (row as { package_id: string }).package_id,
    )
  }

  if (!stays || !activities || !rentals) return null

  // Booked-guests per trip → "Only N left" badge on the home cards (same source as Explore).
  let spotsBookedByTrip: Record<string, number> = {}
  if (tp.packages.length > 0) {
    const { bookedGuests } = await fetchPackagePopularityMaps(supabase, tp.packages.map((p) => p.id))
    spotsBookedByTrip = Object.fromEntries(bookedGuests)
  }

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
