'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

type FollowersCountContextValue = {
  count: number
  setCount: (updater: (prev: number) => number) => void
}

const FollowersCountContext = createContext<FollowersCountContextValue | null>(null)

/**
 * Bridges the Follow/Unfollow button and the followers count label — they're
 * separate client components in the profile page's server-rendered JSX (split
 * by the bio and other markup in between), so a plain useState in either one
 * can't reach the other. This lets the button's optimistic toggle update the
 * count instantly instead of waiting on the trailing router.refresh().
 */
export function FollowersCountProvider({
  initialCount,
  children,
}: {
  initialCount: number
  children: ReactNode
}) {
  const [count, setCount] = useState(initialCount)
  return (
    <FollowersCountContext.Provider value={{ count, setCount }}>
      {children}
    </FollowersCountContext.Provider>
  )
}

/** Returns null when rendered outside a FollowersCountProvider (e.g. own-profile view). */
export function useFollowersCount() {
  return useContext(FollowersCountContext)
}
