'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

export function PresenceTracker({ userId }: { userId: string }) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const initializedRef = useRef(false)

  useEffect(() => {
    if (!userId || initializedRef.current) return
    initializedRef.current = true

    const supabase = createClient()

    async function setPresence(online: boolean) {
      try {
        await supabase.rpc('upsert_presence', { p_user_id: userId, p_online: online })
      } catch {
        // Silently fail — presence is non-critical
      }
    }

    // Mark online immediately
    setPresence(true)

    // Heartbeat every 30 seconds — keeps last_seen fresh
    intervalRef.current = setInterval(() => {
      // Only heartbeat if tab is visible (don't count background tabs)
      if (document.visibilityState === 'visible') {
        setPresence(true)
      }
    }, 30 * 1000)

    // Mark offline ONLY on tab/window close (not on tab switch)
    const handleUnload = () => {
      // sendBeacon is fire-and-forget, works even during page unload
      navigator.sendBeacon?.('/api/presence-offline', JSON.stringify({ userId }))
    }

    // On tab becoming visible again, re-mark as online
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        setPresence(true)
      }
      // NOTE: We intentionally do NOT mark offline on hidden —
      // switching tabs doesn't mean the user left the site.
      // The heartbeat stopping + 2min threshold handles stale sessions.
    }

    window.addEventListener('beforeunload', handleUnload)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      window.removeEventListener('beforeunload', handleUnload)
      document.removeEventListener('visibilitychange', handleVisibility)
      initializedRef.current = false
    }
  }, [userId])

  return null
}
