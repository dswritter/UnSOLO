import Link from 'next/link'
import { getRequestAuth } from '@/lib/auth/request-session'
import { loadPosts, loadViewer } from '@/lib/tribe/load'
import { todayIST } from '@/lib/tribe/models'
import { SeatRow } from './SeatRow'
import { dateRange } from './format'
import { OfferToHostButton } from './OfferToHostButton'

/**
 * Host demand board (spec growth loop 4): upcoming community plans with open spots that nobody
 * has offered to host yet. A host's offer turns the plan into a paid listing if the organiser
 * accepts. Fails closed when Tribe tables are unavailable.
 */
export async function PlansLookingForHost() {
  try {
    const { supabase, user } = await getRequestAuth()
    if (!user) return null
    const { data, error } = await supabase.from('posts').select('id')
      .eq('kind', 'plan').eq('status', 'live').gte('starts_on', todayIST()).neq('author_id', user.id)
      .order('starts_on', { ascending: true }).limit(12)
    if (error) throw error
    const ids = (data ?? []).map((p) => p.id as string)
    const { data: mine } = ids.length
      ? await supabase.from('host_offers').select('post_id').eq('host_id', user.id).in('post_id', ids)
      : { data: [] as { post_id: string }[] }
    const offered = new Set((mine ?? []).map((o) => o.post_id as string))
    const posts = (await loadPosts(supabase, ids, await loadViewer(supabase, user.id))).slice(0, 6)
    return (
      <section className="mt-8" aria-label="Plans looking for a host">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Plans looking for a host</h2>
            <p className="text-sm text-muted-foreground">Travellers already planning these. Offer to run one as a paid trip — if the organiser accepts, everyone gets a held seat.</p>
          </div>
          <Link href="/tribe" className="pc-link shrink-0 text-sm">All plans →</Link>
        </div>
        {posts.length === 0 ? (
          <p className="pc-pencilled p-4 text-sm text-muted-foreground">No open plans right now. They show up here as travellers post them.</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {posts.map((p) => (
              <li key={p.id} className="pc-pencilled p-4">
                <p className="pc-kicker">Community plan · {p.memberCount} of {p.spotsTotal} going</p>
                <Link href={`/tribe/p/${p.id}`} className="mt-1 block font-semibold hover:underline">{p.title ?? p.place?.name}</Link>
                <p className="text-sm text-muted-foreground">{p.place?.name} · {dateRange(p.startsOn, p.endsOn)}{p.estCostText ? ` · ${p.estCostText}` : ''}</p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <SeatRow seats={p.seats} size="sm" max={8} />
                  {offered.has(p.id)
                    ? <span className="pc-kicker">Offer sent</span>
                    : <OfferToHostButton postId={p.id} placeName={p.place?.name ?? 'this plan'} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    )
  } catch {
    return null
  }
}
