'use client'

import { useEffect, useRef } from 'react'
import { updatePresence } from '@/actions/profile'

export function PresenceTracker({ userId }: { userId: string }) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (!userId) return

    // Mark online immediately
    updatePresence(true)

    // Heartbeat every 2 minutes
    intervalRef.current = setInterval(() => {
      updatePresence(true)
    }, 2 * 60 * 1000)

    // Mark offline on tab close/unload
    const handleUnload = () => {
      // Use sendBeacon for reliable unload
      navigator.sendBeacon?.('/api/presence-offline', JSON.stringify({ userId }))
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        updatePresence(false)
      } else {
        updatePresence(true)
      }
    }

    window.addEventListener('beforeunload', handleUnload)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      window.removeEventListener('beforeunload', handleUnload)
      document.removeEventListener('visibilitychange', handleVisibility)
      updatePresence(false)
    }
  }, [userId])

  return null
}
