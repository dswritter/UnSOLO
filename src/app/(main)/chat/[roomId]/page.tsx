import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ChatWindow, type ChatMemberProfile } from '@/components/chat/ChatWindow'
import { joinRoom } from '@/actions/chat'
import { Button } from '@/components/ui/button'
import { ArrowLeft, MessageCircle } from 'lucide-react'
import Link from 'next/link'
import type { Message, Profile } from '@/types'

export default async function ChatRoomPage({
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

  // Check / auto-join general rooms
  const { data: membership } = await supabase
    .from('chat_room_members')
    .select('id')
    .eq('room_id', roomId)
    .eq('user_id', user.id)
    .single()

  // For DM rooms, allow access if user is a member (membership checked above)
  if (!membership && room.type === 'direct') {
    // DM room but user is not a member — shouldn't happen, but handle gracefully
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <MessageCircle className="h-12 w-12 text-primary/40 mx-auto" />
          <h2 className="text-xl font-bold">Private Conversation</h2>
          <p className="text-muted-foreground text-sm">You don&apos;t have access to this chat.</p>
          <Button asChild className="bg-primary text-black">
            <Link href="/chat">Back to Chats</Link>
          </Button>
        </div>
      </div>
    )
  }

  if (!membership && room.type !== 'general' && room.type !== 'direct') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <MessageCircle className="h-12 w-12 text-primary/40 mx-auto" />
          <h2 className="text-xl font-bold">Trip-only Chat Room</h2>
          <p className="text-muted-foreground text-sm">You need to book this trip to access the chat.</p>
          <Button asChild className="bg-primary text-black">
            <Link href="/explore">Browse Trips</Link>
          </Button>
        </div>
      </div>
    )
  }

  // Auto-join general rooms
  if (!membership && room.type === 'general') {
    await joinRoom(roomId)
  }

  // Fetch initial messages
  const { data: msgs } = await supabase
    .from('messages')
    .select('*, user:profiles(id, username, full_name, avatar_url)')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true })
    .limit(100)

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  // Fetch all room members with profile info + phone visibility
  const { data: members } = await supabase
    .from('chat_room_members')
    .select('user_id')
    .eq('room_id', roomId)

  const memberIds = (members || []).map(m => m.user_id).filter(Boolean)

  let memberProfiles: ChatMemberProfile[] = []
  if (memberIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url, bio, phone_number, phone_public')
      .in('id', memberIds)

    // Get phone request statuses for current user
    const { data: phoneRequests } = await supabase
      .from('phone_requests')
      .select('target_id, status')
      .eq('requester_id', user.id)
      .in('target_id', memberIds)

    const requestMap = new Map((phoneRequests || []).map(r => [r.target_id, r.status]))

    memberProfiles = (profiles || []).map(p => ({
      ...p,
      phone_request_status: requestMap.get(p.id) || null,
    })) as ChatMemberProfile[]
  }

  // For DM rooms, resolve the other user's name
  let displayName = room.name
  if (room.type === 'direct') {
    const otherMember = memberProfiles.find(m => m.id !== user.id)
    if (otherMember) {
      displayName = otherMember.full_name || otherMember.username
    }
  }

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col">
      <div className="px-4 py-2 border-b border-border flex items-center gap-3">
        <Link href="/chat" className="text-muted-foreground hover:text-white transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="font-bold text-sm">{displayName}</h1>
          {room.type === 'direct' ? (
            <p className="text-xs text-muted-foreground">Direct Message</p>
          ) : (room as { package?: { title: string; destination?: { name: string; state: string } } }).package && (
            <p className="text-xs text-muted-foreground">
              {(room as { package: { title: string; destination?: { name: string; state: string } } }).package.title}
            </p>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-hidden relative">
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
