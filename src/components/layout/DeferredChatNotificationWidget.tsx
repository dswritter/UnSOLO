'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'

const ChatNotificationWidget = dynamic(
  () =>
    import('@/components/chat/ChatNotificationWidget').then(m => ({ default: m.ChatNotificationWidget })),
  { ssr: false, loading: () => null },
)

/**
 * Defers loading the mini chat bundle until the browser is idle (or timeout),
 * so first paint does less main-thread work. Interactive once loaded.
 */
export function DeferredChatNotificationWidget({ userId }: { userId: string }) {
  const [mount, setMount] = useState(false)

  useEffect(() => {
    let cancelled = false
    const enable = () => {
      if (!cancelled) setMount(true)
    }
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const id = window.requestIdleCallback(enable, { timeout: 2000 })
      return () => {
        cancelled = true
        window.cancelIdleCallback(id)
      }
    }
    const t = setTimeout(enable, 0)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [])

  if (!mount) return null
  return <ChatNotificationWidget userId={userId} />
}
