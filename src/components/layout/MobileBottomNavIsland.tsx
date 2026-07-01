import { getRequestProfile } from '@/lib/auth/request-session'
import { MobileBottomNav } from './MobileBottomNav'

/**
 * Async island for the mobile bottom nav. Only `is_host` needs the profile (it
 * picks the last tab's label/href), so this fetches it off the critical path
 * inside a <Suspense>. The `profiles` query is React `cache()`d and shared with
 * NavbarIsland — one round-trip per request.
 */
export async function MobileBottomNavIsland({ userId }: { userId: string | null }) {
  let isHost = false
  if (userId) {
    try {
      const p = await getRequestProfile(userId)
      isHost = !!p?.is_host
    } catch {
      isHost = false
    }
  }
  return <MobileBottomNav isHost={isHost} userId={userId} />
}
