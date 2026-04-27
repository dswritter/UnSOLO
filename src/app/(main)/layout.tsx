import { getRequestAuth, getRequestProfile } from '@/lib/auth/request-session'
import { Navbar } from '@/components/layout/Navbar'
import { PresenceTracker } from '@/components/layout/PresenceTracker'
import { FooterWrapper } from '@/components/layout/FooterWrapper'
import { MobileChatButton } from '@/components/layout/MobileChatButton'
import { DeferredChatNotificationWidget } from '@/components/layout/DeferredChatNotificationWidget'
import { SignInPrompt } from '@/components/layout/SignInPrompt'
import type { Profile } from '@/types'

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let user: { id: string } | null = null
  let profile: Profile | null = null

  try {
    const { user: u } = await getRequestAuth()
    user = u
    if (u) profile = await getRequestProfile(u.id)
  } catch {
    // If Supabase is down, render page without auth
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <Navbar user={profile} />
      {/*
        h-0 + flex-1: keeps main a bounded flex slice so child routes (e.g. leaderboard) can
        use min-h-0 and scroll only the inner list instead of growing the page.
      */}
      <main className="flex h-0 min-h-0 flex-1 flex-col overflow-y-auto">
        {children}
      </main>
      {user && <PresenceTracker userId={user.id} />}
      {user ? <DeferredChatNotificationWidget userId={user.id} /> : <MobileChatButton isAuthenticated={false} />}
      <SignInPrompt isAuthenticated={!!user} />
      <FooterWrapper />
    </div>
  )
}
