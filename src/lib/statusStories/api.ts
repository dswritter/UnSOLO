import { PROFILE_LITE, mediaFromUrl, toUserLite, type Media, type UserLite } from '@/lib/tribe/models'

type Row = Record<string, unknown>

/** At most this many live statuses per person (web and apps). */
export const MAX_ACTIVE_STATUS = 10
/** Statuses disappear this long after posting. */
export const STATUS_TTL_MS = 24 * 60 * 60 * 1000

export const STATUS_SELECT = `id, author_id, media_url, media_type, caption, link_url, bg_color, created_at, expires_at, author:profiles!status_stories_author_id_fkey(${PROFILE_LITE})`

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
  /** kind → count, e.g. { wanderlust: 3, love: 1 }. */
  reactions: Record<string, number>
  myReaction: string | null
  commentCount: number
}
export type StatusAuthor = { user: UserLite; items: StatusItem[]; unseen: boolean; latestAt: string }

export const STATUS_REACTIONS = ['wanderlust', 'love', 'wow', 'haha', 'clap', 'fire'] as const

export type StatusExtras = { reactions: Map<string, Record<string, number>>; mine: Map<string, string>; comments: Map<string, number> }
const noExtras: StatusExtras = { reactions: new Map(), mine: new Map(), comments: new Map() }

export function toStatusItem(r: Row, seen: Set<string>, x: StatusExtras = noExtras): StatusItem {
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
    reactions: x.reactions.get(String(r.id)) ?? {},
    myReaction: x.mine.get(String(r.id)) ?? null,
    commentCount: x.comments.get(String(r.id)) ?? 0,
  }
}

/** Reaction counts, your reaction and comment counts for these stories (empty before migration 123). */
export async function loadStatusExtras(db: { from: (t: string) => any }, ids: string[], viewerId: string | null): Promise<StatusExtras> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const out: StatusExtras = { reactions: new Map(), mine: new Map(), comments: new Map() }
  if (!ids.length) return out
  const [re, co] = await Promise.all([
    db.from('status_story_reactions').select('story_id, user_id, kind').in('story_id', ids).limit(5000),
    db.from('status_story_comments').select('story_id').in('story_id', ids).limit(5000),
  ])
  for (const r of (re.data ?? []) as Row[]) {
    const k = String(r.story_id)
    const m = out.reactions.get(k) ?? {}
    m[String(r.kind)] = (m[String(r.kind)] ?? 0) + 1
    out.reactions.set(k, m)
    if (viewerId && r.user_id === viewerId) out.mine.set(k, String(r.kind))
  }
  for (const c of (co.data ?? []) as Row[]) out.comments.set(String(c.story_id), (out.comments.get(String(c.story_id)) ?? 0) + 1)
  return out
}

/**
 * Rows (any order) → one entry per person, oldest status first inside each (that's the viewing
 * order). Your own comes first, then people with something unseen, then the most recent.
 */
export function groupStatuses(rows: Row[], seen: Set<string>, viewerId: string | null, extras: StatusExtras = noExtras): StatusAuthor[] {
  const by = new Map<string, StatusAuthor>()
  for (const r of [...rows].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))) {
    const id = String(r.author_id)
    const item = toStatusItem(r, seen, extras)
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
