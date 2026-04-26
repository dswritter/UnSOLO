import type { Metadata } from 'next'
import { AuthV2Shell } from '@/components/auth/v2/AuthV2Shell'
import { LoginV2Form } from '@/components/auth/v2/LoginV2Form'
import { getWanderRatingHero, getWanderStats } from '@/lib/wander/wanderQueries'

export const metadata: Metadata = {
  title: 'Log in (preview) — UnSOLO',
  description: 'Preview of the upcoming sign-in experience. The current live page remains at /login.',
  robots: { index: false, follow: false },
}

export const revalidate = 120

export default async function LoginV2Page() {
  const [stats, ratingHero] = await Promise.all([getWanderStats(), getWanderRatingHero()])
  const rating = { overall: ratingHero.overall, reviewCount: ratingHero.reviewCount }

  return (
    <AuthV2Shell mode="login" stats={stats} rating={rating}>
      <LoginV2Form />
    </AuthV2Shell>
  )
}
