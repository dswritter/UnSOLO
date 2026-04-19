import type { User } from '@supabase/supabase-js'

/**
 * Best-effort email for transactional mail. Auth stores email on the user, but
 * phone-first signups or some OAuth flows may only expose email inside identities[].identity_data.
 */
export function getEmailFromAuthUser(user: User | null | undefined): string | undefined {
  if (!user) return undefined
  const direct = user.email?.trim()
  if (direct) return direct
  for (const identity of user.identities ?? []) {
    const data = identity.identity_data as Record<string, unknown> | undefined
    const em = data?.email
    if (typeof em === 'string' && em.trim()) return em.trim()
  }
  return undefined
}
