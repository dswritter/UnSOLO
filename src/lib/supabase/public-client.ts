import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Cookieless anon Supabase client for cacheable public reads.
 *
 * Unlike the request-scoped server client (`@/lib/supabase/server` →
 * `createClient`), this reads NO cookies or headers, so it is safe to call
 * inside `unstable_cache`, whose body runs outside request scope. RLS still
 * applies as an anonymous user, so only publicly-readable rows are returned —
 * exactly the right scope for public content pages.
 *
 * Mirrors the pattern already used by `wander-season-theme.ts`.
 */
export function createPublicClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
