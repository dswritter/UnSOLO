import { describe, expect, it } from 'vitest'
import {
  dedupeHostListingContacts, hostSearchEmail, parseHostListingContacts,
  hostSearchPhone, hostSearchQuery, type HostListingContactOption,
} from './host-listing-search'

const option = (overrides: Partial<HostListingContactOption> = {}): HostListingContactOption => ({
  id: 'previous-listing:1', label: 'Host', email: 'host@example.com', phone: null,
  source: 'previous-listing', verified: false, ...overrides,
})

describe('host contact search helpers', () => {
  it('trims suggestions/search queries and bounds untrusted input', () => {
    expect(hostSearchQuery('  ')).toBe('')
    expect(hostSearchQuery(' Host ')).toBe('Host')
    expect(hostSearchQuery('a'.repeat(100))).toHaveLength(100)
    expect(() => hostSearchQuery('a'.repeat(101))).toThrow('maximum 100')
    expect(() => hostSearchQuery(null as unknown as string)).toThrow('Invalid')
    expect(() => hostSearchQuery('hello\nworld')).toThrow('Invalid')
  })
  it('keeps punctuation literal for the parameterized RPC', () => {
    for (const query of ['*', '%', '_', 'x),is_host.eq.false,"\\', "'; DROP TABLE profiles; --"]) {
      expect(hostSearchQuery(query)).toBe(query)
    }
  })
  it.each([
    ['9876543210', '+91', '+919876543210'],
    ['919876543210', '+91', '+919876543210'],
    ['9812345678', '+977', '+9779812345678'],
    ['+1 (202) 555-0123', '+91', '+12025550123'],
    ['+012345678', '+91', null],
    ['123', '+91', null],
    ['not a phone', '+91', null],
    [null, '+91', null],
  ])('normalizes %s consistently with assignment matching', (raw, country, expected) => {
    expect(hostSearchPhone(raw, country)).toBe(expected)
  })
  it('validates contact emails, not just their existence', () => {
    expect(hostSearchEmail(' HOST@Example.com ')).toBe('host@example.com')
    expect(hostSearchEmail('not an email')).toBeNull()
    expect(hostSearchEmail(null)).toBeNull()
  })
  it('validates unknown RPC rows, normalizes contacts and drops unusable contacts', () => {
    expect(parseHostListingContacts([
      option({ email: ' HOST@Example.com ', subtitle: undefined }),
      option({ email: null, phone: '+1 (202) 555-0123' }),
      option({ email: 'invalid', phone: '123' }),
    ])).toEqual([
      option({ email: 'host@example.com', subtitle: undefined }),
      option({ email: null, phone: '+12025550123', subtitle: undefined }),
    ])
    expect(parseHostListingContacts([{ ...option(), subtitle: null }])[0].subtitle).toBeUndefined()
  })
  it.each([null, {}, [null], [{ ...option(), verified: true }], [{ ...option(), source: 'other' }],
    [{ ...option(), email: 123 }], [{ ...option(), id: 'registered:1' }],
    Array.from({ length: 41 }, () => option()),
  ])('fails closed on an invalid RPC response %j', data => {
    expect(() => parseHostListingContacts(data)).toThrow('Unable to search')
  })
  it('prefers registered verified pairs and suppresses prior contact subsets', () => {
    const registered = option({ id: 'registered:1', source: 'registered', verified: true, phone: '+919876543210' })
    expect(dedupeHostListingContacts([
      option(), option({ id: 'old:2', email: null, phone: registered.phone }),
      option({ id: 'old:3', phone: registered.phone }), registered,
    ])).toEqual([registered])
  })
  it('retains differing contact pairs without manufacturing a merged identity', () => {
    const a = option({ id: 'a', phone: '+919876543210' })
    const b = option({ id: 'b', phone: '+919999999999' })
    expect(dedupeHostListingContacts([a, b, option({ id: 'c', email: null, phone: b.phone })])).toEqual([
      a, b, option({ id: 'c', email: null, phone: b.phone }),
    ])
  })
  it('drops missing contacts and caps the combined output at twenty', () => {
    const options = Array.from({ length: 40 }, (_, i) => option({ id: String(i), email: `host${i}@example.com` }))
    expect(dedupeHostListingContacts([option({ email: null }), ...options])).toHaveLength(20)
  })
})