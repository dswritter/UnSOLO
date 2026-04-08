'use client'

import { createClient } from '@/lib/supabase/client'
import type { Message } from '@/types'
import { normalizeRoomId } from '@/lib/chat/chatQueryKeys'

export async function fetchRoomMessagesClient(roomId: string): Promise<Message[]> {
  const supabase = createClient()
  const key = normalizeRoomId(roomId)
  const { data, error } = await supabase
    .from('messages')
    .select('*, user:profiles(id, username, full_name, avatar_url)')
    .eq('room_id', key)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) throw error
  return ((data || []) as Message[]).reverse()
}
