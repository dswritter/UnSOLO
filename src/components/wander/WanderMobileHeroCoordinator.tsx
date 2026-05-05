'use client'

import { useState, useCallback } from 'react'
import { ChevronRight } from 'lucide-react'
import { WanderMobileHeroSearch } from '@/components/wander/WanderMobileHeroSearch'
import { WanderMobileTabNav } from '@/components/wander/WanderMobileTabNav'
import type { WanderHeroCopy, WanderStats } from '@/lib/wander/wanderQueries'

type Tab = 'trips' | 'stays' | 'activities' | 'rentals'

const MOBILE_CTA_COPY: Record<Tab, string> = {
  trips: 'Explore Trips',
  stays: 'Find Stays',
  activities: 'Explore Activities',
  rentals: 'Find Rentals',
}

type CardState = {
  tab: Tab
  summaryLines: [string, string]
  openSheet: () => void
} | null

export function WanderMobileHeroCoordinator({
  initialTab,
  heroImageUrl,
  heroCopy,
  stats,
  userProfile,
  listedActivities,
  wanderSearchBasePath,
}: {
  initialTab?: Tab | null
  heroImageUrl: string
  heroCopy: WanderHeroCopy
  stats: Pick<WanderStats, 'destinations' | 'bookings' | 'happyPercent'>
  userProfile?: {
    id: string
    username: string
    full_name: string | null
    avatar_url: string | null
    is_host?: boolean
    role?: string | null
  } | null
  listedActivities: string[]
  wanderSearchBasePath?: '/'
}) {
  const [cardState, setCardState] = useState<CardState>(null)
  const handleCardState = useCallback((state: CardState) => setCardState(state), [])

  return (
    <>
      <div className="md:hidden">
        <WanderMobileHeroSearch
          initialTab={initialTab}
          heroImageUrl={heroImageUrl}
          heroCopy={heroCopy}
          stats={stats}
          userProfile={userProfile}
          listedActivities={listedActivities}
          wanderSearchBasePath={wanderSearchBasePath}
          onCardState={handleCardState}
        />
      </div>
      <WanderMobileTabNav />
      {cardState && (
        <div className="md:hidden px-3 pt-3 pb-1">
          <button
            type="button"
            onClick={cardState.openSheet}
            className="w-full rounded-[1.7rem] border border-white/12 bg-white/[0.06] px-4 py-4 text-left shadow-[0_18px_44px_rgba(0,0,0,0.18)] backdrop-blur-[42px] backdrop-saturate-150"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary/90">
                  {MOBILE_CTA_COPY[cardState.tab]}
                </p>
                <p className="mt-1 truncate text-base font-bold text-white">{cardState.summaryLines[0]}</p>
                <p className="mt-1 text-sm text-white/62">{cardState.summaryLines[1]}</p>
              </div>
              <span className="mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <ChevronRight className="h-4 w-4" />
              </span>
            </div>
          </button>
        </div>
      )}
    </>
  )
}
