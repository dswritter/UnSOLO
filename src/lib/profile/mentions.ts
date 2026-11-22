import type { SupabaseClient } from '@supabase/supabase-js'
import { PROFILE_LITE, toUserLite } from '@/lib/tribe/models'
import type { UserLite } from '@/lib/tribe/models'

type Row = Record<string, unknown>

/** `@username` tokens in a caption (usernames are letters, digits, _ . -), lower-cased, unique, at most 10. */
export function extractMentions(text: string | null | undefined): string[] {
  if (!text) return []
  const out = new Set<string>()
  for (const m of text.matchAll(/(^|[^A-Za-z0-9_.@-])@([A-Za-z0-9_][A-Za-z0-9_.-]{0,39})/g)) {
    const u = m[2].replace(/[.-]+$/, '').toLowerCase()
    if (u) out.add(u)
    if (out.size >= 10) break
  }
  return [...out]
}

/** Keeps the characters a name or username can have, so the text is safe inside a PostgREST filter. */
export function cleanQuery(q: string): string {
  return q.replace(/^@/, '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 40)
}

/**
 * People on UnSOLO matching [q] by name or username: people you follow first, then the closest
 * matches (starts with, then contains). Leaves out you and anyone you've blocked.
 */
export async function searchPeople(db: SupabaseClient, q: string, viewerId: string | null, limit = 10): Promise<UserLite[]> {
  const term = cleanQuery(q)
  if (!term) return []
  const like = `%${term.replace(/[%_]/g, (c) => `\\${c}`)}%`
  const { data, error } = await db.from('profiles').select(PROFILE_LITE)
    .or(`username.ilike.${like},full_name.ilike.${like}`).limit(25)
  if (error) throw error
  let rows = (data ?? []) as Row[]
  let follows = new Set<string>()
  if (viewerId) {
    const ids = rows.map((r) => String(r.id))
    const [blocks, fol] = await Promise.all([
      db.from('user_blocks').select('blocked_id').eq('blocker_id', viewerId),
      ids.length ? db.from('follows').select('following_id').eq('follower_id', viewerId).in('following_id', ids) : Promise.resolve({ data: [] as Row[] }),
    ])
    const blocked = new Set(((blocks.data ?? []) as Row[]).map((b) => String(b.blocked_id)))
    follows = new Set(((fol.data ?? []) as Row[]).map((f) => String(f.following_id)))
    rows = rows.filter((r) => String(r.id) !== viewerId && !blocked.has(String(r.id)))
  }
  const t = term.toLowerCase()
  const score = (r: Row) => {
    const u = String(r.username ?? '').toLowerCase(), n = String(r.full_name ?? '').toLowerCase()
    const starts = u.startsWith(t) || n.startsWith(t) || n.split(/\s+/).some((w) => w.startsWith(t))
    return (follows.has(String(r.id)) ? 0 : 2) + (starts ? 0 : 1)
  }
  return rows.filter((r) => r.username).sort((a, b) => score(a) - score(b)).slice(0, limit).map(toUserLite)
}

/**
 * Tells people mentioned in a story. Only people who can see it: everyone for an open story, just
 * your followers for a followers-only one. Never you, never someone who blocked you.
 */
export async function notifyStoryMentions(svc: SupabaseClient, author: { id: string; name: string; username?: string | null }, caption: string | null, audience: 'all' | 'followers'): Promise<number> {
  const names = extractMentions(caption)
  if (!names.length) return 0
  const { data } = await svc.from('profiles').select('id, username').in('username', names)
  let ids = ((data ?? []) as Row[]).map((r) => String(r.id)).filter((id) => id !== author.id)
  if (!ids.length) return 0
  const { data: blocks } = await svc.from('user_blocks').select('blocker_id').eq('blocked_id', author.id).in('blocker_id', ids)
  const blockedMe = new Set(((blocks ?? []) as Row[]).map((b) => String(b.blocker_id)))
  ids = ids.filter((id) => !blockedMe.has(id))
  if (audience === 'followers' && ids.length) {
    const { data: f } = await svc.from('follows').select('follower_id').eq('following_id', author.id).in('follower_id', ids)
    const followers = new Set(((f ?? []) as Row[]).map((r) => String(r.follower_id)))
    ids = ids.filter((id) => followers.has(id))
  }
  await Promise.all(ids.map((id) => svc.rpc('create_notification', {
    p_user_id: id, p_type: 'story_mention', p_title: `${author.name} mentioned you in their story`,
    p_body: caption?.slice(0, 140) ?? null, p_link: author.username ? `/profile/${author.username}` : '/', p_metadata: { actor_id: author.id },
  })))
  return ids.length
}
