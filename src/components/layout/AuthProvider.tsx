'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types'
import type { Session } from '@supabase/supabase-js'
import { clearBrowserSession } from '@/lib/supabase/clear-browser-session'

type AuthState = {
  /** The signed-in user's id, or null when logged out. `undefined`-free. */
  userId: string | null
  /** The signed-in user's profile row, or null when logged out / not yet loaded. */
  profile: Profile | null
  /** True until the first auth resolution completes on the client. */
  loading: boolean
  clearLocalSession: () => string | null
}

const AuthContext = createContext<AuthState>({
  userId: null, profile: null, loading: true,
  clearLocalSession: () => { throw new Error('Sign-out requires AuthProvider') },
})

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
 * Shared by all route groups at the root, so moving between the site and admin
 * does not discard resolved identity. This provider resolves the
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
  const sessionRef = useRef<Session | null>(null)
  const signingOutRef = useRef(false)
  const authVersion = useRef(0)

  const clearLocalSession = useCallback(() => {
    const accessToken = sessionRef.current?.access_token ?? null
    clearBrowserSession()
    sessionRef.current = null
    signingOutRef.current = true
    authVersion.current += 1
    setUserId(null)
    setProfile(null)
    setLoading(false)
    try { localStorage.removeItem(CACHE_KEY) } catch (error) { console.warn('Could not clear cached profile:', error) }
    return accessToken
  }, [])

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    async function loadProfile(uid: string, version: number) {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).single()
      if (cancelled || version !== authVersion.current) return
      if (error) { console.error('Could not load signed-in profile:', error); return }
      const prof = (data as Profile | null) ?? null
      setProfile(prof)
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ userId: uid, profile: prof }))
      } catch { /* quota / private mode — non-critical */ }
    }

    // 2) onAuthStateChange fires an initial event with the current session on
    //    subscribe, so this handles both first load and later login/logout.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') signingOutRef.current = false
      if (signingOutRef.current && session) return
      sessionRef.current = session
      const version = ++authVersion.current
      const u = session?.user ?? null
      if (!u) {
        setUserId(null)
        setProfile(null)
        setLoading(false)
        try { localStorage.removeItem(CACHE_KEY) } catch { /* ignore */ }
        return
      }
      setUserId(u.id)
      try {
        const raw = localStorage.getItem(CACHE_KEY)
        const cached = raw ? JSON.parse(raw) as { userId: string; profile: Profile | null } : null
        setProfile(cached?.userId === u.id ? cached.profile : null)
      } catch { /* ignore malformed display cache */ }
      void loadProfile(u.id, version).finally(() => {
        if (!cancelled && version === authVersion.current) setLoading(false)
      })
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  return (
    <AuthContext.Provider value={{ userId, profile, loading, clearLocalSession }}>
      {children}
    </AuthContext.Provider>
  )
}
