import { announceExploreNavigation } from '@/lib/explore/optimistic-filter'

type AppRouterLike = { push: (href: string, options?: { scroll?: boolean }) => void }

/**
 * Next.js soft-navigations scroll to the top by default. On homepage search mode we
 * update query params in place; keep scroll position when only the query string changes.
 * Also announces the target so on-screen results re-filter before the server responds.
 */
export function pushExploreUrl(router: AppRouterLike, basePath: string, href: string) {
  const stayPut = basePath === '/' && href.includes('?')
  announceExploreNavigation(href)
  router.push(href, stayPut ? { scroll: false } : undefined)
}
