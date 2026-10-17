export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getRequestAuth } from '@/lib/auth/request-session'
import { ChatSidebar } from '@/components/chat/ChatSidebar'
import { CommunityIndexDesktopRedirect } from '@/components/chat/CommunityIndexDesktopRedirect'
import { getMessagingBasePath } from '@/lib/routing/messagingBasePath'
import { TribeIndexPageFallback } from '@/components/chat/TribeIndexPageFallback'
import { MessageCircle } from 'lucide-react'

async function TribeIndexContent() {
  const { user } = await getRequestAuth()
  if (!user) redirect('/login')

  const messagingBasePath = await getMessagingBasePath()

  return (
    <div className="flex flex-col h-full min-h-0 flex-1">
      <ChatSidebar
        rooms={[]}
        pageSize={8}
        viewerUserId={user.id}
        basePath={messagingBasePath}
        className="flex md:hidden w-full flex-1 min-h-0 max-h-full border-0"
      />

      <div className="hidden md:flex flex-1 min-h-0 items-center justify-center text-foreground/80">
        <div className="text-center max-w-sm px-4">
          <MessageCircle className="h-16 w-16 mx-auto mb-4 text-primary/30" />
          <h3 className="text-lg font-bold text-foreground">Select a conversation</h3>
          <p className="text-sm text-foreground/55 mt-1">Choose from your chats on the left</p>
        </div>
      </div>
    </div>
  )
}

export default async function TribePage() {
  const messagingBasePath = await getMessagingBasePath()
  return (
    <>
      {/* Opens the last-visited room right away on desktop, before the room list resolves. */}
      <CommunityIndexDesktopRedirect roomId={null} listPath={messagingBasePath} roomPathPrefix={messagingBasePath} />
      <Suspense fallback={<TribeIndexPageFallback />}>
        <TribeIndexContent />
      </Suspense>
    </>
  )
}
