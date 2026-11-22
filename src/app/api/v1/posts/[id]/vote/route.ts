import { z } from 'zod'
import { getApiContext, requireVerifiedContact } from '@/lib/api/context'
import { ApiError, ok, parseJson, parseWith, route, uuid } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rate-limit'
import { isMissingTable, loadPollVotes, tallyPoll } from '@/lib/tribe/poll-votes'

type Ctx = { params: Promise<{ id: string }> }
type Row = Record<string, unknown>

const Body = z.object({ choice: z.string().regex(/^[a-d]$/).nullable() })

/**
 * PUT /posts/{id}/vote { choice: "a".."d" | null }: sets (or with null, clears) your one vote on a
 * poll and returns the poll's new counts. Changing your mind updates the same vote; no reply is posted.
 */
export const PUT = route(async (req: Request, { params }: Ctx) => {
  const id = parseWith(uuid, (await params).id)
  const ctx = await getApiContext(req)
  const user = await requireVerifiedContact(ctx)
  const { choice } = await parseJson(req, Body)
  const svc = ctx.service()

  const { data: post } = await ctx.db.from('posts').select('id, author_id, status, kind, poll_options').eq('id', id).maybeSingle()
  if (!post) throw new ApiError('not_found', 'This post is no longer available')
  const options = Array.isArray(post.poll_options) ? (post.poll_options as Row[]).map((o) => ({ id: String(o.id), label: String(o.label) })) : []
  if (post.kind !== 'ask' || !options.length) throw new ApiError('bad_request', 'This post has no poll')
  if (post.status !== 'live') throw new ApiError('forbidden', 'This poll is closed')
  if (choice && !options.some((o) => o.id === choice)) throw new ApiError('bad_request', 'That option isn’t on this poll', { field: 'choice' })
  const { data: blocked } = await svc.rpc('is_blocked_between', { a: post.author_id, b: user.id })
  if (blocked === true) throw new ApiError('forbidden', 'You can’t vote on this poll')
  await enforceRateLimit(ctx, 'vote')

  const write = choice
    ? await svc.from('post_poll_votes').upsert({ post_id: id, user_id: user.id, choice, updated_at: new Date().toISOString() }, { onConflict: 'post_id,user_id' })
    : await svc.from('post_poll_votes').delete().eq('post_id', id).eq('user_id', user.id)
  if (write.error) {
    if (!isMissingTable(write.error)) throw write.error
    // Before migration 122: the vote lives on one reply per person. Change that reply's choice
    // rather than adding another; only a first vote creates it.
    const { data: mine } = await svc.from('post_comments').select('id').eq('post_id', id).eq('author_id', user.id)
      .is('parent_id', null).eq('status', 'live').not('poll_choice', 'is', null).order('created_at', { ascending: false }).limit(1)
    if (mine?.length) {
      const r = await svc.from('post_comments').update({ poll_choice: choice }).eq('id', String(mine[0].id))
      if (r.error) throw r.error
    } else if (choice) {
      const label = options.find((o) => o.id === choice)?.label ?? choice
      const r = await svc.from('post_comments').insert({ post_id: id, author_id: user.id, body: `Voted: ${label}`.slice(0, 2000), poll_choice: choice })
      if (r.error) throw r.error
    }
  }
  const votes = await loadPollVotes(svc, [id])
  return ok({ poll: tallyPoll(options, votes, user.id) })
})
