import { ProfileV2Shell } from '@/components/profile/ProfileV2Shell'
import { ProfileV2Skeleton } from '@/components/profile/ProfileV2Skeleton'

export default function ProfileLoading() {
  return (
    <ProfileV2Shell>
      <ProfileV2Skeleton />
    </ProfileV2Shell>
  )
}
