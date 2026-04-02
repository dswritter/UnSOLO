export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSidebarRooms } from '@/lib/chat/getSidebarRooms'
import { ChatHub } from '@/components/chat/ChatHub'
import type { Profile } from '@/types'

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string }>
}) {
  const { room: initialRoomId } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile) redirect('/login')

  const rooms = await getSidebarRooms(supabase, user.id)

  return (
    <ChatHub
      initialRooms={rooms}
      currentUser={profile as Profile}
      initialRoomId={initialRoomId || null}
    />
  )
}
