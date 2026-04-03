export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
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

  const { data: membership } = await supabase
    .from('chat_room_members')
    .select('id')
    .eq('room_id', roomId)
    .eq('user_id', user.id)
    .single()

  if (!membership && room.type === 'direct') {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <MessageCircle className="h-12 w-12 text-primary/40 mx-auto" />
          <h2 className="text-xl font-bold">Private Conversation</h2>
          <p className="text-muted-foreground text-sm">You don&apos;t have access to this chat.</p>
          <Button asChild className="bg-primary text-black"><Link href="/community">Back</Link></Button>
        </div>
      </div>
    )
  }

  if (!membership && room.type !== 'general' && room.type !== 'direct') {
    // Check if user has a booking for this trip (they may have left the chat)
    const { data: hasBooking } = await supabase
      .from('bookings')
      .select('id')
      .eq('user_id', user.id)
      .eq('package_id', room.package_id)
      .in('status', ['confirmed', 'completed'])
      .limit(1)
      .single()

    if (hasBooking) {
      // User left the chat but has a booking — show rejoin option
      return (
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center space-y-4">
            <MessageCircle className="h-12 w-12 text-primary/40 mx-auto" />
            <h2 className="text-xl font-bold">You left this chat</h2>
            <p className="text-muted-foreground text-sm">Rejoin to see new messages and participate.</p>
            <form action={async () => { 'use server'; await joinRoom(roomId) }}>
              <Button type="submit" className="bg-primary text-black">Rejoin Chat</Button>
            </form>
          </div>
        </div>
      )
    }

    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <MessageCircle className="h-12 w-12 text-primary/40 mx-auto" />
          <h2 className="text-xl font-bold">Trip-only Chat</h2>
          <p className="text-muted-foreground text-sm">Book this trip to join the chat.</p>
          <Button asChild className="bg-primary text-black"><Link href="/explore">Browse Trips</Link></Button>
        </div>
      </div>
    )
  }

  if (!membership && room.type === 'general') {
    await joinRoom(roomId)
  }

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

  let displayName = room.name
  if (room.type === 'direct') {
    const other = memberProfiles.find(m => m.id !== user.id)
    if (other) displayName = other.full_name || other.username
  }

  return (
    <ChatWindow
      roomId={roomId}
      roomName={displayName}
      roomType={room.type as 'trip' | 'general' | 'direct'}
      initialMessages={(msgs || []) as Message[]}
      currentUser={profile as Profile}
      memberProfiles={memberProfiles}
    />
  )
}
