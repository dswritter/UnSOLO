export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSidebarRooms } from '@/lib/chat/getSidebarRooms'
import { ChatSidebar } from '@/components/chat/ChatSidebar'
import { NotificationPrompt } from '@/components/chat/NotificationPrompt'

export default async function CommunityLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const rooms = await getSidebarRooms(supabase, user.id)

  return (
    <div className="h-[calc(100dvh-64px)] flex">
      {/* Sidebar — persists across /community and /community/[roomId] */}
      <ChatSidebar
        rooms={rooms}
        className="hidden md:flex w-96 min-w-[384px] border-r border-border"
      />
      {/* Page content — swapped by Next.js without re-rendering sidebar */}
      <div className="flex-1 flex flex-col min-w-0">
        <NotificationPrompt />
        {children}
      </div>
    </div>
  )
}
