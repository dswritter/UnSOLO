export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSidebarRooms } from '@/lib/chat/getSidebarRooms'
import { ChatSidebar } from '@/components/chat/ChatSidebar'
import { CommunityCrossRoomMessagePreview } from '@/components/chat/CommunityCrossRoomMessagePreview'

export default async function CommunityLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Narrow projection — avoids fetching 20+ columns we don't use here
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, full_name, avatar_url, role')
    .eq('id', user.id)
    .single()
  if (!profile) redirect('/login')

  const { rooms, total: totalRoomCount, roomNameIndex } = await getSidebarRooms(supabase, user.id, { limit: 8, offset: 0 })

  return (
    <div className="h-[calc(100dvh-64px)] flex bg-background text-foreground min-h-0 relative">
      <CommunityCrossRoomMessagePreview viewerUserId={user.id} rooms={roomNameIndex} />
      <ChatSidebar
        rooms={rooms}
        totalRoomCount={totalRoomCount}
        pageSize={8}
        viewerUserId={user.id}
        className="hidden md:flex w-96 min-w-[384px] border-r border-border shrink-0"
      />
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        {children}
      </div>
    </div>
  )
}
