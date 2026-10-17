import { ChatSidebar } from '@/components/chat/ChatSidebar'
import { cn } from '@/lib/utils'

export function CommunitySidebarSection({
  userId,
  basePath = '/community',
  className,
}: {
  userId: string
  basePath?: string
  className?: string
}) {
  return (
      <ChatSidebar
        rooms={[]}
        autoOpenRecent
        showCrossRoomPreview
        pageSize={8}
        viewerUserId={userId}
        basePath={basePath}
        className={cn('hidden md:flex w-96 min-w-[384px] border-r border-border shrink-0', className)}
      />
  )
}
