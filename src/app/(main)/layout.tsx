import { getResolvedWanderShellSeason } from '@/lib/wander/wander-season-theme'
import { AuthProvider } from '@/components/layout/AuthProvider'
import { Navbar } from '@/components/layout/Navbar'
import { PresenceTracker } from '@/components/layout/PresenceTracker'
import { FooterWrapper } from '@/components/layout/FooterWrapper'
// Sticky chat button temporarily hidden — re-enable with imports below if/when needed
// import { DeferredChatNotificationWidget } from '@/components/layout/DeferredChatNotificationWidget'
// import { MobileChatButton } from '@/components/layout/MobileChatButton'
import { BottomShellNav } from '@/components/layout/BottomShellNav'
import { SignInPrompt } from '@/components/layout/SignInPrompt'
import { MainScrollContainer } from '@/components/layout/MainScrollContainer'
import { WanderThemeCrossTabSync } from '@/components/layout/WanderThemeCrossTabSync'
import { Suspense } from 'react'

/**
 * Static app shell. This layout deliberately reads NO cookies or headers, so it
 * no longer forces every child route into dynamic rendering — pages under
 * (main) are now free to be static/ISR (or stay dynamic) on their own terms.
 *
 * Auth and Android-shell detection resolve client-side (AuthProvider +
 * BottomShellNav). Revalidate hourly so the date-based wander season theme
 * (getResolvedWanderShellSeason uses `new Date()` in auto mode) stays current.
 */
export const revalidate = 3600

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let wanderShellSeason: Awaited<ReturnType<typeof getResolvedWanderShellSeason>> = 'default'
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
      <AuthProvider>
        <Navbar />
        {/*
          h-0 + flex-1: keeps main a bounded flex slice so child routes (e.g. leaderboard) can
          use min-h-0 and scroll only the inner list instead of growing the page.
        */}
        <MainScrollContainer>
          {children}
        </MainScrollContainer>
        <PresenceTracker />
        {/* Sticky chat button temporarily hidden — Meet Travellers is reachable from the bottom nav */}
        <BottomShellNav />
        <Suspense fallback={null}>
          {/* SignInPrompt uses useSearchParams → needs a Suspense boundary under static rendering. */}
          <SignInPrompt />
        </Suspense>
        <WanderThemeCrossTabSync />
        <FooterWrapper />
      </AuthProvider>
    </div>
  )
}
