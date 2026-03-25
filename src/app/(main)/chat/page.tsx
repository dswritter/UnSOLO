export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ChatLayout } from '@/components/chat/ChatLayout'
import type { Profile } from '@/types'

export default async function ChatPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()

  // Get all rooms the user is a member of
  const { data: memberRooms } = await supabase
    .from('chat_room_members')
    .select('room:chat_rooms(id, name, type, is_active, package_id, package:packages(title, images, destination:destinations(name, state)))')
    .eq('user_id', user.id)

  // Get general/community rooms
  const { data: generalRooms } = await supabase
    .from('chat_rooms')
    .select('id, name, type, is_active')
    .eq('type', 'general')
    .eq('is_active', true)

  // Build room list
  type RoomData = {
    id: string
    name: string
    type: 'trip' | 'direct' | 'general'
    lastMessage?: string
    lastMessageAt?: string
    lastMessageUserId?: string
    dmProfile?: { username: string; full_name: string | null; avatar_url: string | null; id: string }
    tripImage?: string
    tripLocation?: string
    isMember: boolean
  }

  const rooms: RoomData[] = []
  const userRooms = (memberRooms || []).map(m => m.room as unknown as Record<string, unknown>).filter(Boolean)

  // Process member rooms
  for (const room of userRooms) {
    const id = String(room['id'])
    const type = String(room['type']) as 'trip' | 'direct' | 'general'
    let name = String(room['name'] || 'Chat')
    let dmProfile: RoomData['dmProfile'] = undefined
    let tripImage: string | undefined
    let tripLocation: string | undefined

    if (type === 'direct') {
      const { data: members } = await supabase
        .from('chat_room_members')
        .select('user_id')
        .eq('room_id', id)
        .neq('user_id', user.id)
        .limit(1)

      if (members?.[0]) {
        const { data: p } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url')
          .eq('id', members[0].user_id)
          .single()
        if (p) {
          dmProfile = p
          name = p.full_name || p.username
        }
      }
    }

    if (type === 'trip') {
      const pkg = room['package'] as { title?: string; images?: string[]; destination?: { name?: string; state?: string } } | null
      if (pkg?.images?.[0]) tripImage = pkg.images[0]
      if (pkg?.destination) tripLocation = `${pkg.destination.name}, ${pkg.destination.state}`
    }

    // Get last message
    const { data: msgs } = await supabase
      .from('messages')
      .select('content, created_at, user_id')
      .eq('room_id', id)
      .order('created_at', { ascending: false })
      .limit(1)

    rooms.push({
      id,
      name,
      type,
      lastMessage: msgs?.[0]?.content,
      lastMessageAt: msgs?.[0]?.created_at,
      lastMessageUserId: msgs?.[0]?.user_id,
      dmProfile,
      tripImage,
      tripLocation,
      isMember: true,
    })
  }

  // Add general rooms user hasn't joined yet
  const memberRoomIds = new Set(rooms.map(r => r.id))
  for (const room of generalRooms || []) {
    if (!memberRoomIds.has(room.id)) {
      const { data: msgs } = await supabase
        .from('messages')
        .select('content, created_at')
        .eq('room_id', room.id)
        .order('created_at', { ascending: false })
        .limit(1)

      rooms.push({
        id: room.id,
        name: room.name,
        type: 'general',
        lastMessage: msgs?.[0]?.content,
        lastMessageAt: msgs?.[0]?.created_at,
        isMember: false,
      })
    }
  }

  // Sort: rooms with recent messages first
  rooms.sort((a, b) => {
    const aTime = a.lastMessageAt || ''
    const bTime = b.lastMessageAt || ''
    return bTime.localeCompare(aTime)
  })

  return <ChatLayout rooms={rooms} currentUser={profile as Profile} />
}
