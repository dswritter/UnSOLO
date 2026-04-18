'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { userHasTripChatAccess } from '@/lib/chat/tripChatAccess'
import { assertMessageSendRateLimit } from '@/lib/server-rate-limit'

export async function sendMessage(roomId: string, content: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const rate = await assertMessageSendRateLimit(supabase, user.id)
  if (rate.error) return { error: rate.error }

  // Check membership
  const { data: member } = await supabase
    .from('chat_room_members')
    .select('id')
    .eq('room_id', roomId)
    .eq('user_id', user.id)
    .single()

  if (!member) {
    return { error: 'Join this chat before sending messages' }
  }

  const { error } = await supabase.from('messages').insert({
    room_id: roomId,
    user_id: user.id,
    content,
    message_type: 'text',
  })

  if (error) return { error: error.message }

  revalidatePath('/community', 'layout')
  revalidatePath(`/community/${roomId}`)
  return { success: true }
}

const EDIT_WINDOW_MS = 60 * 60 * 1000

export async function editMessage(messageId: string, roomId: string, content: string) {
  const trimmed = content.trim()
  if (!trimmed) return { error: 'Message cannot be empty' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: member } = await supabase
    .from('chat_room_members')
    .select('id')
    .eq('room_id', roomId)
    .eq('user_id', user.id)
    .single()

  if (!member) return { error: 'Not a member of this chat' }

  const { data: row, error: fetchErr } = await supabase
    .from('messages')
    .select('id, user_id, room_id, message_type, created_at')
    .eq('id', messageId)
    .single()

  if (fetchErr || !row) return { error: 'Message not found' }
  if (row.user_id !== user.id) return { error: 'You can only edit your own messages' }
  if (row.room_id !== roomId) return { error: 'Invalid room' }
  if (row.message_type !== 'text') return { error: 'Only text messages can be edited' }

  const created = new Date(row.created_at).getTime()
  if (Number.isFinite(created) && Date.now() - created > EDIT_WINDOW_MS) {
    return { error: 'This message is too old to edit' }
  }

  const { error } = await supabase
    .from('messages')
    .update({ content: trimmed, is_edited: true })
    .eq('id', messageId)

  if (error) return { error: error.message }

  revalidatePath('/community', 'layout')
  revalidatePath(`/community/${roomId}`)
  return { success: true }
}

export async function joinRoom(roomId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: roomMeta } = await supabase
    .from('chat_rooms')
    .select('type, package_id')
    .eq('id', roomId)
    .single()

  if (roomMeta?.type === 'trip' && roomMeta.package_id) {
    const [{ data: pkg }, { data: userBookings }] = await Promise.all([
      supabase
        .from('packages')
        .select('duration_days, departure_dates, return_dates')
        .eq('id', roomMeta.package_id)
        .single(),
      supabase
        .from('bookings')
        .select('status, travel_date')
        .eq('user_id', user.id)
        .eq('package_id', roomMeta.package_id),
    ])
    const pkgCal = {
      duration_days: Math.max(1, Number(pkg?.duration_days) || 3),
      departure_dates: pkg?.departure_dates as string[] | null | undefined,
      return_dates: pkg?.return_dates as string[] | null | undefined,
    }
    if (!userHasTripChatAccess(userBookings || [], pkgCal)) {
      return { error: 'Only travelers with an active booking for this trip can join the chat' }
    }
  }

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

  revalidatePath('/community', 'layout')
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
