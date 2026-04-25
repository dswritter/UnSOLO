import { getCachedSidebarRooms } from '@/lib/chat/getSidebarRooms'
import { CommunityCrossRoomMessagePreview } from '@/components/chat/CommunityCrossRoomMessagePreview'
import { ChatSidebar } from '@/components/chat/ChatSidebar'

export async function CommunitySidebarSection({ userId }: { userId: string }) {
  const { rooms, total: totalRoomCount, roomNameIndex } = await getCachedSidebarRooms(userId, { limit: 8, offset: 0 })
  return (
    <>
      <CommunityCrossRoomMessagePreview viewerUserId={userId} rooms={roomNameIndex} />
      <ChatSidebar
        rooms={rooms}
        totalRoomCount={totalRoomCount}
        pageSize={8}
        viewerUserId={userId}
        className="hidden md:flex w-96 min-w-[384px] border-r border-border shrink-0"
      />
    </>
  )
}
