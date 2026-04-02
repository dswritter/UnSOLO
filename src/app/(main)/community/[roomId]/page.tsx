export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSidebarRooms } from '@/lib/chat/getSidebarRooms'
import { ChatSidebar } from '@/components/chat/ChatSidebar'
import { ChatWindow, type ChatMemberProfile } from '@/components/chat/ChatWindow'
import { joinRoom } from '@/actions/chat'
import { Button } from '@/components/ui/button'
import { MessageCircle } from 'lucide-react'
import Link from 'next/link'
import type { Message, Profile } from '@/types'

export default async function CommunityRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>
}) {
  const { roomId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: room } = await supabase
    .from('chat_rooms')
    .select('*, package:packages(title, destination:destinations(name, state))')
    .eq('id', roomId)
    .eq('is_active', true)
    .single()

  if (!room) notFound()

  // Check membership
  const { data: membership } = await supabase
    .from('chat_room_members')
    .select('id')
    .eq('room_id', roomId)
    .eq('user_id', user.id)
    .single()

  if (!membership && room.type === 'direct') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <MessageCircle className="h-12 w-12 text-primary/40 mx-auto" />
          <h2 className="text-xl font-bold">Private Conversation</h2>
          <p className="text-muted-foreground text-sm">You don&apos;t have access to this chat.</p>
          <Button asChild className="bg-primary text-black"><Link href="/community">Back to Chats</Link></Button>
        </div>
      </div>
    )
  }

  if (!membership && room.type !== 'general' && room.type !== 'direct') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <MessageCircle className="h-12 w-12 text-primary/40 mx-auto" />
          <h2 className="text-xl font-bold">Trip-only Chat Room</h2>
          <p className="text-muted-foreground text-sm">You need to book this trip to access the chat.</p>
          <Button asChild className="bg-primary text-black"><Link href="/explore">Browse Trips</Link></Button>
        </div>
      </div>
    )
  }

  if (!membership && room.type === 'general') {
    await joinRoom(roomId)
  }

  // Fetch messages + profile + members
  const [{ data: msgs }, { data: profile }, { data: members }] = await Promise.all([
    supabase.from('messages').select('*, user:profiles(id, username, full_name, avatar_url)').eq('room_id', roomId).order('created_at', { ascending: true }).limit(100),
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('chat_room_members').select('user_id').eq('room_id', roomId),
  ])

  if (!profile) redirect('/login')

  const memberIds = (members || []).map(m => m.user_id).filter(Boolean)
  let memberProfiles: ChatMemberProfile[] = []
  if (memberIds.length > 0) {
    const [{ data: profiles }, { data: phoneRequests }] = await Promise.all([
      supabase.from('profiles').select('id, username, full_name, avatar_url, bio, phone_number, phone_public').in('id', memberIds),
      supabase.from('phone_requests').select('target_id, status').eq('requester_id', user.id).in('target_id', memberIds),
    ])
    const requestMap = new Map((phoneRequests || []).map(r => [r.target_id, r.status]))
    memberProfiles = (profiles || []).map(p => ({ ...p, phone_request_status: requestMap.get(p.id) || null })) as ChatMemberProfile[]
  }

  // Resolve display name
  let displayName = room.name
  if (room.type === 'direct') {
    const other = memberProfiles.find(m => m.id !== user.id)
    if (other) displayName = other.full_name || other.username
  }

  // Sidebar rooms
  const sidebarRooms = await getSidebarRooms(supabase, user.id)

  return (
    <div className="h-[calc(100dvh-64px)] flex">
      {/* Desktop sidebar */}
      <ChatSidebar
        rooms={sidebarRooms}
        activeRoomId={roomId}
        className="hidden md:flex w-96 min-w-[384px] border-r border-border"
      />

      {/* Chat window */}
      <div className="flex-1 flex flex-col min-w-0">
        <ChatWindow
          roomId={roomId}
          roomName={displayName}
          roomType={room.type as 'trip' | 'general' | 'direct'}
          initialMessages={(msgs || []) as Message[]}
          currentUser={profile as Profile}
          memberProfiles={memberProfiles}
        />
      </div>
    </div>
  )
}
