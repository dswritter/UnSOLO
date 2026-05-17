import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getRequestAuth, getRequestProfile } from '@/lib/auth/request-session'
import { EditProfileView } from '@/components/profile/EditProfileView'
import { AndroidProfileHub } from '@/components/profile/AndroidProfileHub'

export const metadata: Metadata = {
  title: 'Profile — UnSOLO',
  description: 'Your UnSOLO profile and settings.',
}

export default async function ProfilePage() {
  const { user } = await getRequestAuth()
  if (!user) redirect('/login')
  const profile = await getRequestProfile(user.id)
  if (!profile) redirect('/login')

  const ua = (await headers()).get('user-agent') ?? ''
  const isAndroidShell = ua.includes('UnsoloAndroid')

  if (isAndroidShell) {
    return <AndroidProfileHub profile={profile} />
  }

  return <EditProfileView profileBasePath="/profile" initialProfile={profile} />
}
