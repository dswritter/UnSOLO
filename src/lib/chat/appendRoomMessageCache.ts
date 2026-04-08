'use client'

import type { QueryClient } from '@tanstack/react-query'
import type { Message } from '@/types'
import { chatKeys } from '@/lib/chat/chatQueryKeys'

/** Merge a realtime INSERT into TanStack Query cache for any room (including inactive). */
export function appendRoomMessageToCache(
  queryClient: QueryClient,
  raw: {
    id: string
    room_id: string
    content: string
    created_at: string
    user_id: string
    message_type?: string
  },
) {
  if (raw.message_type === 'system') return

  const key = chatKeys.messages(raw.room_id)
  queryClient.setQueryData<Message[]>(key, prev => {
    const list = prev ?? []
    if (list.find(m => m.id === raw.id)) return list

    const existingUserMsg = list.find(m => m.user_id === raw.user_id && m.user)
    const enriched: Message = {
      id: raw.id,
      room_id: raw.room_id,
      user_id: raw.user_id,
      content: raw.content,
      message_type: (raw.message_type as Message['message_type']) || 'text',
      is_edited: false,
      created_at: raw.created_at,
      user: existingUserMsg?.user,
    }

    const cleaned = list.filter(
      m =>
        !(
          m.id.startsWith('optimistic-') &&
          m.user_id === enriched.user_id &&
          m.content === enriched.content
        ),
    )
    return [...cleaned, enriched]
  })
}
