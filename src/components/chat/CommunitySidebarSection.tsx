import { getCachedSidebarRooms } from '@/lib/chat/getSidebarRooms'
import { CommunityCrossRoomMessagePreview } from '@/components/chat/CommunityCrossRoomMessagePreview'
import { ChatSidebar } from '@/components/chat/ChatSidebar'
import { cn } from '@/lib/utils'

export async function CommunitySidebarSection({
  userId,
  basePath = '/community',
  className,
}: {
  userId: string
  basePath?: string
  className?: string
}) {
  const { rooms, total: totalRoomCount, roomNameIndex, pinnedRoomIds } = await getCachedSidebarRooms(userId, { limit: 8, offset: 0 })
  return (
    <>
      <CommunityCrossRoomMessagePreview viewerUserId={userId} rooms={roomNameIndex} basePath={basePath} />
      <ChatSidebar
        rooms={rooms}
        totalRoomCount={totalRoomCount}
        pinnedRoomIds={pinnedRoomIds}
        pageSize={8}
        viewerUserId={userId}
        basePath={basePath}
        className={cn('hidden md:flex w-96 min-w-[384px] border-r border-border shrink-0', className)}
      />
    </>
  )
}
