import { describe, expect, it } from 'vitest'
import { activeMobileTab, myTripsHref, youMenuItems } from './mobileNav'

describe('activeMobileTab', () => {
  it.each([
    ['/', 'explore'],
    ['/packages/spiti', 'explore'],
    ['/listings/stays/x', 'explore'],
    ['/book/abc', 'explore'],
    ['/bookings', 'trips'],
    ['/booking/123', 'trips'],
    ['/community', 'community'],
    ['/tribe/room', 'community'],
    ['/profile/asha', 'you'],
    ['/host/verify', 'you'],
    ['/leaderboard', 'you'],
    ['/offers', 'you'],
    ['/referrals', 'you'],
    ['/terms', null],
    ['/bookingsx', null],
  ])('%s → %s', (path, tab) => {
    expect(activeMobileTab(path)).toBe(tab)
  })
})

describe('myTripsHref', () => {
  it('sends signed-out visitors to login with a return path', () => {
    expect(myTripsHref(true)).toBe('/bookings')
    expect(myTripsHref(false)).toBe('/login?redirectTo=%2Fbookings')
  })
})

describe('youMenuItems', () => {
  const ids = (items: ReturnType<typeof youMenuItems>) => items.map(i => i.id)

  it('signed-out: discovery items only, host CTA goes through login', () => {
    const items = youMenuItems(null)
    expect(ids(items)).toEqual(['hosting', 'leaderboard', 'offers'])
    expect(items[0]).toMatchObject({ label: 'Become a host', href: '/login?redirectTo=%2Fhost%2Fverify' })
  })

  it('traveller: profile, become-host, discovery and referrals', () => {
    const items = youMenuItems({ username: 'asha', isHost: false, role: 'user' })
    expect(ids(items)).toEqual(['profile', 'edit-profile', 'hosting', 'leaderboard', 'offers', 'referrals'])
    expect(items[0]!.href).toBe('/profile/asha')
    expect(items[2]!.href).toBe('/host/verify')
  })

  it('host admin: hosting dashboard and admin panel', () => {
    const items = youMenuItems({ username: 'ravi', isHost: true, role: 'admin' })
    expect(items.find(i => i.id === 'hosting')).toMatchObject({ label: 'Hosting', href: '/host' })
    expect(ids(items).at(-1)).toBe('admin')
  })
})
