import { Suspense } from 'react'
import Link from 'next/link'
import { getRequestAuth, getRequestProfile } from '@/lib/auth/request-session'
import {
  getWanderTripRow,
  getWanderStayRow,
  getWanderActivityRow,
  getWanderRentalRow,
  getWanderServiceItemsForListings,
} from '@/lib/wander/wanderQueries'
import { WanderListingsSectionsWrapper } from '@/components/wander/WanderListingsSectionsWrapper'
import { WanderRecentlyViewedStrip } from '@/components/wander/WanderRecentlyViewedStrip'
import { WanderListingSections } from '@/components/wander/WanderListingSections'
import { WanderStatusRail } from '@/components/wander/WanderStatusRail'
import { WanderRowFallback } from '@/components/wander/WanderRowFallback'
import type { Package, ServiceListing } from '@/types'

type ActiveTab = 'trips' | 'stays' | 'activities' | 'rentals' | null

async function fetchInterestedPackageIds(supabase: Awaited<ReturnType<typeof getRequestAuth>>['supabase'], userId: string | null, packageIds: string[]) {
  if (!userId || packageIds.length === 0) return []
  const { data } = await supabase.from('package_interests').select('package_id').eq('user_id', userId).in('package_id', packageIds)
  return (data || []).map(row => row.package_id as string)
}

async function WanderTripsRowServer({ activeTab }: { activeTab: ActiveTab }) {
  const [{ packages, interestCounts, bookedGuests }, auth] = await Promise.all([getWanderTripRow(), getRequestAuth()])
  const interestedPackageIds = await fetchInterestedPackageIds(auth.supabase, auth.user?.id ?? null, packages.map(pkg => pkg.id))
  return <WanderListingSections onlySection="trips" trips={packages} tripInterestCounts={interestCounts}
    spotsBookedByTrip={bookedGuests} interestedPackageIds={interestedPackageIds}
    stays={[]} activities={[]} rentals={[]} activeTab={activeTab} seedPreview />
}

async function WanderServiceRowServer({ type, activeTab }: { type: 'stays' | 'activities' | 'rentals'; activeTab: ActiveTab }) {
  let listings: ServiceListing[]
  if (type === 'stays') listings = await getWanderStayRow()
  else if (type === 'activities') listings = await getWanderActivityRow()
  else listings = await getWanderRentalRow()
  const withItems = await getWanderServiceItemsForListings(listings)
  const sectionProps = { trips: [] as Package[], stays: [] as typeof withItems, activities: [] as typeof withItems,
    rentals: [] as typeof withItems, activeTab }
  return <WanderListingSections onlySection={type} {...sectionProps} {...{ [type]: withItems }} seedPreview />
}

async function WanderStatusInterludeServer() {
  const { user } = await getRequestAuth()
  const profile = user ? await getRequestProfile(user.id) : null
  return <div className="md:hidden"><div className="wander-frost-panel">
    {user ? <WanderStatusRail avatarUrl={profile?.avatar_url ?? null} /> : <div className="space-y-1">
      <h3 className="text-sm font-bold">Traveler status</h3>
      <p className="mb-3 text-sm text-muted-foreground">Sign in to see recent stories from people you follow — unread first.</p>
      <Link href="/login?redirectTo=/" className="text-sm font-semibold text-primary hover:underline">Sign in</Link>
    </div>}
  </div></div>
}

/** The shell resolves immediately; each row streams when its own data is ready. */
export function WanderListingRowsServer({ activeTab }: { activeTab: ActiveTab }) {
  return <div className="border-t border-border/50">
    <div className="mx-auto w-full max-w-[min(100%,1920px)] px-4 py-6 sm:px-6 md:py-9 lg:px-10">
      <WanderRecentlyViewedStrip />
      <WanderListingsSectionsWrapper
        trips={<Suspense fallback={<WanderRowFallback kind="trips" title="popular trips" activeTab={activeTab} />}><WanderTripsRowServer activeTab={activeTab} /></Suspense>}
        stays={<Suspense fallback={<WanderRowFallback kind="stays" title="stays" activeTab={activeTab} />}><WanderServiceRowServer type="stays" activeTab={activeTab} /></Suspense>}
        activities={<Suspense fallback={<WanderRowFallback kind="activities" title="activities" activeTab={activeTab} />}><WanderServiceRowServer type="activities" activeTab={activeTab} /></Suspense>}
        rentals={<Suspense fallback={<WanderRowFallback kind="rentals" title="rentals" activeTab={activeTab} />}><WanderServiceRowServer type="rentals" activeTab={activeTab} /></Suspense>}
        interludeSlot={<Suspense fallback={<div className="md:hidden h-24 animate-pulse rounded-2xl bg-white/[0.07]" />}><WanderStatusInterludeServer /></Suspense>}
      />
      <div className="mt-6 grid gap-3 md:hidden">
        <div className="rounded-2xl border border-white/14 bg-white/[0.05] p-4 shadow-[0_14px_44px_rgba(0,0,0,0.2)] backdrop-blur-[42px]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary/90">Keep planning</p>
          <h3 className="mt-1 text-lg font-black text-white">Check deals and meet other travellers</h3>
          <p className="mt-1 text-sm text-white/62">Save on bundles, or jump into communities while you shape the plan.</p>
          <div className="mt-4 flex gap-2">
            <Link href="/offers" className="inline-flex flex-1 items-center justify-center rounded-xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground">View Offers</Link>
            <Link href="/community" className="inline-flex flex-1 items-center justify-center rounded-xl border border-white/14 bg-white/[0.04] px-3 py-2 text-sm font-bold text-white">Meet Travellers</Link>
          </div>
        </div>
      </div>
    </div>
  </div>
}

export function WanderListingRowsSkeleton() {
  return <div className="border-t border-border/50"><div className="mx-auto w-full max-w-[min(100%,1920px)] px-4 py-6 sm:px-6 md:py-9 lg:px-10">
    {[0, 1, 2].map(i => <div key={i} className="mb-8 animate-pulse"><div className="mb-3 h-5 w-36 rounded-md bg-white/10" />
      <div className="flex gap-3 overflow-hidden">{[0, 1, 2].map(j => <div key={j} className="h-52 w-52 shrink-0 rounded-2xl bg-white/[0.07]" />)}</div>
    </div>)}
  </div></div>
}
