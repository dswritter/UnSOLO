import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getRequestAuth, getRequestProfile } from '@/lib/auth/request-session'
import { EditProfileView } from '@/components/profile/EditProfileView'

export const metadata: Metadata = {
  title: 'Edit Profile — UnSOLO',
  description: 'Update your travel profile and privacy settings.',
}

export default async function EditProfilePage() {
  const { user } = await getRequestAuth()
  if (!user) redirect('/login')
  const profile = await getRequestProfile(user.id)
  if (!profile) redirect('/login')

  return <EditProfileView profileBasePath="/profile" initialProfile={profile} />
}
