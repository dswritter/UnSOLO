import type { SupabaseClient } from '@supabase/supabase-js'
import { PROFILE_LITE, toUserLite, type UserLite } from '@/lib/tribe/models'

export type QueueItem = {
  id: string
  targetType: 'post' | 'comment' | 'user' | 'message'
  targetId: string
  reason: string
  details: string | null
  priority: 'safety' | 'normal'
  state: string
  dueAt: string | null
  overdue: boolean
  createdAt: string
  reportCount: number
  reporter: UserLite
  targetUser: UserLite | null
  preview: { title: string | null; body: string; status: string | null; link: string | null; flags: string[] }
}

type Row = Record<string, unknown>

/** Safety first, then oldest due date. Groups repeat reports on the same target. */
export async function loadModerationQueue(svc: SupabaseClient, state: string, limit = 30, offset = 0) {
  const { data, error } = await svc.from('reports')
    .select(`*, reporter:profiles!reports_reporter_id_fkey(${PROFILE_LITE}), target_user:profiles!reports_target_user_id_fkey(${PROFILE_LITE})`)
    .eq('state', state).order('priority', { ascending: false }).order('due_at', { ascending: true }).limit(500)
  if (error) throw error
  const rows = (data ?? []) as Row[]
  const grouped = new Map<string, { first: Row; count: number }>()
  for (const r of rows) {
    const k = `${r.target_type}:${r.target_id}`
    const g = grouped.get(k)
    if (g) g.count++
    else grouped.set(k, { first: r, count: 1 })
  }
  const list = [...grouped.values()]
  const page = list.slice(offset, offset + limit)
  const ids = (type: string) => page.filter((g) => g.first.target_type === type).map((g) => String(g.first.target_id))
  const [posts, comments, messages] = await Promise.all([
    ids('post').length ? svc.from('posts').select('id, kind, title, body, status, moderation_flags').in('id', ids('post')) : Promise.resolve({ data: [] }),
    ids('comment').length ? svc.from('post_comments').select('id, post_id, body, status').in('id', ids('comment')) : Promise.resolve({ data: [] }),
    ids('message').length ? svc.from('messages').select('id, room_id, content').in('id', ids('message')) : Promise.resolve({ data: [] }),
  ])
  const by = (d: { data: unknown }) => new Map(((d.data ?? []) as Row[]).map((x) => [String(x.id), x]))
  const P = by(posts), C = by(comments), M = by(messages)
  const now = Date.now()
  const items: QueueItem[] = page.map(({ first: r, count }) => {
    const tid = String(r.target_id)
    const tt = r.target_type as QueueItem['targetType']
    const p = P.get(tid), c = C.get(tid), m = M.get(tid)
    const tu = r.target_user as Row | null
    const preview = tt === 'post' && p ? { title: (p.title as string | null) ?? `${p.kind}`, body: String(p.body ?? ''), status: String(p.status), link: `/tribe/p/${tid}`, flags: (p.moderation_flags as string[]) ?? [] }
      : tt === 'comment' && c ? { title: 'Comment', body: String(c.body), status: String(c.status), link: `/tribe/p/${c.post_id}#c-${tid}`, flags: [] }
      : tt === 'message' && m ? { title: 'Chat message', body: String(m.content), status: null, link: null, flags: [] }
      : tt === 'user' && tu ? { title: 'Profile', body: `@${tu.username}`, status: null, link: `/profile/${tu.username}`, flags: [] }
      : { title: null, body: '(deleted)', status: null, link: null, flags: [] }
    return {
      id: String(r.id), targetType: tt, targetId: tid, reason: String(r.reason), details: (r.details as string | null) ?? null,
      priority: r.priority as QueueItem['priority'], state: String(r.state), dueAt: (r.due_at as string | null) ?? null,
      overdue: !!r.due_at && Date.parse(String(r.due_at)) < now, createdAt: String(r.created_at), reportCount: count,
      reporter: toUserLite(r.reporter as Row), targetUser: tu ? toUserLite(tu) : null, preview,
    }
  })
  const counts = { open: 0, in_review: 0, overdue: 0, safety: 0 }
  for (const g of list) {
    if (g.first.priority === 'safety') counts.safety++
    if (g.first.due_at && Date.parse(String(g.first.due_at)) < now) counts.overdue++
  }
  return { items, hasMore: list.length > offset + limit, counts: { ...counts, [state]: list.length } }
}
