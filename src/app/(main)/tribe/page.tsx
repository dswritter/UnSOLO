export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCachedSidebarRooms } from '@/lib/chat/getSidebarRooms'
import { ChatSidebar } from '@/components/chat/ChatSidebar'
import { CommunityIndexDesktopRedirect } from '@/components/chat/CommunityIndexDesktopRedirect'
import { MessageCircle } from 'lucide-react'

export default async function TribePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { rooms, total: totalRoomCount } = await getCachedSidebarRooms(user.id, { limit: 8, offset: 0 })
  const firstRoomId = rooms[0]?.id ?? null

  return (
    <div className="flex flex-col h-full min-h-0 flex-1">
      <CommunityIndexDesktopRedirect
        roomId={firstRoomId}
        listPath="/tribe"
        roomPathPrefix="/tribe"
      />
      <ChatSidebar
        rooms={rooms}
        totalRoomCount={totalRoomCount}
        pageSize={8}
        viewerUserId={user.id}
        basePath="/tribe"
        className="flex md:hidden w-full flex-1 min-h-0 max-h-full border-0"
      />

      <div className="hidden md:flex flex-1 min-h-0 items-center justify-center text-white/80">
        <div className="text-center max-w-sm px-4">
          <MessageCircle className="h-16 w-16 mx-auto mb-4 text-[#fcba03]/30" />
          <h3 className="text-lg font-bold text-white">Select a conversation</h3>
          <p className="text-sm text-white/55 mt-1">Choose from your chats on the left</p>
        </div>
      </div>
    </div>
  )
}
