import Link from 'next/link'
import { createPublicClient } from '@/lib/supabase/public-client'
import { loadPosts } from '@/lib/tribe/load'
import { DEMO_POSTS, shouldUseDemo } from '@/lib/tribe/demo'
import { todayIST, type Post } from '@/lib/tribe/models'
import { PlanMiniCard } from '@/components/explore/fc/PlanMiniCard'

async function loadOpenPlans(limit: number): Promise<Post[]> {
  try {
    const db = createPublicClient()
    const { data, error } = await db.from('posts').select('id').eq('kind', 'plan').eq('status', 'live')
      .gte('starts_on', todayIST()).order('created_at', { ascending: false }).limit(limit * 2)
    if (error) throw error
    const posts = await loadPosts(db, (data ?? []).map((r) => String(r.id)), null)
    return posts.filter((p) => (p.spotsTotal ?? 0) > p.memberCount && p.audience !== 'verified').slice(0, limit)
  } catch (e) {
    if (shouldUseDemo(e)) return DEMO_POSTS.filter((p) => p.kind === 'plan').slice(0, limit)
    return []
  }
}

/**
 * Explore → Tribe bridge: community plans that still need people, as plan-ring cards.
 * `layout="aside"` stacks them (desktop column), `layout="row"` is a mobile pager.
 * Public, cookie-free query. Falls back to an invitation card when there are no open plans.
 */
export async function TribeBridgeRow({ layout = 'row' }: { layout?: 'row' | 'aside' }) {
  const plans = await loadOpenPlans(3)
  const header = (
    <div className="pc-section-h mb-3">
      <h2>Plans looking for people</h2>
      <Link href="/tribe">Tribe</Link>
    </div>
  )
  if (plans.length === 0) {
    return (
      <section aria-label="Tribe" className={layout === 'row' ? 'mx-auto w-full max-w-[min(100%,1920px)] mt-8 px-4 md:px-6 lg:px-10' : ''}>
        {header}
        <div className="pc-pencilled flex flex-col items-start gap-3 p-5">
          <p className="pc-kicker">Community plans · not bookings</p>
          <p className="text-[17px] font-bold">Find people going your way, or share where you’re headed next.</p>
          <Link href="/tribe/new?kind=plan" className="pc-btn pc-btn-sm">Start a plan</Link>
        </div>
      </section>
    )
  }
  if (layout === 'aside') {
    return (
      <section aria-label="Plans looking for people">
        {header}
        <div className="flex flex-col gap-3.5">{plans.map((p) => <PlanMiniCard key={p.id} post={p} />)}</div>
      </section>
    )
  }
  return (
    <section aria-label="Plans looking for people" className="mt-8 lg:hidden">
      <div className="px-4">{header}</div>
      <div className="fc-pager">{plans.map((p) => <PlanMiniCard key={p.id} post={p} ringSize={88} />)}</div>
    </section>
  )
}
