import { createClient as createSupabaseClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { createClient as createCookieClient, createServiceRoleClient } from '@/lib/supabase/server'
import { ApiError } from './http'
import { hasVerifiedEmail } from '@/lib/auth/phone-login'

export type ClientInfo = { platform: 'web' | 'android' | 'ios'; version: string | null; build: number | null }

export type ApiContext = {
  /** RLS-scoped client acting as the caller (anon when signed out). */
  db: SupabaseClient
  user: User | null
  client: ClientInfo
  /** Service-role client — use only for writes the caller is already authorised for. */
  service: () => SupabaseClient
}

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!
const anon = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/** Parses `X-UnSOLO-Client: android/1.2.0 (12)`. */
export function parseClientHeader(v: string | null): ClientInfo {
  const m = v?.match(/^(android|ios|web)(?:\/([\w.-]{1,20}))?(?:\s*\((\d{1,9})\))?/i)
  if (!m) return { platform: 'web', version: null, build: null }
  return {
    platform: m[1].toLowerCase() as ClientInfo['platform'],
    version: m[2] ?? null,
    build: m[3] ? Number(m[3]) : null,
  }
}

/**
 * Resolves the caller from `Authorization: Bearer <supabase access token>` (native apps)
 * or the Supabase session cookie (web). The bearer token is verified with Supabase Auth.
 */
export async function getApiContext(req: Request): Promise<ApiContext> {
  const client = parseClientHeader(req.headers.get('x-unsolo-client'))
  const service = () => createServiceRoleClient()
  const auth = req.headers.get('authorization')
  const bearer = auth?.match(/^Bearer\s+([A-Za-z0-9._-]{20,4096})$/)?.[1]

  if (bearer) {
    const db = createSupabaseClient(url(), anon(), {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    })
    const { data, error } = await db.auth.getUser(bearer)
    // Only a definite "this token is no good" signs the app out. Supabase Auth being slow or down
    // (timeouts, 5xx) is a 503, so apps keep you signed in and simply try again.
    if (error && !isTokenRejected(error)) throw new ApiError('unavailable', 'UnSOLO is having trouble right now. Try again in a minute.')
    if (error || !data.user) throw new ApiError('unauthorized', 'Session expired')
    return { db, user: data.user, client, service }
  }

  const db = await createCookieClient()
  const { data } = await db.auth.getUser()
  return { db, user: data.user ?? null, client, service }
}

function isTokenRejected(e: { status?: number; name?: string }): boolean {
  const s = e.status ?? 0
  return e.name !== 'AuthRetryableFetchError' && s >= 400 && s < 500 && s !== 429
}

export function requireUser(ctx: ApiContext): User {
  if (!ctx.user) throw new ApiError('unauthorized', 'Sign in to continue')
  return ctx.user
}

/**
 * Posting, commenting, voting and joining plans need ONE verified contact: a confirmed real email
 * (email code, Google, Apple) or a verified phone. Only hosting and booking ask for the phone itself.
 * The error code stays `phone_required` so clients open their "add your phone" card.
 */
export async function requireVerifiedContact(ctx: ApiContext): Promise<User> {
  const user = requireUser(ctx)
  if (hasVerifiedEmail(user)) return user
  const { data } = await ctx.db.from('profiles').select('is_phone_verified').eq('id', user.id).single()
  if (!data?.is_phone_verified) throw new ApiError('phone_required', 'Verify your phone number or email to continue')
  return user
}

/** @deprecated Tribe actions accept email OR phone now; use requireVerifiedContact. */
export const requirePhoneVerified = requireVerifiedContact
