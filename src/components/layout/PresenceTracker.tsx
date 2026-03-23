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

    // Heartbeat every 20 seconds — keeps last_seen fresh
    intervalRef.current = setInterval(() => {
      if (document.visibilityState === 'visible') {
        setPresence(true)
      }
    }, 20 * 1000)

    // Mark offline on tab/window close — use BOTH events for max reliability
    function markOfflineBeacon() {
      const url = '/api/presence-offline'
      const body = JSON.stringify({ userId })

      // Try sendBeacon first (most reliable for unload)
      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: 'application/json' })
        navigator.sendBeacon(url, blob)
      } else {
        // Fallback: sync XHR (deprecated but works in old browsers)
        try {
          const xhr = new XMLHttpRequest()
          xhr.open('POST', url, false) // sync
          xhr.setRequestHeader('Content-Type', 'application/json')
          xhr.send(body)
        } catch { /* ignore */ }
      }
    }

    // On tab becoming visible, re-mark as online
    function handleVisibility() {
      if (document.visibilityState === 'visible') {
        setPresence(true)
      }
      // Don't mark offline on hidden — switching tabs is not leaving
    }

    // pagehide is more reliable than beforeunload on mobile Safari & Chrome
    window.addEventListener('pagehide', markOfflineBeacon)
    window.addEventListener('beforeunload', markOfflineBeacon)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      window.removeEventListener('pagehide', markOfflineBeacon)
      window.removeEventListener('beforeunload', markOfflineBeacon)
      document.removeEventListener('visibilitychange', handleVisibility)
      initializedRef.current = false
    }
  }, [userId])

  return null
}
