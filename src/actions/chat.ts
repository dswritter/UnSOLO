'use server'

import { revalidatePath } from 'next/cache'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
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

function isCommunityChatStaffRole(role: string | null | undefined) {
  return role === 'admin' || role === 'social_media_manager'
}

export async function setRoomPinnedMessage(roomId: string, messageId: string | null) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !isCommunityChatStaffRole(profile.role)) {
    return { error: 'Only staff can pin messages' }
  }

  const { data: room } = await supabase
    .from('chat_rooms')
    .select('type, id')
    .eq('id', roomId)
    .single()
  if (!room) return { error: 'Room not found' }
  if (room.type !== 'general' && room.type !== 'trip') {
    return { error: 'Pins are only for community or trip chats' }
  }

  if (messageId) {
    const { data: msg } = await supabase
      .from('messages')
      .select('id, room_id, message_type')
      .eq('id', messageId)
      .single()
    if (!msg || msg.room_id !== roomId) return { error: 'Invalid message' }
    if (msg.message_type === 'system' || msg.message_type === 'poll') {
      return { error: 'Pin text or image messages only' }
    }
  }

  const svc = createServiceRoleClient()
  const { error } = await svc.from('chat_rooms').update({ pinned_message_id: messageId }).eq('id', roomId)
  if (error) return { error: error.message }

  revalidatePath('/community', 'layout')
  revalidatePath(`/community/${roomId}`)
  return { success: true as const }
}

export async function createChatPoll(
  roomId: string,
  question: string,
  options: string[],
  allowMultiple: boolean,
  endsAtIso: string | null,
) {
  const q = question.trim()
  if (q.length < 2) return { error: 'Enter a question' }
  if (q.length > 500) return { error: 'Question is too long' }

  const cleaned = options.map(o => o.trim()).filter(Boolean)
  if (cleaned.length < 2) return { error: 'Add at least 2 options' }
  if (cleaned.length > 12) return { error: 'At most 12 options' }
  for (const line of cleaned) {
    if (line.length > 200) return { error: 'Each option must be 200 characters or less' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const rate = await assertMessageSendRateLimit(supabase, user.id)
  if (rate.error) return { error: rate.error }

  const { data: member } = await supabase
    .from('chat_room_members')
    .select('id')
    .eq('room_id', roomId)
    .eq('user_id', user.id)
    .single()
  if (!member) return { error: 'Join this chat to create a poll' }

  const { data: room } = await supabase.from('chat_rooms').select('type').eq('id', roomId).single()
  if (room && room.type === 'direct') return { error: 'Polls are for community and trip chats' }

  const { data: msgRow, error: msgErr } = await supabase
    .from('messages')
    .insert({
      room_id: roomId,
      user_id: user.id,
      content: q,
      message_type: 'poll',
    })
    .select('id')
    .single()
  if (msgErr || !msgRow) return { error: msgErr?.message || 'Failed to create poll' }

  const { data: pollRow, error: pollErr } = await supabase
    .from('chat_polls')
    .insert({
      room_id: roomId,
      message_id: msgRow.id,
      created_by: user.id,
      question: q,
      allow_multiple: allowMultiple,
      ends_at: endsAtIso,
    })
    .select('id')
    .single()
  if (pollErr || !pollRow) {
    await supabase.from('messages').delete().eq('id', msgRow.id)
    return { error: pollErr?.message || 'Failed to create poll' }
  }

  const optRows = cleaned.map((label, i) => ({
    poll_id: pollRow.id,
    position: i,
    label,
  }))
  const { error: optErr } = await supabase.from('chat_poll_options').insert(optRows)
  if (optErr) {
    await supabase.from('chat_polls').delete().eq('id', pollRow.id)
    await supabase.from('messages').delete().eq('id', msgRow.id)
    return { error: optErr.message }
  }

  revalidatePath('/community', 'layout')
  revalidatePath(`/community/${roomId}`)
  return { success: true as const, messageId: msgRow.id, pollId: pollRow.id }
}

export async function castChatPollVote(roomId: string, pollId: string, optionIds: string[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: member } = await supabase
    .from('chat_room_members')
    .select('id')
    .eq('room_id', roomId)
    .eq('user_id', user.id)
    .single()
  if (!member) return { error: 'Join this chat to vote' }

  const { data: poll } = await supabase
    .from('chat_polls')
    .select('id, room_id, allow_multiple, ends_at')
    .eq('id', pollId)
    .single()
  if (!poll || poll.room_id !== roomId) return { error: 'Poll not found' }
  if (poll.ends_at && new Date(poll.ends_at) < new Date()) return { error: 'This poll has ended' }

  const { data: validOptions } = await supabase
    .from('chat_poll_options')
    .select('id')
    .eq('poll_id', pollId)
  const valid = new Set((validOptions || []).map(o => o.id))
  const chosen = optionIds.filter(id => valid.has(id))
  if (poll.allow_multiple) {
    /* allow 0 to clear all votes */
  } else {
    if (chosen.length > 1) return { error: 'Select at most one option' }
  }

  await supabase.from('chat_poll_votes').delete().eq('poll_id', pollId).eq('user_id', user.id)
  if (chosen.length) {
    const { error: insErr } = await supabase.from('chat_poll_votes').insert(
      chosen.map(option_id => ({
        poll_id: pollId,
        room_id: roomId,
        user_id: user.id,
        option_id,
      })),
    )
    if (insErr) return { error: insErr.message }
  }

  revalidatePath(`/community/${roomId}`)
  return { success: true as const }
}

export async function getPollStateForMessage(messageId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' as const, state: null as null }

  const { data: poll, error: pollErr } = await supabase
    .from('chat_polls')
    .select('id, message_id, room_id')
    .eq('message_id', messageId)
    .maybeSingle()
  if (pollErr || !poll) return { error: 'Poll not found' as const, state: null as null }

  const { getRoomPollsState } = await import('@/lib/chat/getRoomPollsState')
  const map = await getRoomPollsState(supabase, poll.room_id, [messageId], user.id)
  return { state: map[messageId] ?? null, error: null as null }
}

/** Refetch a single poll by id (e.g. realtime vote events). */
export async function getPollStateByPollId(pollId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' as const, state: null as null }

  const { data: row, error } = await supabase
    .from('chat_polls')
    .select('message_id, room_id')
    .eq('id', pollId)
    .maybeSingle()
  if (error || !row) return { error: null as null, state: null as null }

  const { getRoomPollsState } = await import('@/lib/chat/getRoomPollsState')
  const map = await getRoomPollsState(supabase, row.room_id, [row.message_id], user.id)
  return { state: map[row.message_id] ?? null, error: null as null }
}
