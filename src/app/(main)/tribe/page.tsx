import type { Metadata } from 'next'
import { getFeedPage } from '@/lib/tribe/server'
import { getRequestProfile } from '@/lib/auth/request-session'
import { toUserLite } from '@/lib/tribe/models'
import { FeedClient } from '@/components/tribe/FeedClient'
import { LandingPrompt } from '@/components/tribe/LandingPrompt'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Tribe — plans, stories and asks from travellers · UnSOLO',
  description: 'Find people going your way. Community plans, trip stories and questions from India’s solo travellers.',
}

export default async function TribePage({ searchParams }: { searchParams: Promise<{ place?: string }> }) {
  const { place: rawPlace } = await searchParams
  const place = rawPlace && /^[a-z0-9-]{1,60}$/.test(rawPlace) ? rawPlace : undefined
  const page = await getFeedPage(undefined, place)
  // Your face for "Your story" on the rail and the desktop composer prompt.
  const profile = page.viewerId ? await getRequestProfile(page.viewerId).catch(() => null) : null
  const me = profile ? toUserLite(profile as unknown as Record<string, unknown>) : null
  return (
    <>
      <FeedClient place={place} initial={page.posts} nextDepartures={page.nextDepartures} signedIn={page.signedIn} demo={page.demo} me={me} />
      <LandingPrompt tab="tribe" signedIn={page.signedIn} />
    </>
  )
}
