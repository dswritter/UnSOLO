import { getCachedSidebarRooms } from '@/lib/chat/getSidebarRooms'
import { CommunityCrossRoomMessagePreview } from '@/components/chat/CommunityCrossRoomMessagePreview'
import { ChatSidebar } from '@/components/chat/ChatSidebar'
import { cn } from '@/lib/utils'
import { headers } from 'next/headers'

export async function CommunitySidebarSection({
  userId,
  basePath = '/community',
  className,
}: {
  userId: string
  basePath?: string
  className?: string
}) {
  const [all, requestHeaders] = await Promise.all([
    getCachedSidebarRooms(userId, { limit: Number.MAX_SAFE_INTEGER, offset: 0 }),
    headers(),
  ])
  const activeRoomId = requestHeaders.get('x-unsolo-pathname')?.match(/^\/(?:community|tribe)\/([0-9a-f-]{36})(?:\/|$)/i)?.[1] ?? null
  const { total: totalRoomCount, roomNameIndex, pinnedRoomIds } = all
  const rooms = all.rooms.slice(0, 8)
  return (
    <>
      <CommunityCrossRoomMessagePreview viewerUserId={userId} rooms={roomNameIndex} basePath={basePath} />
      <ChatSidebar
        rooms={rooms}
        initialActiveRoom={all.rooms.find(room => room.id === activeRoomId) ?? null}
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
