'use client'

import { startTransition } from 'react'

type RouterPush = { push: (href: string) => void }

/**
 * Client navigations that bypass `<Link>` (e.g. div cards, bottom bar) do not
 * surface Next’s route `loading.tsx` unless wrapped in `startTransition`.
 * We also dispatch `unsolo:navigate` so `NavigationProgress` shows the top bar.
 */
export function pushWithRouteProgress(router: RouterPush, href: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('unsolo:navigate'))
  }
  startTransition(() => {
    router.push(href)
  })
}
