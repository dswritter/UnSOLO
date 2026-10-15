'use server'

import { loadExploreListData, type ExploreListPayload } from '@/lib/explore/explorePageData'

const MAX_PAGE = 1000

/** Loads the next public Explore page for an explicit, shareable filter set. */
export async function loadMoreExploreListings(params: Record<string, string>, page: number): Promise<ExploreListPayload> {
  if (!params || typeof params !== 'object') throw new Error('Invalid Explore filters')
  const normalizedPage = Math.max(1, Math.min(MAX_PAGE, Math.floor(Number(page) || 1)))
  return loadExploreListData({ ...params, page: String(normalizedPage) })
}
