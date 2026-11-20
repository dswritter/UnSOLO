import Link from 'next/link'
import { MessageSquare } from 'lucide-react'
import { getRequestAuth } from '@/lib/auth/request-session'
import { loadPosts, loadViewer } from '@/lib/tribe/load'
import { SeatRow } from './SeatRow'
import { dateRange } from './format'

/** My trips: community plans you organise or joined (dashed), each with its plan chat. */
export async function MyPlansSection() {
  try {
    const { supabase, user } = await getRequestAuth()
    if (!user) return null
    const { data: m, error } = await supabase.from('plan_members').select('post_id, state').eq('user_id', user.id).in('state', ['approved', 'requested'])
    if (error) throw error
    const ids = (m ?? []).map((r) => r.post_id as string)
    if (ids.length === 0) return null
    const [posts, { data: rooms }] = await Promise.all([
      loadPosts(supabase, ids, await loadViewer(supabase, user.id)),
      supabase.from('chat_rooms').select('id, post_id').in('post_id', ids),
    ])
    const roomFor = new Map((rooms ?? []).map((r) => [r.post_id as string, r.id as string]))
    const live = posts.filter((p) => p.status === 'live')
    if (live.length === 0) return null
    return (
      <section className="mb-8" aria-label="Plans you're in">
        <h2 className="mb-3 text-xl">Plans you&apos;re in</h2>
        <ul className="space-y-3">
          {live.map((p) => (
            <li key={p.id} className="pc-pencilled flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="pc-kicker">Community plan · {p.viewer.isAuthor ? 'you organise' : p.viewer.membership === 'requested' ? 'request pending' : 'you’re in'}</p>
                <Link href={`/tribe/p/${p.id}`} className="block truncate font-semibold hover:underline">{p.title ?? p.place?.name}</Link>
                <p className="text-sm text-muted-foreground">{p.place?.name} · {dateRange(p.startsOn, p.endsOn)}</p>
                <SeatRow seats={p.seats} size="sm" max={8} className="mt-2" />
              </div>
              {roomFor.get(p.id) && p.viewer.membership === 'approved' && (
                <Link href={`/community/${roomFor.get(p.id)}`} className="pc-btn pc-btn-outline pc-btn-sm"><MessageSquare className="h-4 w-4" aria-hidden /> Plan chat</Link>
              )}
            </li>
          ))}
        </ul>
      </section>
    )
  } catch {
    return null
  }
}
