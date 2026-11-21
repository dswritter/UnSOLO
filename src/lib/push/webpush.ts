/**
 * Web Push (RFC 8291 aes128gcm payload encryption + RFC 8292 VAPID) with node:crypto only.
 * Env: NEXT_PUBLIC_VAPID_PUBLIC_KEY (base64url, 65-byte uncompressed P-256 point),
 *      VAPID_PRIVATE_KEY (base64url, 32-byte scalar), VAPID_SUBJECT (mailto: or https: URL).
 */
import { createCipheriv, createECDH, createPrivateKey, hkdfSync, randomBytes, sign, type ECDH } from 'node:crypto'

export type WebPushSubscription = { endpoint: string; keys: { p256dh: string; auth: string } }

const b64u = (b: Buffer) => b.toString('base64url')
const fromB64u = (s: string) => Buffer.from(s, 'base64url')

function hkdf(salt: Buffer, ikm: Buffer, info: Buffer, len: number) {
  return Buffer.from(hkdfSync('sha256', ikm, salt, info, len))
}

/** Encrypts `payload` for one subscription → request body (aes128gcm, single record). */
export function encryptPayload(sub: WebPushSubscription, payload: Buffer, salt = randomBytes(16), ecdh?: ECDH) {
  if (!ecdh) {
    ecdh = createECDH('prime256v1')
    ecdh.generateKeys()
  }
  const asPublic = ecdh.getPublicKey()
  const uaPublic = fromB64u(sub.keys.p256dh)
  const authSecret = fromB64u(sub.keys.auth)
  const shared = ecdh.computeSecret(uaPublic)
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic])
  const ikm = hkdf(authSecret, shared, keyInfo, 32)
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16)
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12)
  const cipher = createCipheriv('aes-128-gcm', cek, nonce)
  const body = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()])
  const rs = Buffer.alloc(4)
  rs.writeUInt32BE(4096)
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body])
}

function vapidJwt(audience: string, subject: string, publicKey: string, privateKey: string) {
  const pub = fromB64u(publicKey)
  const jwk = { kty: 'EC', crv: 'P-256', d: privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }
  const key = createPrivateKey({ key: jwk, format: 'jwk' })
  const header = b64u(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64u(Buffer.from(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })))
  const sig = sign('sha256', Buffer.from(`${header}.${claims}`), { key, dsaEncoding: 'ieee-p1363' })
  return `${header}.${claims}.${b64u(sig)}`
}

/** Known browser push services. Anything else is refused (we never POST to arbitrary URLs). */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^[a-z0-9-]+\.push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/, /^[a-z0-9-]+\.push\.apple\.com$/, /^[a-z0-9-]+\.notify\.windows\.com$/, /^android\.googleapis\.com$/]
export function isAllowedWebPushEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint)
    return u.protocol === 'https:' && !u.port && PUSH_HOSTS.some((re) => re.test(u.hostname))
  } catch {
    return false
  }
}

export function webPushConfigured() {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
}

/** Returns 'gone' when the subscription is expired (404/410) so the caller can delete it. */
export async function sendWebPush(sub: WebPushSubscription, data: object): Promise<'ok' | 'gone' | 'error'> {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) return 'error'
  if (!isAllowedWebPushEndpoint(sub.endpoint)) return 'gone'
  const url = new URL(sub.endpoint)
  const jwt = vapidJwt(url.origin, process.env.VAPID_SUBJECT || 'mailto:hello@unsolo.in', pub, priv)
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${jwt}, k=${pub}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'normal',
    },
    body: new Uint8Array(encryptPayload(sub, Buffer.from(JSON.stringify(data)))),
  })
  if (res.status === 404 || res.status === 410) return 'gone'
  return res.ok ? 'ok' : 'error'
}
