'use server'

import { createClient } from '@/lib/supabase/server'
import { getSidebarRooms } from '@/lib/chat/getSidebarRooms'
import type { SidebarRoom } from '@/components/chat/ChatSidebar'

const PAGE_SIZE = 8

export async function loadMoreSidebarRooms(offset: number): Promise<{
  rooms: SidebarRoom[]
  total: number
  error?: string
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { rooms: [], total: 0, error: 'Not authenticated' }

  const { rooms, total } = await getSidebarRooms(supabase, user.id, {
    limit: PAGE_SIZE,
    offset: Math.max(0, offset),
  })
  return { rooms, total }
}
