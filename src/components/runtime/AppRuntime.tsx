'use client'

import { useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { flushOutbox, pendingCount } from '@/lib/tribe/outbox'
import { track } from '@/lib/analytics/client'

const LANDING: Record<string, string> = { tribe: '/tribe', trips: '/bookings' }

/**
 * App-level runtime for the web/PWA: service worker (production), offline outbox replay,
 * and the saved start page when launched from the home screen (manifest start_url ?source=pwa).
 */
export function AppRuntime() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  useEffect(() => {
    if (pathname !== '/' || params.get('source') !== 'pwa') return
    let tab: string | null = null
    try { tab = localStorage.getItem('unsolo.landingTab') } catch { /* ignore */ }
    track('app.open', { coldStart: true, landingTab: tab ?? 'explore' })
    const dest = tab ? LANDING[tab] : undefined
    if (dest) router.replace(dest)
  }, [pathname, params, router])

  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined)
    }
    const replay = async () => {
      if (pendingCount() === 0) return
      const sent = await flushOutbox()
      if (sent > 0) toast.success(sent === 1 ? 'Your saved post is live' : `${sent} saved posts are live`)
    }
    void replay()
    window.addEventListener('online', replay)
    return () => window.removeEventListener('online', replay)
  }, [])

  return null
}
