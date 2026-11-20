import { timingSafeEqual } from 'node:crypto'

/** Cron endpoints require `Authorization: Bearer $CRON_SECRET`. No secret configured → always refuse. */
export function isAuthorizedCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret || secret.length < 16) return false
  const got = Buffer.from(req.headers.get('authorization') ?? '')
  const want = Buffer.from(`Bearer ${secret}`)
  return got.length === want.length && timingSafeEqual(got, want)
}
