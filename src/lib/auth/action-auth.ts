'use server'

import { cache } from 'react'

import { createClient } from '@/lib/supabase/server'

/**
 * Per-action-request memoized session lookup for server actions.
 *
 * Most actions only need the signed-in user id. `getSession()` reads the JWT
 * from cookies locally, avoiding a Supabase Auth round-trip for every action.
 */
export const getActionAuth = cache(async () => {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user ?? null
  return { supabase, user }
})
