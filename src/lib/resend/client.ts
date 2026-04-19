import { Resend } from 'resend'

let resendSingleton: Resend | null = null

/** Use at send time so RESEND_API_KEY is read when the request runs (avoids undefined at module load). */
export function getResend(): Resend {
  const key = process.env.RESEND_API_KEY?.trim()
  if (!key) {
    throw new Error('RESEND_API_KEY is not set')
  }
  if (!resendSingleton) {
    resendSingleton = new Resend(key)
  }
  return resendSingleton
}
