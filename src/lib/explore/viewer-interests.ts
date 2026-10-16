import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * The viewer's own "interested" package ids, loaded once per user in the browser
 * so server-rendered (cached, public) trip rows never wait on the session.
 */
const loads = new Map<string, Promise<Set<string>>>()

export function loadViewerInterestedPackageIds(userId: string): Promise<Set<string>> {
  let pending = loads.get(userId)
  if (!pending) {
    pending = Promise.resolve(
      createClient().from('package_interests').select('package_id').eq('user_id', userId).limit(1000),
    ).then(({ data, error }) => {
      if (error) throw error
      return new Set((data || []).map((row) => row.package_id as string))
    })
    pending.catch(() => loads.delete(userId))
    loads.set(userId, pending)
  }
  return pending
}

/** Keep the shared set in sync after a successful toggle so remounted cards stay correct. */
export function rememberViewerInterest(userId: string, packageId: string, interested: boolean) {
  void loads.get(userId)?.then((ids) => {
    if (interested) ids.add(packageId)
    else ids.delete(packageId)
  }, () => {})
}

/** `null` until known (signed out, still loading, or failed). */
export function useViewerInterested(userId: string | null, packageId: string): boolean | null {
  const [state, setState] = useState<{ key: string; value: boolean } | null>(null)
  const key = userId ? `${userId}:${packageId}` : ''

  useEffect(() => {
    if (!userId) return
    let active = true
    loadViewerInterestedPackageIds(userId).then(
      (ids) => { if (active) setState({ key: `${userId}:${packageId}`, value: ids.has(packageId) }) },
      () => {},
    )
    return () => { active = false }
  }, [userId, packageId])

  return state && state.key === key ? state.value : null
}

/** Test hook. */
export function resetViewerInterestsForTests() {
  loads.clear()
}
