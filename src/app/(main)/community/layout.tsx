export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSidebarRooms } from '@/lib/chat/getSidebarRooms'
import { ChatSidebar } from '@/components/chat/ChatSidebar'
import { ChatPageClient } from '@/components/chat/ChatPageClient'
import { MobileChatView } from '@/components/chat/MobileChatView'
import type { Profile } from '@/types'

export default async function CommunityLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile) redirect('/login')

  const rooms = await getSidebarRooms(supabase, user.id)

  return (
    <div className="h-[calc(100dvh-64px)] flex bg-background text-foreground">
      {/* Desktop: sidebar + client-side chat */}
      <ChatSidebar
        rooms={rooms}
        className="hidden md:flex w-96 min-w-[384px] border-r border-border"
      />
      <div className="hidden md:flex flex-1 flex-col min-w-0">
        <ChatPageClient currentUser={profile as Profile} />
      </div>

      {/* Mobile: full client-side with sidebar/chat toggle */}
      <div className="flex md:hidden flex-1 flex-col min-w-0">
        <MobileChatView rooms={rooms} currentUser={profile as Profile} />
      </div>
    </div>
  )
}
