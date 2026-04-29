type AppRouterLike = { push: (href: string, options?: { scroll?: boolean }) => void }

/**
 * Next.js soft-navigations scroll to the top by default. On homepage search mode we
 * update query params in place; keep scroll position when only the query string changes.
 */
export function pushExploreUrl(router: AppRouterLike, basePath: string, href: string) {
  const stayPut = basePath === '/' && href.includes('?')
  router.push(href, stayPut ? { scroll: false } : undefined)
}
