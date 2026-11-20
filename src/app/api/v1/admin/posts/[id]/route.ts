import { z } from 'zod'
import { getApiContext } from '@/lib/api/context'
import { ok, parseJson, parseWith, route, uuid } from '@/lib/api/http'
import { requireStaffPermission } from '@/lib/api/staff'

type Ctx = { params: Promise<{ id: string }> }

/** Staff decision on a post held by screening (money / blocklist): publish or remove. */
export const POST = route(async (req: Request, { params }: Ctx) => {
  const id = parseWith(uuid, (await params).id)
  const ctx = await getApiContext(req)
  const staff = await requireStaffPermission(ctx, 'moderation')
  const b = await parseJson(req, z.object({ status: z.enum(['live', 'removed', 'hidden']), note: z.string().trim().min(3).max(2000) }))
  const svc = ctx.service()
  const { data: post, error } = await svc.from('posts').update({ status: b.status }).eq('id', id).select('author_id, kind').single()
  if (error) throw error
  await Promise.all([
    svc.from('moderation_actions').insert({ actor_id: staff.userId, target_type: 'post', target_id: id, action: b.status === 'live' ? 'restore' : b.status === 'removed' ? 'remove' : 'hide', note: b.note }),
    svc.from('audit_logs').insert({ admin_id: staff.userId, action: `moderation.post_${b.status}`, target_type: 'post', target_id: id, details: { note: b.note } }),
    svc.from('notifications').insert({
      user_id: post.author_id, type: 'moderation',
      title: b.status === 'live' ? `Your ${post.kind} is live` : `Your ${post.kind} wasn’t published`,
      body: b.status === 'live' ? null : `Reason: ${b.note}. Think this is wrong? Reply from Help → Appeal within 15 days.`,
      link: `/tribe/p/${id}`, metadata: { category: 'system', post_id: id },
    }),
  ])
  return ok({ status: b.status })
})
