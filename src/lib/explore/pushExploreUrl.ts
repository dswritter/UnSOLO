type AppRouterLike = { push: (href: string, options?: { scroll?: boolean }) => void }

/**
 * Next.js soft-navigations scroll to the top by default. On Wander search mode we
 * update query params in place; the URL always includes `?` while filters/search apply.
 * Bare `basePath` (e.g. clear-all → `/wander`) still uses default scroll.
 */
export function pushExploreUrl(router: AppRouterLike, basePath: string, href: string) {
  const stayPut = basePath === '/wander' && href.includes('?')
  router.push(href, stayPut ? { scroll: false } : undefined)
}
