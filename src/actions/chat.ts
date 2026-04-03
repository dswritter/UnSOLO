'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function sendMessage(roomId: string, content: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Check membership
  const { data: member } = await supabase
    .from('chat_room_members')
    .select('id')
    .eq('room_id', roomId)
    .eq('user_id', user.id)
    .single()

  if (!member) {
    // Auto-join general rooms
    const { data: room } = await supabase
      .from('chat_rooms')
      .select('type')
      .eq('id', roomId)
      .single()

    if (room?.type !== 'general') {
      return { error: 'Not a member of this room' }
    }

    await supabase.from('chat_room_members').insert({ room_id: roomId, user_id: user.id })
  }

  const { error } = await supabase.from('messages').insert({
    room_id: roomId,
    user_id: user.id,
    content,
    message_type: 'text',
  })

  if (error) return { error: error.message }

  revalidatePath(`/chat/${roomId}`)
  return { success: true }
}

export async function joinRoom(roomId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Check if already a member
  const { data: existing } = await supabase
    .from('chat_room_members')
    .select('id')
    .eq('room_id', roomId)
    .eq('user_id', user.id)
    .single()

  const { error } = await supabase
    .from('chat_room_members')
    .upsert({ room_id: roomId, user_id: user.id })

  if (error) return { error: error.message }

  // Send system message if this is a new join (not already a member)
  if (!existing) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('username, full_name')
      .eq('id', user.id)
      .single()

    const name = profile?.full_name || profile?.username || 'Someone'
    const username = profile?.username || 'user'

    await supabase.from('messages').insert({
      room_id: roomId,
      user_id: null,
      content: `${name} (@${username}) has joined the chat`,
      message_type: 'system',
    })
  }

  revalidatePath(`/community/${roomId}`)
  return { success: true }
}

export async function getMyRooms() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('chat_room_members')
    .select('room:chat_rooms(*, package:packages(title, destination:destinations(name, state)))')
    .eq('user_id', user.id)

  return data?.map((d) => d.room).filter(Boolean) || []
}
