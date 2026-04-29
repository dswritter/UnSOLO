import { cache } from 'react'
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
 */
export const getRequestAuth = cache(async () => {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user ?? null
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
