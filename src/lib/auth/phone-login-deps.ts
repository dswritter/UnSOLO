import { createServiceRoleClient } from '@/lib/supabase/server'
import { createPublicClient } from '@/lib/supabase/public-client'
import { generateOTP, sendSMS } from '@/lib/sms/client'
import type { PhoneLoginDeps } from './phone-login'

/** Production wiring for phone sign-in. The challenge key is derived from the service-role key. */
export function phoneLoginDeps(): PhoneLoginDeps {
  const secret = process.env['SUPABASE_SERVICE_ROLE_KEY']
  if (!secret) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  return {
    svc: createServiceRoleClient(),
    anon: createPublicClient(),
    sendSMS,
    generateOTP,
    secret,
    production: process.env.NODE_ENV === 'production',
  }
}

/** Client IP for rate limits (Vercel sets x-forwarded-for / x-real-ip). */
export function requestIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return fwd || req.headers.get('x-real-ip')?.trim() || 'unknown'
}
