export const revalidate = 300

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  getWanderStats,
  getWanderRatingHero,
  getWanderTripRow,
  getWanderActivityRow,
  getWanderRentalRow,
  getWanderServiceItemsForListings,
  getListedActivityFilterOptions,
} from '@/lib/wander/wanderQueries'
import { WanderHero } from '@/components/wander/WanderHero'
import { WanderSearchBar } from '@/components/wander/WanderSearchBar'
import { WanderStatsGrid } from '@/components/wander/WanderStatsGrid'
import { WanderListingSections } from '@/components/wander/WanderListingSections'
import { WanderStatusRail } from '@/components/wander/WanderStatusRail'

export default async function WanderPage() {
  const [stats, rating, tripPackages, actListings, rentListings, supabase, listedActivities] = await Promise.all([
    getWanderStats(),
    getWanderRatingHero(),
    getWanderTripRow(),
    getWanderActivityRow(),
    getWanderRentalRow(),
    createClient(),
    getListedActivityFilterOptions(),
  ])

  const { data: { user } } = await supabase.auth.getUser()
  let profileAvatar: string | null = null
  if (user) {
    const { data: p } = await supabase.from('profiles').select('avatar_url').eq('id', user.id).single()
    profileAvatar = p?.avatar_url ?? null
  }

  const [activities, rentals] = await Promise.all([
    getWanderServiceItemsForListings(actListings),
    getWanderServiceItemsForListings(rentListings),
  ])

  return (
    <div className="w-full">
      <WanderHero rating={rating} stats={stats} />

      <div className="mx-auto w-full max-w-[min(100%,1920px)] px-4 sm:px-6 lg:px-10 -mt-6 md:-mt-8 relative z-20 pb-4 md:pb-6 flex justify-start">
        <WanderSearchBar listedActivities={listedActivities} />
      </div>

      <div className="mx-auto w-full max-w-[min(100%,1920px)] px-4 sm:px-6 lg:px-10 pb-8">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6 lg:items-center items-start">
          <div className="rounded-2xl border border-border/60 bg-card/30 p-3 sm:p-4 min-h-[100px]">
            {user ? (
              <WanderStatusRail avatarUrl={profileAvatar} />
            ) : (
              <div className="space-y-1">
                <h3 className="text-sm font-bold">Traveler status</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Sign in to see recent stories from people you follow — unread first.
                </p>
                <Link href="/login" className="text-sm font-semibold text-primary hover:underline">
                  Sign in
                </Link>
              </div>
            )}
          </div>
          <div>
            <WanderStatsGrid stats={stats} />
          </div>
        </div>
      </div>

      <div className="border-t border-border/60 bg-background/80">
        <div className="mx-auto w-full max-w-[min(100%,1920px)] px-4 sm:px-6 lg:px-10 py-10 md:py-14">
          <WanderListingSections trips={tripPackages} activities={activities} rentals={rentals} />
        </div>
      </div>
    </div>
  )
}
