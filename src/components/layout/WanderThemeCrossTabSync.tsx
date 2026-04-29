'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { WANDER_THEME_BUMP_STORAGE_KEY } from '@/lib/wander/wander-theme-bump'

/**
 * When admin saves wander theme in another tab, `storage` fires here so open /wander surfaces
 * pick up `data-wander-shell-season` without a manual reload.
 */
export function WanderThemeCrossTabSync() {
  const router = useRouter()

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === WANDER_THEME_BUMP_STORAGE_KEY && e.newValue) {
        router.refresh()
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [router])

  return null
}
