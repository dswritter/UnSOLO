import { createDecipheriv, createECDH, hkdfSync, randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { encryptPayload } from './webpush'

/** Decrypts as a browser (user agent) would, per RFC 8291 §3.4 — proves the construction round-trips. */
function uaDecrypt(body: Buffer, uaEcdh: ReturnType<typeof createECDH>, auth: Buffer) {
  const salt = body.subarray(0, 16)
  const idlen = body[20]
  const asPublic = body.subarray(21, 21 + idlen)
  const ct = body.subarray(21 + idlen)
  const shared = uaEcdh.computeSecret(asPublic)
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaEcdh.getPublicKey(), asPublic])
  const ikm = Buffer.from(hkdfSync('sha256', shared, auth, keyInfo, 32))
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16))
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12))
  const d = createDecipheriv('aes-128-gcm', cek, nonce)
  d.setAuthTag(ct.subarray(ct.length - 16))
  const pt = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()])
  expect(pt[pt.length - 1]).toBe(2) // last-record delimiter
  return pt.subarray(0, pt.length - 1).toString()
}

describe('web push encryption', () => {
  it('produces an aes128gcm body the subscriber can decrypt', () => {
    const ua = createECDH('prime256v1')
    ua.generateKeys()
    const auth = randomBytes(16)
    const sub = { endpoint: 'https://push.example/x', keys: { p256dh: ua.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } }
    const body = encryptPayload(sub, Buffer.from(JSON.stringify({ title: 'Ananya approved you' })))
    expect(body.readUInt32BE(16)).toBe(4096)
    expect(uaDecrypt(body, ua, auth)).toBe('{"title":"Ananya approved you"}')
  })
})
