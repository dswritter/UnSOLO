'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'

/**
 * On md+ viewports, open the most recent chat in the main pane instead of an empty state.
 * Mobile stays on the conversation list at /community so back navigation still works.
 */
export function CommunityIndexDesktopRedirect({ roomId }: { roomId: string }) {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (pathname !== '/community') return
    const mq = window.matchMedia('(min-width: 768px)')
    if (!mq.matches) return
    router.replace(`/community/${roomId}`)
  }, [pathname, roomId, router])

  return null
}
