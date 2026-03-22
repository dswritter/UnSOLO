import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ChatWindow } from '@/components/chat/ChatWindow'
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

  if (!membership && room.type !== 'general') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-4">
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

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col">
      <div className="px-4 py-2 border-b border-border flex items-center gap-3">
        <Link href="/chat" className="text-muted-foreground hover:text-white transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="font-bold text-sm">{room.name}</h1>
          {(room as { package?: { title: string; destination?: { name: string; state: string } } }).package && (
            <p className="text-xs text-muted-foreground">
              {(room as { package: { title: string; destination?: { name: string; state: string } } }).package.title}
            </p>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <ChatWindow
          roomId={roomId}
          roomName={room.name}
          initialMessages={(msgs || []) as Message[]}
          currentUser={profile as Profile}
        />
      </div>
    </div>
  )
}
