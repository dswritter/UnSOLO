import { AuthV2Shell } from '@/components/auth/v2/AuthV2Shell'
import { SignupV2Form } from '@/components/auth/v2/SignupV2Form'
import { getWanderRatingHero, getWanderStats } from '@/lib/wander/wanderQueries'

export const revalidate = 300

export default async function SignupPage() {
  const [stats, rating] = await Promise.all([getWanderStats(), getWanderRatingHero()])

  return (
    <AuthV2Shell mode="signup" stats={stats} rating={rating}>
      <SignupV2Form />
    </AuthV2Shell>
  )
}
