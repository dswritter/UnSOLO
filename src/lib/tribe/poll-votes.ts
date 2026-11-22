import type { SupabaseClient } from '@supabase/supabase-js'

type Row = Record<string, unknown>
export type PollVote = { postId: string; userId: string; choice: string }

/** Missing table (migration 122 not applied yet) or column. */
export function isMissingTable(e: { code?: string; message?: string } | null | undefined) {
  return !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|could not find the table/i.test(e.message ?? ''))
}

/** Votes for these polls: post_poll_votes, or the older vote replies until migration 122 is applied. */
export async function loadPollVotes(db: SupabaseClient, postIds: string[]): Promise<PollVote[]> {
  if (!postIds.length) return []
  const { data, error } = await db.from('post_poll_votes').select('post_id, user_id, choice').in('post_id', postIds)
  if (!error) return ((data ?? []) as Row[]).map((v) => ({ postId: String(v.post_id), userId: String(v.user_id), choice: String(v.choice) }))
  if (!isMissingTable(error)) throw error
  const legacy = await db.from('post_comments').select('post_id, author_id, poll_choice').in('post_id', postIds).not('poll_choice', 'is', null).eq('status', 'live')
  if (legacy.error) throw legacy.error
  return ((legacy.data ?? []) as Row[]).map((v) => ({ postId: String(v.post_id), userId: String(v.author_id), choice: String(v.poll_choice) }))
}

/** { options with counts, myChoice } for one poll, from its option list and votes. */
export function tallyPoll(options: { id: string; label: string }[], votes: PollVote[], viewerId: string | null) {
  const counts = new Map<string, number>()
  for (const v of votes) counts.set(v.choice, (counts.get(v.choice) ?? 0) + 1)
  return {
    options: options.map((o) => ({ id: o.id, label: o.label, votes: counts.get(o.id) ?? 0 })),
    myChoice: viewerId ? votes.find((v) => v.userId === viewerId)?.choice ?? null : null,
  }
}
