'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActionAuth } from '@/lib/auth/action-auth'
import { getSidebarRooms } from '@/lib/chat/getSidebarRooms'
import type { SidebarRoom } from '@/components/chat/ChatSidebar'

const PAGE_SIZE = 8

/** Resolve only from this viewer's permitted sidebar, never from an unrestricted room lookup. */
export async function loadActiveSidebarRoom(roomId: string): Promise<{ room: SidebarRoom | null; error?: string }> {
  const { supabase, user } = await getActionAuth()
  if (!user) return { room: null, error: 'Not authenticated' }
  const { rooms } = await getSidebarRooms(supabase, user.id, { limit: 1, offset: 0, roomId })
  return { room: rooms.find(room => room.id === roomId) ?? null }
}

async function userCanPinRoom(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  roomId: string,
): Promise<boolean> {
  const { data: room } = await supabase.from('chat_rooms').select('type, is_active').eq('id', roomId).maybeSingle()
  if (!room || room.is_active === false) return false
  if (room.type === 'general') return true
  const { data: m } = await supabase
    .from('chat_room_members')
    .select('id')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .maybeSingle()
  return !!m
}

function revalidateTribeSidebars() {
  revalidatePath('/tribe', 'layout')
  revalidatePath('/community', 'layout')
}

export async function toggleChatSidebarPin(roomId: string): Promise<{ error?: string; pinned?: boolean }> {
  const { supabase, user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }

  const can = await userCanPinRoom(supabase, user.id, roomId)
  if (!can) return { error: 'You cannot pin this chat' }

  const { data: existing } = await supabase
    .from('chat_sidebar_room_pins')
    .select('room_id')
    .eq('user_id', user.id)
    .eq('room_id', roomId)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase.from('chat_sidebar_room_pins').delete().eq('user_id', user.id).eq('room_id', roomId)
    if (error) return { error: error.message }
    revalidateTribeSidebars()
    return { pinned: false }
  }

  const { error } = await supabase.from('chat_sidebar_room_pins').insert({ user_id: user.id, room_id: roomId })
  if (error) return { error: error.message }
  revalidateTribeSidebars()
  return { pinned: true }
}

export async function loadMoreSidebarRooms(offset: number, type?: SidebarRoom['type']): Promise<{
  rooms: SidebarRoom[]
  total: number
  pinnedRoomIds: string[]
  roomNameIndex?: { id: string; name: string }[]
  mostRecentRoomId?: string | null
  error?: string
}> {
  const { supabase, user } = await getActionAuth()
  if (!user) return { rooms: [], total: 0, pinnedRoomIds: [], error: 'Not authenticated' }

  const { rooms, total, pinnedRoomIds, roomNameIndex, mostRecentRoomId } = await getSidebarRooms(supabase, user.id, {
    limit: PAGE_SIZE,
    offset: Math.max(0, offset),
    ...(type ? { type } : {}),
  })
  return { rooms, total, pinnedRoomIds, roomNameIndex, mostRecentRoomId }
}
