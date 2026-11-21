import { z } from 'zod'
import { ApiError, ok, parseJson, route } from '@/lib/api/http'
import { verifyPhoneLogin } from '@/lib/auth/phone-login'
import { phoneLoginDeps, requestIp } from '@/lib/auth/phone-login-deps'

/**
 * Phone sign-in, step 2: check the code against the challenge and return a Supabase session in the
 * same shape as Supabase's /auth/v1/verify (access_token, refresh_token, expires_in, expires_at, user),
 * plus `is_new` for first-time accounts.
 */
export const POST = route(async (req: Request) => {
  const body = await parseJson(req, z.object({ challenge: z.string().min(20).max(1000), code: z.string().min(6).max(6) }))
  const r = await verifyPhoneLogin(phoneLoginDeps(), body.challenge, body.code, requestIp(req))
  if (!r.ok) throw new ApiError(r.code, r.error, { field: 'code', retryAfter: r.retryAfter })
  return ok({ ...r.session, is_new: r.isNew })
})
