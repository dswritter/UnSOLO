import Link from 'next/link'
import { MessageSquare } from 'lucide-react'
import { getRequestAuth } from '@/lib/auth/request-session'
import { loadPosts, loadViewer } from '@/lib/tribe/load'
import { SeatRing, ringCaption, segsFromSeats } from './SeatRing'
import { initials } from './format'
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
            <li key={p.id} className="pc-pencilled flex flex-wrap items-center gap-3.5 p-4">
              <PlanRingSmall seats={p.seats} women={p.audience === 'women'} photo={p.author.avatarUrl} name={p.author.name} />
              <div className="min-w-0 flex-1">
                <p className="pc-kicker">{p.viewer.isAuthor ? 'You organise' : p.viewer.membership === 'requested' ? 'Request pending' : 'You’re in'}</p>
                <Link href={`/tribe/p/${p.id}`} className="block truncate text-[16px] font-bold hover:underline">{p.title ?? p.place?.name}</Link>
                <p className="text-sm text-muted-foreground">{p.place?.name} · {dateRange(p.startsOn, p.endsOn)}</p>
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

function PlanRingSmall({ seats, women, photo, name }: { seats: Parameters<typeof segsFromSeats>[0]; women: boolean; photo: string | null; name: string }) {
  const { segs } = segsFromSeats(seats, { hostIsBadge: false })
  const taken = segs.filter((x) => x.state !== 'open').length
  return (
    <span className="flex items-center gap-2.5">
      <SeatRing segs={segs} size={64} variant="plan" women={women} photo={photo} showDots={false} center={photo ? undefined : { big: initials(name), fontSize: 15 }} />
      <span className="fc-caption hidden text-[12.5px] sm:block">{ringCaption(segs.length, taken)}</span>
    </span>
  )
}
