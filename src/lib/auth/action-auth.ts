'use server'

import { cache } from 'react'
import { cookies } from 'next/headers'

import { createClient } from '@/lib/supabase/server'

/**
 * Per-action-request memoized session lookup for server actions.
 *
 * Most actions only need the signed-in user id. `getSession()` reads the JWT
 * from cookies locally, avoiding a Supabase Auth round-trip for every action.
 *
 * Refresh-race fallback (mirror of getRequestAuth): if getSession() returns
 * null but a sb-...-auth-token cookie is present, the most likely cause is
 * a concurrent refresh-token race in middleware. Hit getUser() once to
 * confirm — keeps server actions from failing with "Not authenticated" on
 * what is, in fact, a valid session.
 */
export const getActionAuth = cache(async () => {
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
