import { getRequestProfile } from '@/lib/auth/request-session'
import type { Profile } from '@/types'
import { Navbar } from './Navbar'

/**
 * Async island that fetches the signed-in user's profile and renders the Navbar.
 * Rendered inside a <Suspense> in the main layout so the profile query no longer
 * blocks the shell + page children from streaming. When signed out (userId null)
 * it resolves immediately with no DB round-trip.
 *
 * The profile fetch is React `cache()`d, so this and MobileBottomNavIsland share
 * a single `profiles` query per request.
 */
export async function NavbarIsland({ userId }: { userId: string | null }) {
  let profile: Profile | null = null
  if (userId) {
    try {
      profile = await getRequestProfile(userId)
    } catch {
      profile = null
    }
  }
  return <Navbar user={profile} />
}

/** Suspense fallback: same Navbar shell, avatar rendered as a skeleton while the profile streams. */
export function NavbarFallback({ authPending }: { authPending: boolean }) {
  return <Navbar user={null} authPending={authPending} />
}
