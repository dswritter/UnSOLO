'use client'

import { useLayoutEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { chatKeys } from '@/lib/chat/chatQueryKeys'
import { getCachedMessagesJson, parseCachedMessagesPayload } from '@/lib/tribe-browser-cache'
import type { Message } from '@/types'

/**
 * Primes the room messages query from sessionStorage before ChatWindow mounts
 * so the last-visited room shows cached messages immediately.
 */
export function TribeMessageCacheBootstrap() {
  const pathname = usePathname()
  const queryClient = useQueryClient()

  useLayoutEffect(() => {
    const m = pathname?.match(/\/(?:community|tribe)\/([0-9a-f-]{36})/i)
    if (!m) return
    const roomId = m[1]
    const raw = getCachedMessagesJson(roomId)
    const parsed = parseCachedMessagesPayload(raw)
    if (!parsed?.messages?.length) return
    const key = chatKeys.messages(roomId)
    const existing = queryClient.getQueryData<Message[]>(key)
    if (existing && existing.length > 0) return
    queryClient.setQueryData(key, parsed.messages as Message[])
  }, [pathname, queryClient])

  return null
}
