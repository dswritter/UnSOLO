import type { Metadata } from 'next'
import { AuthV2Shell } from '@/components/auth/v2/AuthV2Shell'
import { SignupV2Form } from '@/components/auth/v2/SignupV2Form'
import { getWanderRatingHero, getWanderStats } from '@/lib/wander/wanderQueries'

export const metadata: Metadata = {
  title: 'Sign up (preview) — UnSOLO',
  description: 'Preview of the upcoming sign-up experience. The current live page remains at /signup.',
  robots: { index: false, follow: false },
}

export const revalidate = 120

export default async function SignupV2Page() {
  const [stats, ratingHero] = await Promise.all([getWanderStats(), getWanderRatingHero()])
  const rating = { overall: ratingHero.overall, reviewCount: ratingHero.reviewCount }

  return (
    <AuthV2Shell mode="signup" stats={stats} rating={rating}>
      <SignupV2Form />
    </AuthV2Shell>
  )
}
