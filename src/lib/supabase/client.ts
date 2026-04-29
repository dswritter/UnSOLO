import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

import { getSupabaseAuthCookieOptions } from '@/lib/supabase/auth-cookie-options'

const browserOptions = getSupabaseAuthCookieOptions()

let browserClient: SupabaseClient | null = null

/**
 * Single browser Supabase client so Realtime shares one WebSocket (multiple
 * createBrowserClient() instances can miss or duplicate postgres_changes).
 */
export function createClient() {
  if (typeof window === 'undefined') {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      browserOptions,
    )
  }
  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      browserOptions,
    )
  }
  return browserClient
}
