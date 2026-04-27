import type { Metadata } from 'next'
import { EditProfileView } from '@/components/profile/EditProfileView'

export const metadata: Metadata = {
  title: 'Edit Profile — UnSOLO',
  description: 'Update your travel profile and privacy settings.',
}

export default function ProfileV2EditPage() {
  return <EditProfileView theme="v2" profileBasePath="/profile_v2" />
}
