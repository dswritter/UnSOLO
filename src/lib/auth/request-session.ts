import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/types'

/**
 * Per-request memoized Supabase server client + user from cookies.
 * Call from any Server Component/Layout in the same render pass: only one
 * `createClient` + `getUser` runs per request (React cache).
 */
export const getRequestAuth = cache(async () => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user: user ?? null }
})

/**
 * Full profile row for the user; reuses the same supabase/getUser as getRequestAuth.
 */
export const getRequestProfile = cache(async (userId: string): Promise<Profile | null> => {
  const { supabase } = await getRequestAuth()
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
  return (data as Profile | null) ?? null
})
