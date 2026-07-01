'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Client-side sign-out — fast path for the static app shell.
 *
 * The old server-action sign-out was slow to *feel*: a POST round-trip, then
 * revalidatePath('/', 'layout') (an app-wide cache purge), then a redirect that
 * cold-rendered the dynamic home page — all before the UI changed.
 *
 * Signing out on the browser client clears the session locally (scope: 'local'
 * = no network revoke round-trip). AuthProvider's onAuthStateChange fires
 * SIGNED_OUT immediately, so the navbar flips to logged-out at once and its
 * localStorage profile cache is cleared. We then soft-navigate home and refresh
 * the server components so any user-specific server content re-renders logged-out.
 */
export function useSignOut() {
  const router = useRouter()
  return async () => {
    try {
      await createClient().auth.signOut({ scope: 'local' })
    } catch {
      /* non-fatal — proceed to navigate regardless */
    }
    router.push('/')
    router.refresh()
  }
}
