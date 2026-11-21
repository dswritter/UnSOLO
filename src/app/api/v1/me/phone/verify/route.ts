import { z } from 'zod'
import { getApiContext, requireUser } from '@/lib/api/context'
import { ApiError, ok, parseJson, route } from '@/lib/api/http'
import { confirmPhoneOtp } from '@/lib/auth/phone-otp-core'

export const POST = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const b = await parseJson(req, z.object({ phone: z.string().min(10).max(16), code: z.string().regex(/^\d{4}$/) }))
  const r = await confirmPhoneOtp(user, b.phone, b.code)
  if (!r.ok) throw new ApiError('bad_request', r.error, { field: 'code' })
  return ok({ verified: true })
})
