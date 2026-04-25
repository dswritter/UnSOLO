'use client'

import { useLayoutEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { getLastTribeRoomId } from '@/lib/tribe-browser-cache'

type Props = { roomId: string | null; listPath?: string; roomPathPrefix?: string }

/**
 * On md+ viewports, open a chat in the main pane. Prefers the last-visited room
 * from localStorage, then the server’s most-recent room (if any).
 */
export function CommunityIndexDesktopRedirect({
  roomId,
  listPath = '/community',
  roomPathPrefix = '/community',
}: Props) {
  const router = useRouter()
  const pathname = usePathname()

  useLayoutEffect(() => {
    if (pathname !== listPath) return
    if (!window.matchMedia('(min-width: 768px)').matches) return
    const cached = getLastTribeRoomId()
    const target = cached || roomId
    if (target) router.replace(`${roomPathPrefix}/${target}`)
  }, [pathname, roomId, router, listPath, roomPathPrefix])

  return null
}
