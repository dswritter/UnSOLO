import { describe, expect, it } from 'vitest'
import { isInternalLink, safeInternalLink } from './links'
import { isAllowedWebPushEndpoint } from './push/webpush'

describe('isInternalLink', () => {
  it('accepts same-site paths', () => {
    for (const ok of ['/', '/bookings', '/tribe/p/123#c-9', '/community/abc?x=1']) expect(isInternalLink(ok)).toBe(true)
  })
  it('rejects lookalikes that browsers resolve to another host', () => {
    for (const bad of ['//evil.com', '/\\evil.com', '/\t/evil.com', 'https://evil.com', 'javascript:alert(1)', ' /x', '/a b', '']) {
      expect(isInternalLink(bad)).toBe(false)
    }
    expect(safeInternalLink('//evil.com')).toBe('/activity')
  })
})

describe('isAllowedWebPushEndpoint', () => {
  it('allows only real browser push services over https', () => {
    expect(isAllowedWebPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true)
    expect(isAllowedWebPushEndpoint('https://web.push.apple.com/QG')).toBe(true)
    expect(isAllowedWebPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true)
    expect(isAllowedWebPushEndpoint('https://169.254.169.254/latest/meta-data')).toBe(false)
    expect(isAllowedWebPushEndpoint('http://fcm.googleapis.com/x')).toBe(false)
    expect(isAllowedWebPushEndpoint('https://fcm.googleapis.com.evil.com/x')).toBe(false)
    expect(isAllowedWebPushEndpoint('https://fcm.googleapis.com:8443/x')).toBe(false)
  })
})
