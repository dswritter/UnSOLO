'use client'

import type { QueryClient } from '@tanstack/react-query'
import { chatKeys } from '@/lib/chat/chatQueryKeys'
import { fetchRoomMessagesClient } from '@/lib/chat/fetchRoomMessages'

const CHAT_MSG_GC_MS = 1000 * 60 * 60 * 24 * 7 // 7d — match ChatWindow / QueryProvider

/** Warm TanStack cache + start network fetch before navigation (hover / intent). */
export function prefetchRoomMessages(queryClient: QueryClient, roomId: string) {
  const key = chatKeys.messages(roomId)
  if (queryClient.getQueryData(key)) return
  void queryClient.prefetchQuery({
    queryKey: key,
    queryFn: () => fetchRoomMessagesClient(roomId),
    staleTime: Infinity,
    gcTime: CHAT_MSG_GC_MS,
  })
}
