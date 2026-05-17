import { headers } from 'next/headers'
import { getRequestAuth, getRequestProfile } from '@/lib/auth/request-session'
import { getResolvedWanderShellSeason } from '@/lib/wander/wander-season-theme'
import { Navbar } from '@/components/layout/Navbar'
import { PresenceTracker } from '@/components/layout/PresenceTracker'
import { FooterWrapper } from '@/components/layout/FooterWrapper'
// Sticky chat button temporarily hidden — re-enable with imports below if/when needed
// import { DeferredChatNotificationWidget } from '@/components/layout/DeferredChatNotificationWidget'
// import { MobileChatButton } from '@/components/layout/MobileChatButton'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import { SignInPrompt } from '@/components/layout/SignInPrompt'
import { MainScrollContainer } from '@/components/layout/MainScrollContainer'
import { WanderThemeCrossTabSync } from '@/components/layout/WanderThemeCrossTabSync'
import { AndroidNavBadge } from '@/components/layout/AndroidNavBadge'
import type { Profile } from '@/types'
import { Suspense } from 'react'

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const ua = (await headers()).get('user-agent') ?? ''
  const isAndroidShell = ua.includes('UnsoloAndroid')

  let user: { id: string } | null = null
  let profile: Profile | null = null
  let wanderShellSeason: Awaited<ReturnType<typeof getResolvedWanderShellSeason>> = 'default'

  try {
    const { user: u } = await getRequestAuth()
    user = u
    if (u) profile = await getRequestProfile(u.id)
  } catch {
    // If Supabase is down, render page without auth
  }

  try {
    wanderShellSeason = await getResolvedWanderShellSeason()
  } catch {
    wanderShellSeason = 'default'
  }

  return (
    <div
      data-wander-shell-season={wanderShellSeason}
      className="flex min-h-dvh flex-col bg-background text-foreground"
    >
      <Navbar user={profile} />
      {/*
        h-0 + flex-1: keeps main a bounded flex slice so child routes (e.g. leaderboard) can
        use min-h-0 and scroll only the inner list instead of growing the page.
      */}
      <MainScrollContainer>
        {children}
      </MainScrollContainer>
      {user && <PresenceTracker userId={user.id} />}
      {/* Sticky chat button temporarily hidden — Meet Travellers is reachable from the bottom nav */}
      {/* {user ? <DeferredChatNotificationWidget userId={user.id} /> : <MobileChatButton isAuthenticated={false} />} */}
      {!isAndroidShell && <MobileBottomNav isHost={!!profile?.is_host} userId={user?.id ?? null} />}
      {isAndroidShell && user && <AndroidNavBadge userId={user.id} />}
      <Suspense fallback={null}>
        <SignInPrompt isAuthenticated={!!user} />
      </Suspense>
      <WanderThemeCrossTabSync />
      <FooterWrapper />
    </div>
  )
}
