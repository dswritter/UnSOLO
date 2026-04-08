const STORAGE_KEY = 'unsolo_status_viewed_v2'

function readMap(): Record<string, string[]> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const data = JSON.parse(raw) as Record<string, string[]>
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

/** Mark story ids as seen for this viewer (persists in localStorage). */
export function markStatusStoriesViewed(viewerUserId: string, storyIds: string[]) {
  if (typeof window === 'undefined' || !storyIds.length) return
  try {
    const data = readMap()
    const prev = new Set(data[viewerUserId] || [])
    storyIds.forEach(id => prev.add(id))
    data[viewerUserId] = [...prev]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    /* ignore quota / private mode */
  }
}

export function getViewedStoryIdsForViewer(viewerUserId: string): Set<string> {
  const data = readMap()
  return new Set(data[viewerUserId] || [])
}

/**
 * Fully viewed if every story id is marked locally OR recorded server-side (cross-device).
 */
export function isStoryGroupFullyViewed(
  viewerUserId: string,
  stories: { id: string }[],
  serverSeenStoryIds?: string[],
): boolean {
  if (stories.length === 0) return true
  const local = getViewedStoryIdsForViewer(viewerUserId)
  const server = new Set(serverSeenStoryIds ?? [])
  return stories.every(s => local.has(s.id) || server.has(s.id))
}
