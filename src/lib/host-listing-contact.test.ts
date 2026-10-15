import { describe, expect, it } from 'vitest'
import { normalizeHostListingContact, hostListingAssignmentRows, type HostListingAssignment } from './host-listing-contact'

describe('host listing contact normalization', () => {
  it('normalizes one-to-one and array-shaped PostgREST embeds', () => {
    const assignment: HostListingAssignment = { email: 'host@example.com', phone: null, status: 'pending' }
    expect(hostListingAssignmentRows(assignment)).toEqual([assignment])
    expect(hostListingAssignmentRows([assignment])).toEqual([assignment])
    expect(hostListingAssignmentRows(null)).toEqual([])
  })
  it('accepts email only, with case-insensitive matching', () => {
    expect(normalizeHostListingContact({ email: ' Host@Example.com ' })).toEqual({ email: 'host@example.com', phone: null, name: null })
  })
  it.each(['9876543210', '+91 98765-43210', '91 (98765) 43210'])('normalizes Indian phone %s', (phone) => {
    expect(normalizeHostListingContact({ phone })).toEqual({ email: null, phone: '+919876543210', name: null })
  })
  it.each([
    ['+977', '9812345678', '+9779812345678'],
    ['+94', '+94 771234567', '+94771234567'],
    ['+975', '17123456', '+97517123456'],
  ])('normalizes %s independently of India', (countryCode, phone, expected) => {
    expect(normalizeHostListingContact({ phone, countryCode }).phone).toBe(expected)
  })
  it.each([{}, { email: '  ', phone: '' }, { email: 'bad' }, { phone: '123' },
    { phone: '9876543210', countryCode: '+1' }, { phone: 'abc9876543210' }, { phone: '1234567890' },
    { email: 'host@example.com', phone: 'bad' }])('rejects missing or invalid contacts %j', (contact) => {
    expect(() => normalizeHostListingContact(contact)).toThrow()
  })
})