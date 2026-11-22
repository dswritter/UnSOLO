import { PROFILE_LITE, mediaFromUrl, toUserLite, type Media, type UserLite } from '@/lib/tribe/models'

type Row = Record<string, unknown>

/** At most this many live statuses per person (web and apps). */
export const MAX_ACTIVE_STATUS = 10
/** Statuses disappear this long after posting. */
export const STATUS_TTL_MS = 24 * 60 * 60 * 1000

export const STATUS_SELECT = `id, author_id, media_url, media_type, caption, link_url, bg_color, created_at, expires_at, author:profiles(${PROFILE_LITE})`

export type StatusItem = {
  id: string
  type: 'image' | 'text' | 'link'
  media: Media | null
  caption: string | null
  linkUrl: string | null
  bgColor: string | null
  createdAt: string
  expiresAt: string
  seen: boolean
}
export type StatusAuthor = { user: UserLite; items: StatusItem[]; unseen: boolean; latestAt: string }

export function toStatusItem(r: Row, seen: Set<string>): StatusItem {
  const t = String(r.media_type ?? 'image')
  return {
    id: String(r.id),
    type: t === 'text' || t === 'link' ? t : 'image',
    media: mediaFromUrl(typeof r.media_url === 'string' ? r.media_url : null),
    caption: typeof r.caption === 'string' && r.caption.trim() ? r.caption : null,
    linkUrl: typeof r.link_url === 'string' && r.link_url ? r.link_url : null,
    bgColor: typeof r.bg_color === 'string' ? r.bg_color : null,
    createdAt: String(r.created_at),
    expiresAt: String(r.expires_at),
    seen: seen.has(String(r.id)),
  }
}

/**
 * Rows (any order) → one entry per person, oldest status first inside each (that's the viewing
 * order). Your own comes first, then people with something unseen, then the most recent.
 */
export function groupStatuses(rows: Row[], seen: Set<string>, viewerId: string | null): StatusAuthor[] {
  const by = new Map<string, StatusAuthor>()
  for (const r of [...rows].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))) {
    const id = String(r.author_id)
    const item = toStatusItem(r, seen)
    const cur = by.get(id) ?? { user: toUserLite((r.author as Row | null) ?? { id }), items: [], unseen: false, latestAt: item.createdAt }
    cur.items.push(item)
    if (!item.seen && id !== viewerId) cur.unseen = true
    if (item.createdAt > cur.latestAt) cur.latestAt = item.createdAt
    by.set(id, cur)
  }
  return [...by.values()].sort((a, b) =>
    Number(b.user.id === viewerId) - Number(a.user.id === viewerId) ||
    Number(b.unseen) - Number(a.unseen) ||
    b.latestAt.localeCompare(a.latestAt))
}
