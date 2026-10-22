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
