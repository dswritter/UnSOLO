export const dynamic = 'force-dynamic'

import type { ReactNode } from 'react'
import { Suspense } from 'react'
import { Plus_Jakarta_Sans } from 'next/font/google'
import { redirect } from 'next/navigation'
import { getRequestAuth } from '@/lib/auth/request-session'
import { CommunitySidebarSection } from '@/components/chat/CommunitySidebarSection'
import { TribeMessageCacheBootstrap } from '@/components/chat/TribeMessageCacheBootstrap'
import { getCachedSidebarRooms } from '@/lib/chat/getSidebarRooms'
import { MobileChatBottomBar } from '@/components/chat/MobileChatBottomBar'
import { getMessagingBasePath } from '@/lib/routing/messagingBasePath'
import { TribeSidebarSkeleton } from '@/components/chat/TribeSidebarSkeleton'
import { TribeMessagingContainer } from '@/components/chat/TribeMessagingContainer'
import { cn } from '@/lib/utils'

const tribeSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-wander',
})

/**
 * /tribe — same chat behavior as /community, with Wander’s forest + gold theme (no extra mockup left rail).
 */
/** Streams the recent-rooms strip so the chat shell never waits on the room list. */
async function MobileChatBottomBarServer({ userId, basePath }: { userId: string; basePath: string }) {
  const { rooms } = await getCachedSidebarRooms(userId, { limit: 12, offset: 0 })
  return <MobileChatBottomBar rooms={rooms} basePath={basePath} />
}

export default async function TribeLayout({ children }: { children: ReactNode }) {
  const { user } = await getRequestAuth()
  if (!user) redirect('/login')

  const messagingBasePath = await getMessagingBasePath()

  return (
    <div
      className={cn(
        'wander-theme wander-textured min-h-full w-full flex',
        tribeSans.variable,
      )}
    >
      <TribeMessageCacheBootstrap />
      <TribeMessagingContainer>
        <Suspense fallback={<TribeSidebarSkeleton layout="desktop" />}>
          <CommunitySidebarSection
            userId={user.id}
            basePath={messagingBasePath}
            className="max-h-[min(100dvh-5.5rem,56rem)] border-foreground/10 rounded-2xl overflow-hidden wander-frost-panel"
          />
        </Suspense>
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-clip rounded-2xl border border-foreground/12 bg-[color:var(--wander-inset-panel)] backdrop-blur-[44px] backdrop-saturate-[1.65]">
          {children}
        </div>
      </TribeMessagingContainer>
      <Suspense fallback={null}>
        <MobileChatBottomBarServer userId={user.id} basePath={messagingBasePath} />
      </Suspense>
    </div>
  )
}
