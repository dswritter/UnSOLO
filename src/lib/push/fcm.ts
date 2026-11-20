/**
 * Firebase Cloud Messaging HTTP v1 with a service-account JWT (RS256) — node:crypto only.
 * Env: FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY (PEM, "\n" escaped allowed).
 */
import { createSign } from 'node:crypto'

let cached: { token: string; exp: number } | null = null

export function fcmConfigured() {
  return !!(process.env.FCM_PROJECT_ID && process.env.FCM_CLIENT_EMAIL && process.env.FCM_PRIVATE_KEY)
}

async function accessToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token
  const now = Math.floor(Date.now() / 1000)
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const unsigned = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({
    iss: process.env.FCM_CLIENT_EMAIL, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  })}`
  const signer = createSign('RSA-SHA256')
  signer.update(unsigned)
  const sig = signer.sign((process.env.FCM_PRIVATE_KEY ?? '').replace(/\\n/g, '\n')).toString('base64url')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }),
  })
  if (!res.ok) throw new Error(`fcm oauth ${res.status}`)
  const j = (await res.json()) as { access_token: string; expires_in: number }
  cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 }
  return j.access_token
}

/** Data message (the app builds the notification so channels + deep links are under its control). */
export async function sendFcm(token: string, data: Record<string, string>): Promise<'ok' | 'gone' | 'error'> {
  if (!fcmConfigured()) return 'error'
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${process.env.FCM_PROJECT_ID}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { token, data, android: { priority: 'high', ttl: '86400s' } } }),
  })
  if (res.status === 404) return 'gone'
  if (res.status === 400) {
    const t = await res.text()
    if (t.includes('UNREGISTERED') || t.includes('INVALID_ARGUMENT')) return 'gone'
  }
  return res.ok ? 'ok' : 'error'
}
