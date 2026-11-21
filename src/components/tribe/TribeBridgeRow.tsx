import Link from 'next/link'
import { unstable_cache } from 'next/cache'
import { createPublicClient } from '@/lib/supabase/public-client'
import { loadPosts } from '@/lib/tribe/load'
import { DEMO_POSTS, shouldUseDemo } from '@/lib/tribe/demo'
import { todayIST, type Post, type UserLite } from '@/lib/tribe/models'
import { PlanMiniCard } from '@/components/explore/fc/PlanMiniCard'
import { PlanInvite } from '@/components/explore/fc/PlanInvite'

/** Public, signed-out view of open plans; cached so the home page doesn't wait on it every load. */
const cachedOpenPlans = unstable_cache(async (limit: number): Promise<{ plans: Post[]; planningCount: number }> => {
  const db = createPublicClient()
  const { data, error, count } = await db.from('posts').select('id', { count: 'exact' }).eq('kind', 'plan').eq('status', 'live')
    .gte('starts_on', todayIST()).order('created_at', { ascending: false }).limit(limit * 2)
  if (error) throw error
  const posts = await loadPosts(db, (data ?? []).map((r) => String(r.id)), null)
  return { plans: posts.filter((p) => (p.spotsTotal ?? 0) > p.memberCount && p.audience !== 'verified').slice(0, limit), planningCount: count ?? posts.length }
}, ['explore-open-plans-v1'], { revalidate: 60, tags: ['explore-open-plans'] })

async function loadOpenPlans(limit: number): Promise<{ plans: Post[]; planningCount: number }> {
  try {
    return await cachedOpenPlans(limit)
  } catch (e) {
    if (shouldUseDemo(e)) {
      const plans = DEMO_POSTS.filter((p) => p.kind === 'plan')
      return { plans: plans.slice(0, limit), planningCount: plans.length }
    }
    return { plans: [], planningCount: 0 }
  }
}

const planners = (plans: Post[]): UserLite[] => [...new Map(plans.map((p) => [p.author.id, p.author])).values()]

/**
 * Explore → Tribe bridge: community plans that still need people (plan-ring cards) plus an invitation
 * to post your own. Rendered once per breakpoint: `aside` = desktop column (lg+), `row` = phones/tablets.
 * Public, cookie-free query.
 */
export async function TribeBridgeRow({ layout = 'row' }: { layout?: 'row' | 'aside' }) {
  const { plans, planningCount } = await loadOpenPlans(3)
  const header = (
    <div className="pc-section-h mb-3">
      <h2>Plans looking for people</h2>
      <Link href="/tribe">Tribe</Link>
    </div>
  )
  const invite = (compact: boolean) => <PlanInvite planners={planners(plans)} planningCount={planningCount} compact={compact} />
  if (layout === 'aside') {
    return (
      <section aria-label="Plans looking for people">
        {header}
        <div className="flex flex-col gap-3.5">
          {invite(plans.length > 0)}
          {plans.slice(0, 2).map((p) => <PlanMiniCard key={p.id} post={p} />)}
        </div>
      </section>
    )
  }
  return (
    <section aria-label="Plans looking for people" className="mx-auto mt-8 w-full max-w-[1440px] lg:hidden">
      <div className="px-4 md:px-6">{header}</div>
      {plans.length > 0 ? (
        <div className="fc-pager">
          {invite(false)}
          {plans.map((p) => <PlanMiniCard key={p.id} post={p} ringSize={88} />)}
        </div>
      ) : (
        <div className="px-4 md:px-6">{invite(false)}</div>
      )}
    </section>
  )
}
