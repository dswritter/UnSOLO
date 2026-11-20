import Link from 'next/link'
import { getRequestAuth } from '@/lib/auth/request-session'
import { loadPosts, loadViewer } from '@/lib/tribe/load'
import { PlanCard, PostCard } from './PostCard'

/** Profile: an open plan pinned on top (a visit can turn into a join), then recent Tribe posts. */
export async function ProfileTribePosts({ authorId, firstName }: { authorId: string; firstName: string }) {
  try {
    const { supabase, user } = await getRequestAuth()
    const { data, error } = await supabase.from('posts').select('id').eq('author_id', authorId)
      .in('status', ['live', 'past']).order('created_at', { ascending: false }).limit(12)
    if (error) throw error
    const posts = await loadPosts(supabase, (data ?? []).map((p) => p.id as string), await loadViewer(supabase, user?.id))
    if (posts.length === 0) return null
    const open = posts.find((p) => p.kind === 'plan' && p.status === 'live' && p.memberCount < (p.spotsTotal ?? 0))
    const rest = posts.filter((p) => p.id !== open?.id).slice(0, 6)
    return (
      <section className="mx-auto mt-8 max-w-3xl px-4" aria-label={`${firstName}'s posts`}>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-xl">On Tribe</h2>
          <Link href="/tribe" className="pc-link text-sm">Open Tribe</Link>
        </div>
        {open && (
          <div className="mb-4">
            <p className="pc-kicker mb-2">{firstName} is planning</p>
            <PlanCard post={open} signedIn={!!user} />
          </div>
        )}
        <ul className="space-y-4">{rest.map((p) => <li key={p.id}><PostCard post={p} signedIn={!!user} /></li>)}</ul>
      </section>
    )
  } catch {
    return null
  }
}
