import { AuthV2Shell } from '@/components/auth/v2/AuthV2Shell'
import { LoginV2Form } from '@/components/auth/v2/LoginV2Form'
import { getWanderRatingHero, getWanderStats } from '@/lib/wander/wanderQueries'

export const revalidate = 300

export default async function LoginPage() {
  const [stats, rating] = await Promise.all([getWanderStats(), getWanderRatingHero()])

  return (
    <AuthV2Shell mode="login" stats={stats} rating={rating}>
      <LoginV2Form />
    </AuthV2Shell>
  )
}
