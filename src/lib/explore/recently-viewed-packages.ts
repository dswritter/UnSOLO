/** localStorage key shared by /explore and /wander for trip package recents */
export const RECENTLY_VIEWED_PACKAGES_KEY = 'rv_packages'
export const RECENTLY_VIEWED_PACKAGES_MAX = 8

export type RecentlyViewedPackage = {
  id: string
  title: string
  slug: string
  image: string | null
  destName: string
}

export function readRecentlyViewedPackages(): RecentlyViewedPackage[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(RECENTLY_VIEWED_PACKAGES_KEY) || '[]') as RecentlyViewedPackage[]
  } catch {
    return []
  }
}

export function writeRecentlyViewedPackage(pkg: RecentlyViewedPackage) {
  if (typeof window === 'undefined') return
  try {
    const list = readRecentlyViewedPackages().filter(p => p.id !== pkg.id)
    list.unshift(pkg)
    localStorage.setItem(
      RECENTLY_VIEWED_PACKAGES_KEY,
      JSON.stringify(list.slice(0, RECENTLY_VIEWED_PACKAGES_MAX)),
    )
  } catch {
    /* ignore quota / private mode */
  }
}

export function removeRecentlyViewedPackage(id: string) {
  if (typeof window === 'undefined') return
  try {
    const list = readRecentlyViewedPackages().filter(p => p.id !== id)
    localStorage.setItem(RECENTLY_VIEWED_PACKAGES_KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}
