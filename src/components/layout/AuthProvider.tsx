'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types'

type AuthState = {
  /** The signed-in user's id, or null when logged out. `undefined`-free. */
  userId: string | null
  /** The signed-in user's profile row, or null when logged out / not yet loaded. */
  profile: Profile | null
  /** True until the first auth resolution completes on the client. */
  loading: boolean
}

const AuthContext = createContext<AuthState>({ userId: null, profile: null, loading: true })

/** Read the client-resolved auth state anywhere under <AuthProvider>. */
export function useAuth() {
  return useContext(AuthContext)
}

// localStorage key for the last-known profile — lets the navbar paint the user's
// identity instantly on repeat visits (no logged-out flash) while we confirm the
// session in the background.
const CACHE_KEY = 'unsolo_auth_profile_v1'

/**
 * Client-side auth resolver for the static app shell.
 *
 * Because the (main) layout is now statically rendered (no server cookie read),
 * the shell has no server knowledge of the user. This provider resolves the
 * session on the client via the browser Supabase client, seeds instantly from a
 * localStorage cache (so repeat visits show the avatar with no flash), and keeps
 * itself in sync via onAuthStateChange. Its context updates ARE the correction
 * path: everything consuming useAuth() re-renders once the real user resolves.
 *
 * Security note: this drives DISPLAY only (avatar, nav labels, sign-in prompt).
 * All authorization is still enforced server-side in RLS + server actions.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 1) Seed synchronously from cache for an instant, flash-free navbar.
    try {
      const raw = localStorage.getItem(CACHE_KEY)
      if (raw) {
        const cached = JSON.parse(raw) as { userId: string; profile: Profile | null }
        if (cached?.userId) {
          setUserId(cached.userId)
          setProfile(cached.profile ?? null)
        }
      }
    } catch { /* ignore malformed cache */ }

    const supabase = createClient()
    let cancelled = false

    async function loadProfile(uid: string) {
      const { data } = await supabase.from('profiles').select('*').eq('id', uid).single()
      if (cancelled) return
      const prof = (data as Profile | null) ?? null
      setProfile(prof)
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ userId: uid, profile: prof }))
      } catch { /* quota / private mode — non-critical */ }
    }

    // 2) onAuthStateChange fires an initial event with the current session on
    //    subscribe, so this handles both first load and later login/logout.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null
      if (!u) {
        setUserId(null)
        setProfile(null)
        setLoading(false)
        try { localStorage.removeItem(CACHE_KEY) } catch { /* ignore */ }
        return
      }
      setUserId(u.id)
      void loadProfile(u.id).finally(() => {
        if (!cancelled) setLoading(false)
      })
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  return (
    <AuthContext.Provider value={{ userId, profile, loading }}>
      {children}
    </AuthContext.Provider>
  )
}
