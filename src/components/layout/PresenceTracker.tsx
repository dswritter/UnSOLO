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

    // Use the SECURITY DEFINER function — bypasses RLS reliably
    async function setPresence(online: boolean) {
      try {
        await supabase.rpc('upsert_presence', { p_user_id: userId, p_online: online })
      } catch {
        // Silently fail — presence is non-critical
      }
    }

    // Mark online immediately
    setPresence(true)

    // Heartbeat every 60 seconds
    intervalRef.current = setInterval(() => {
      setPresence(true)
    }, 60 * 1000)

    // Mark offline on tab close
    const handleUnload = () => {
      navigator.sendBeacon?.('/api/presence-offline', JSON.stringify({ userId }))
    }

    // Tab visibility
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        setPresence(false)
      } else {
        setPresence(true)
      }
    }

    window.addEventListener('beforeunload', handleUnload)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      window.removeEventListener('beforeunload', handleUnload)
      document.removeEventListener('visibilitychange', handleVisibility)
      // Do NOT call setPresence(false) here — Next.js remounts components on navigation
      initializedRef.current = false
    }
  }, [userId])

  return null
}
