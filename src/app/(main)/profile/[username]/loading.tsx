import { ProfileV2Shell } from '@/components/profile/ProfileV2Shell'
import { ProfilePublicSkeleton } from '@/components/profile/ProfilePublicSkeleton'

/** `/profile/[username]` — public profile layout */
export default function ProfileUsernameRouteLoading() {
  return (
    <ProfileV2Shell>
      <ProfilePublicSkeleton />
    </ProfileV2Shell>
  )
}
