import { ProfileV2Shell } from '@/components/profile/ProfileV2Shell'
import { ProfileEditSkeleton } from '@/components/profile/ProfileEditSkeleton'

/** `/profile` — edit profile layout */
export default function ProfileEditLoading() {
  return (
    <ProfileV2Shell>
      <ProfileEditSkeleton />
    </ProfileV2Shell>
  )
}
