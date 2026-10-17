'use client'

import type { loadMoreSidebarRooms } from '@/actions/chat-sidebar'
import type { SidebarRoom } from '@/components/chat/ChatSidebar'

export async function fetchSidebarRoomPage(offset: number, type?: SidebarRoom['type']) {
  const params = new URLSearchParams({ offset: String(offset) })
  if (type) params.set('type', type)
  const response = await fetch(`/api/chat-sidebar?${params}`, { cache: 'no-store' })
  if (!response.ok) throw new Error('Unable to load conversations. Please try again.')
  const result: Awaited<ReturnType<typeof loadMoreSidebarRooms>> = await response.json()
  if (result.error) throw new Error(result.error)
  return result
}
