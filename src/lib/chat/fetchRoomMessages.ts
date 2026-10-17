'use client'

import { createClient } from '@/lib/supabase/client'
import type { Message } from '@/types'
import { normalizeRoomId } from '@/lib/chat/chatQueryKeys'

export async function fetchRoomMessagesClient(roomId: string, before?: string): Promise<Message[]> {
  const supabase = createClient()
  const key = normalizeRoomId(roomId)
  let query = supabase
    .from('messages')
    .select('*, user:profiles(id, username, full_name, avatar_url, role)')
    .eq('room_id', key)
    .order('created_at', { ascending: false })
    .limit(100)
  if (before) query = query.lt('created_at', before)
  const { data, error } = await query

  if (error) throw error
  return ((data || []) as Message[]).reverse()
}
