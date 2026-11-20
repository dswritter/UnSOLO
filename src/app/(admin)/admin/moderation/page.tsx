import { requireAdminPagePermission } from '@/lib/auth/admin-page'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { loadModerationQueue, type QueueItem } from '@/lib/moderation/queue'
import { AdminPageHeader } from '@/components/admin/ui/AdminPrimitives'
import { ModerationClient, type HeldPost } from './ModerationClient'

export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ state?: string }> }

export default async function ModerationPage({ searchParams }: Props) {
  const staff = await requireAdminPagePermission('moderation')
  const { state: raw } = await searchParams
  const state = ['open', 'in_review', 'actioned', 'dismissed', 'held'].includes(raw ?? '') ? raw! : 'open'
  const svc = createServiceRoleClient()
  let queue: { items: QueueItem[]; counts: Record<string, number> } = { items: [], counts: {} }
  let held: HeldPost[] = []
  let schemaMissing = false
  try {
    if (state === 'held') {
      const { data, error } = await svc.from('posts').select('id, kind, title, body, moderation_flags, created_at, author:profiles!posts_author_id_fkey(username, full_name)')
        .eq('status', 'held').order('created_at', { ascending: true }).limit(100)
      if (error) throw error
      held = (data ?? []).map((p) => ({ id: p.id, kind: p.kind, title: p.title, body: p.body, flags: p.moderation_flags ?? [], createdAt: p.created_at,
        author: (p.author as unknown as { username: string; full_name: string | null } | null)?.full_name ?? (p.author as unknown as { username: string } | null)?.username ?? '—' }))
    } else {
      queue = await loadModerationQueue(svc, state, 50, 0)
    }
  } catch {
    schemaMissing = true
  }
  return (
    <div>
      <AdminPageHeader title="Tribe moderation" description="Safety reports first (2 h target), everything else within 24 h. Every action is logged and the person is told why." />
      {schemaMissing
        ? <p className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">Apply migrations 119–121 to enable the moderation queue.</p>
        : <ModerationClient state={state} items={queue.items} counts={queue.counts} held={held} isAdmin={staff.role === 'admin'} />}
    </div>
  )
}
