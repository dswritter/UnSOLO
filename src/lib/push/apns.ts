/**
 * Apple Push Notification service (token auth, ES256 JWT) over HTTP/2 — node:crypto + node:http2.
 * Env: APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY (.p8 PEM), APNS_BUNDLE_ID, APNS_PRODUCTION=true|false.
 */
import { connect } from 'node:http2'
import { createPrivateKey, sign } from 'node:crypto'

let jwtCache: { jwt: string; iat: number } | null = null

export function apnsConfigured() {
  return !!(process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_PRIVATE_KEY && process.env.APNS_BUNDLE_ID)
}

function providerToken() {
  const now = Math.floor(Date.now() / 1000)
  if (jwtCache && now - jwtCache.iat < 50 * 60) return jwtCache.jwt // Apple: refresh at most every 20–60 min
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const unsigned = `${enc({ alg: 'ES256', kid: process.env.APNS_KEY_ID })}.${enc({ iss: process.env.APNS_TEAM_ID, iat: now })}`
  const key = createPrivateKey((process.env.APNS_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'))
  const sig = sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')
  jwtCache = { jwt: `${unsigned}.${sig}`, iat: now }
  return jwtCache.jwt
}

export async function sendApns(
  deviceToken: string,
  n: { title: string; body?: string | null; link?: string | null; category: string; notificationId?: string },
): Promise<'ok' | 'gone' | 'error'> {
  if (!apnsConfigured() || !/^[0-9a-f]{64,200}$/i.test(deviceToken)) return 'error'
  const host = process.env.APNS_PRODUCTION === 'true' ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com'
  const payload = JSON.stringify({
    aps: { alert: { title: n.title, body: n.body ?? '' }, sound: 'default', 'thread-id': n.category, category: n.category },
    link: n.link ?? null,
    notificationId: n.notificationId ?? null,
  })
  return await new Promise((resolve) => {
    const client = connect(host)
    client.on('error', () => resolve('error'))
    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${deviceToken}`,
      authorization: `bearer ${providerToken()}`,
      'apns-topic': process.env.APNS_BUNDLE_ID!,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    })
    let status = 0
    req.on('response', (h) => { status = Number(h[':status']) })
    req.on('end', () => { client.close(); resolve(status === 200 ? 'ok' : status === 410 || status === 400 ? 'gone' : 'error') })
    req.on('error', () => { client.close(); resolve('error') })
    req.end(payload)
    req.resume()
  })
}
