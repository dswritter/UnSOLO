import { z } from 'zod'
import { ApiError, ok, parseJson, route } from '@/lib/api/http'
import { startPhoneLogin } from '@/lib/auth/phone-login'
import { phoneLoginDeps, requestIp } from '@/lib/auth/phone-login-deps'

/** Phone sign-in, step 1 (no auth): text a 6-digit code via our SMS gateway; returns a signed challenge. */
export const POST = route(async (req: Request) => {
  const { phone } = await parseJson(req, z.object({ phone: z.string().min(10).max(16) }))
  const r = await startPhoneLogin(phoneLoginDeps(), phone, requestIp(req))
  if (!r.ok) throw new ApiError(r.code, r.error, { field: 'phone', retryAfter: r.retryAfter })
  return ok({ challenge: r.challenge, expiresIn: r.expiresIn, ...(r.devCode ? { devCode: r.devCode } : {}) })
})
