export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSidebarRooms } from '@/lib/chat/getSidebarRooms'
import { ChatSidebar } from '@/components/chat/ChatSidebar'
import { MessageCircle } from 'lucide-react'

export default async function ChatPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const rooms = await getSidebarRooms(supabase, user.id)

  return (
    <div className="h-[calc(100dvh-64px)] flex">
      {/* Sidebar — full width on mobile, fixed width on desktop */}
      <ChatSidebar
        rooms={rooms}
        className="w-full md:w-96 md:min-w-[384px] border-r border-border"
      />

      {/* Empty state — desktop only */}
      <div className="hidden md:flex flex-1 items-center justify-center bg-secondary/10">
        <div className="text-center">
          <MessageCircle className="h-16 w-16 mx-auto mb-4 text-primary/20" />
          <h3 className="text-lg font-bold text-muted-foreground">Select a conversation</h3>
          <p className="text-sm text-muted-foreground/60 mt-1">Choose from your chats on the left</p>
        </div>
      </div>
    </div>
  )
}
