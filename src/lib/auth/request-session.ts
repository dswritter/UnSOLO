import { cache } from 'react'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/types'

/**
 * Per-request memoized Supabase server client + user from cookies.
 * Call from any Server Component/Layout in the same render pass: only one
 * `createClient` + auth read runs per request (React cache).
 *
 * Uses `getSession()` (reads signed session from cookies) instead of `getUser()`, which contacts
 * Supabase Auth (GoTrue) on every invocation and inflated Auth request counts in the dashboard: each
 * RSC/route hit was effectively one Auth API round-trip when using `getUser()`.
 *
 * Middleware and `@supabase/ssr` cookie handling still rotate tokens; server actions that must
 * explicitly re-verify the JWT should keep calling `supabase.auth.getUser()` where appropriate.
 *
 * Refresh-race fallback: when concurrent middleware runs race the single-use
 * Supabase refresh token, getSession() can return null even though the user is
 * authenticated. If we see null *and* the auth cookie is present, hit getUser()
 * once to authoritatively confirm — this costs one Auth API call only on the
 * unhappy path and prevents a spurious redirect to /login during nav.
 */
export const getRequestAuth = cache(async () => {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  let user = session?.user ?? null

  if (!user) {
    const cookieStore = await cookies()
    const hasAuthCookie = cookieStore
      .getAll()
      .some(c => c.name.startsWith('sb-') && c.name.includes('-auth-token'))
    if (hasAuthCookie) {
      const { data } = await supabase.auth.getUser()
      user = data.user ?? null
    }
  }

  return { supabase, user }
})

/**
 * Full profile row for the user; reuses the same supabase/getSession-derived user as getRequestAuth.
 */
export const getRequestProfile = cache(async (userId: string): Promise<Profile | null> => {
  const { supabase } = await getRequestAuth()
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
  return (data as Profile | null) ?? null
})
