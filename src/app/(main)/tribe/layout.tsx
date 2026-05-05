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
import { cn } from '@/lib/utils'

const tribeSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-wander',
})

/**
 * /tribe — same chat behavior as /community, with Wander’s forest + gold theme (no extra mockup left rail).
 */
export default async function TribeLayout({ children }: { children: ReactNode }) {
  const { user } = await getRequestAuth()
  if (!user) redirect('/login')

  const messagingBasePath = await getMessagingBasePath()

  // For the mobile chat bottom bar — recent rooms (avatar strip).
  const { rooms } = await getCachedSidebarRooms(user.id, { limit: 12, offset: 0 })

  return (
    <div
      className={cn(
        'wander-theme wander-textured min-h-full w-full [color-scheme:dark] flex',
        tribeSans.variable,
      )}
    >
      <TribeMessageCacheBootstrap />
      <div className="tribe-messaging-ui h-[calc(100dvh-4rem)] flex flex-1 min-h-0 min-w-0 text-foreground relative px-2 sm:px-4 py-2 md:py-3 gap-3 md:gap-4 max-w-[1920px] mx-auto w-full">
        <Suspense fallback={<TribeSidebarSkeleton layout="desktop" />}>
          <CommunitySidebarSection
            userId={user.id}
            basePath={messagingBasePath}
            className="max-h-[min(100dvh-5.5rem,56rem)] border-white/10 rounded-2xl overflow-hidden wander-frost-panel"
          />
        </Suspense>
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-clip rounded-2xl border border-white/12 bg-[color:var(--wander-inset-panel)] backdrop-blur-[44px] backdrop-saturate-[1.65]">
          {children}
        </div>
      </div>
      <MobileChatBottomBar rooms={rooms} basePath={messagingBasePath} />
    </div>
  )
}
