export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSidebarRooms } from '@/lib/chat/getSidebarRooms'
import { ChatSidebar } from '@/components/chat/ChatSidebar'
import { ChatPageClient } from '@/components/chat/ChatPageClient'
import type { Profile } from '@/types'

export default async function CommunityLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ roomId?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile) redirect('/login')

  const rooms = await getSidebarRooms(supabase, user.id)

  return (
    <div className="h-[calc(100dvh-64px)] flex">
      {/* Sidebar */}
      <ChatSidebar
        rooms={rooms}
        className="hidden md:flex w-96 min-w-[384px] border-r border-border"
      />

      {/* Desktop: client-side chat area (instant switching) */}
      <div className="hidden md:flex flex-1 flex-col min-w-0">
        <ChatPageClient currentUser={profile as Profile} />
      </div>

      {/* Mobile: use server-rendered pages for proper back navigation */}
      <div className="flex md:hidden flex-1 flex-col min-w-0">
        {children}
      </div>
    </div>
  )
}
