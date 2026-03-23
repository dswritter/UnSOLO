'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

export function PresenceTracker({ userId }: { userId: string }) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    if (!userId) return
    mountedRef.current = true

    const supabase = createClient()

    // Direct DB upsert (client-side) — faster than server action
    async function markOnline() {
      await supabase
        .from('user_presence')
        .upsert({ user_id: userId, last_seen: new Date().toISOString(), is_online: true }, { onConflict: 'user_id' })
    }

    async function markOffline() {
      await supabase
        .from('user_presence')
        .upsert({ user_id: userId, last_seen: new Date().toISOString(), is_online: false }, { onConflict: 'user_id' })
    }

    // Mark online immediately
    markOnline()

    // Heartbeat every 90 seconds
    intervalRef.current = setInterval(() => {
      if (mountedRef.current) markOnline()
    }, 90 * 1000)

    // Mark offline on tab close
    const handleUnload = () => {
      navigator.sendBeacon?.('/api/presence-offline', JSON.stringify({ userId }))
    }

    // Only mark offline on tab hidden, re-mark online on visible
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        markOffline()
      } else {
        markOnline()
      }
    }

    window.addEventListener('beforeunload', handleUnload)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      mountedRef.current = false
      if (intervalRef.current) clearInterval(intervalRef.current)
      window.removeEventListener('beforeunload', handleUnload)
      document.removeEventListener('visibilitychange', handleVisibility)
      // Do NOT mark offline on component unmount — Next.js remounts on navigation
    }
  }, [userId])

  return null
}
