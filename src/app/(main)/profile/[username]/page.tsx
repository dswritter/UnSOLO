export const revalidate = 30 // 30 seconds

import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { ProfileV2Shell } from '@/components/profile/ProfileV2Shell'
import { getRequestAuth } from '@/lib/auth/request-session'
import type { Profile } from '@/types'
import { ProfileUsernameDetail } from './ProfileUsernameDetail'
import { ProfilePublicSkeleton } from '@/components/profile/ProfilePublicSkeleton'

type ProfileRow = Profile & {
  status_text?: string | null
  status_visibility?: string | null
  trips_private?: boolean | null
  states_private?: boolean | null
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = await params
  const { supabase, user } = await getRequestAuth()

  const [profileRes, sharePosterRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('username', username).single(),
    supabase
      .from('platform_settings')
      .select('key, value')
      .in('key', [
        'share_poster_footer_tagline',
        'share_poster_share_title',
        'share_poster_share_text',
      ]),
  ])

  const profile = profileRes.data as ProfileRow | null
  if (profileRes.error || !profile) notFound()

  const sharePosterRows = sharePosterRes.data
  const sharePosterByKey = Object.fromEntries(
    (sharePosterRows ?? []).map((r) => [r.key, r.value ?? ''])
  )
  const sharePosterFooterTagline =
    String(sharePosterByKey['share_poster_footer_tagline'] ?? '').trim() ||
    'Book treks, meet travellers, share the stoke.'
  const sharePosterShareTitle =
    String(sharePosterByKey['share_poster_share_title'] ?? '').trim() ||
    '{displayName} on UnSOLO'
  const sharePosterShareText =
    String(sharePosterByKey['share_poster_share_text'] ?? '').trim() ||
    'See my travel story on UnSOLO — {profileUrl}'

  const viewerUserId = user?.id ?? null

  return (
    <ProfileV2Shell>
      <Suspense fallback={<ProfilePublicSkeleton />}>
        <ProfileUsernameDetail
          profile={profile}
          viewerUserId={viewerUserId}
          sharePosterFooterTagline={sharePosterFooterTagline}
          sharePosterShareTitle={sharePosterShareTitle}
          sharePosterShareText={sharePosterShareText}
        />
      </Suspense>
    </ProfileV2Shell>
  )
}
