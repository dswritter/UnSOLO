/**
 * Mobile bottom-nav model (Passenger Chart IA): Explore · Tribe · (+) Post · My trips · You.
 * Messages (/community) and Activity open from header icons; "You" is a sheet with the
 * secondary destinations (leaderboard, offers, hosting, settings, account).
 */

export type MobileTabId = 'explore' | 'tribe' | 'post' | 'trips' | 'you'

const startsWithAny = (pathname: string, prefixes: string[]) =>
  prefixes.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))

export function activeMobileTab(pathname: string | null): MobileTabId | null {
  if (!pathname) return null
  if (startsWithAny(pathname, ['/bookings', '/booking'])) return 'trips'
  if (pathname === '/tribe/new') return 'post'
  if (startsWithAny(pathname, ['/tribe', '/activity'])) return 'tribe'
  if (startsWithAny(pathname, ['/profile', '/host', '/leaderboard', '/offers', '/referrals', '/settings'])) return 'you'
  if (pathname === '/' || startsWithAny(pathname, ['/packages', '/listings', '/book'])) return 'explore'
  return null
}

export function myTripsHref(signedIn: boolean): string {
  return signedIn ? '/bookings' : '/login?redirectTo=%2Fbookings'
}

export type YouMenuItem = {
  id: 'profile' | 'edit-profile' | 'hosting' | 'leaderboard' | 'offers' | 'referrals' | 'settings' | 'admin'
  label: string
  description?: string
  href: string
}

export function youMenuItems(viewer: { username: string | null; isHost: boolean; role: string | null } | null): YouMenuItem[] {
  const items: YouMenuItem[] = []
  if (viewer?.username) {
    items.push(
      { id: 'profile', label: 'My profile', href: `/profile/${viewer.username}` },
      { id: 'edit-profile', label: 'Edit profile', href: '/profile' },
    )
  }
  items.push(
    viewer?.isHost
      ? { id: 'hosting', label: 'Hosting', description: 'Your trips, listings and join requests', href: '/host' }
      : { id: 'hosting', label: 'Become a host', description: 'Lead trips and earn', href: viewer ? '/host/verify' : '/login?redirectTo=%2Fhost%2Fverify' },
    { id: 'leaderboard', label: 'Leaderboard', description: 'Top travellers and your rank', href: '/leaderboard' },
    { id: 'offers', label: 'Offers', description: 'Deals and bundles', href: '/offers' },
  )
  if (viewer) {
    items.push({ id: 'referrals', label: 'Refer & earn', href: '/referrals' })
    items.push({ id: 'settings', label: 'Settings', description: 'Start page, notifications, location, privacy', href: '/settings' })
  }
  if (viewer?.role && viewer.role !== 'user') items.push({ id: 'admin', label: 'Admin panel', href: '/admin' })
  return items
}
