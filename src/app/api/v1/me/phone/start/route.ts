import { z } from 'zod'
import { getApiContext, requireUser } from '@/lib/api/context'
import { ApiError, ok, parseJson, route } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rate-limit'
import { startPhoneOtp } from '@/lib/auth/phone-otp-core'

export const POST = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const { phone } = await parseJson(req, z.object({ phone: z.string().min(10).max(16) }))
  await enforceRateLimit(ctx, 'otp')
  const r = await startPhoneOtp(user, phone)
  if (!r.ok) throw new ApiError(r.retryAfter ? 'rate_limited' : 'bad_request', r.error, { field: 'phone', retryAfter: r.retryAfter })
  return ok({ sent: true, ...(r.devCode ? { devCode: r.devCode } : {}) })
})
