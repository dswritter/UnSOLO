'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/layout/AuthProvider'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useRef } from 'react'

/**
 * Supabase's local scope still waits for /logout before clearing storage.
 * Clear this device first, then revoke the captured session in the background.
 */
export function useSignOut() {
  const router = useRouter()
  const { clearLocalSession } = useAuth()
  const queryClient = useQueryClient()
  const pending = useRef<Promise<void> | null>(null)
  return () => {
    if (pending.current) return pending.current
    const supabase = createClient()
    clearDeviceState()
    const accessToken = clearLocalSession()
    queryClient.clear()
    router.replace('/')
    router.refresh()
    const revoke = async () => {
      if (!accessToken) return
      const { error } = await supabase.auth.admin.signOut(accessToken, 'local')
      if (error && ![401, 403, 404].includes(error.status ?? 0)) throw error
    }
    const reportFailure = (error: unknown) => {
      console.error('Server sign-out failed:', error)
      toast.error('Signed out on this device, but the server session could not be ended.', {
        action: { label: 'Retry', onClick: () => { void revoke().catch(reportFailure) } },
      })
    }
    pending.current = (async () => {
      const { error: localError } = await supabase.auth.signOut({ scope: 'local' })
      if (localError) throw localError
      await revoke()
    })().catch(reportFailure).finally(() => { pending.current = null })
    return pending.current
  }
}

/**
 * Device privacy on sign-out: drop the offline outbox and cached pages/images, and unsubscribe this
 * browser from web push (the server deletes the token on its next 410). Best-effort, never throws.
 */
function clearDeviceState() {
  try {
    for (const k of ['unsolo.outbox.v1', 'unsolo.landingTab', 'unsolo.tabVisits']) localStorage.removeItem(k)
    // Offline trip packs (booking, host phone, co-travellers) are personal: drop them too.
    for (const k of Object.keys(localStorage)) if (k.startsWith('unsolo.tripPack.')) localStorage.removeItem(k)
  } catch { /* storage unavailable */ }
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.controller?.postMessage('unsolo:signed-out')
    void navigator.serviceWorker.getRegistration().then((reg) => reg?.pushManager?.getSubscription()).then((sub) => sub?.unsubscribe()).catch(() => undefined)
  } catch { /* ignore */ }
}
