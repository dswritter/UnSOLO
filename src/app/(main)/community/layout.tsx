export const dynamic = 'force-dynamic'

import type { ReactNode } from 'react'
import { Suspense } from 'react'
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

/** /community — Messages: trip groups, plan groups, community rooms and DMs. */
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
    <div className={cn('wander-theme min-h-full w-full flex bg-[color:var(--pc-paper)]')}>
      <TribeMessageCacheBootstrap />
      <TribeMessagingContainer>
        <Suspense fallback={<TribeSidebarSkeleton layout="desktop" />}>
          <CommunitySidebarSection
            userId={user.id}
            basePath={messagingBasePath}
            className="max-h-[min(100dvh-5.5rem,56rem)] overflow-hidden rounded-[var(--pc-radius-card)] border border-[color:var(--pc-rule)] bg-[color:var(--pc-raised)]"
          />
        </Suspense>
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-clip md:rounded-[var(--pc-radius-card)] md:border md:border-[color:var(--pc-rule)] bg-[color:var(--pc-paper)]">
          {children}
        </div>
      </TribeMessagingContainer>
      <Suspense fallback={null}>
        <MobileChatBottomBarServer userId={user.id} basePath={messagingBasePath} />
      </Suspense>
    </div>
  )
}
