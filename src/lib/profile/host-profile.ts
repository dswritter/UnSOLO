export type HostListingKind = 'trip' | 'service'

export function hostProfileHref(host: { username: string; profileHref?: string }): string | null {
  return host.username ? `/profile/${encodeURIComponent(host.username)}` : host.profileHref || null
}

export function unlinkedHostProfileHref(kind: HostListingKind, listingId: string): string {
  return `/hosts/${kind}/${encodeURIComponent(listingId)}`
}
