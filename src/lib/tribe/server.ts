import { getRequestAuth } from '@/lib/auth/request-session'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { loadComments, loadPosts, loadViewer } from './load'
import { loadUpcomingTrips } from './trips'
import { DEMO_COMMENTS, DEMO_POSTS, DEMO_TRIP, isMissingSchema, shouldUseDemo } from './demo'
import type { Comment, HostOffer, Post, TripLite } from './models'
import { toHostOffer } from './models'
import { HOST_OFFER_SELECT } from './offers'

export type FeedPage = { posts: Post[]; nextDepartures: TripLite[]; demo: boolean; signedIn: boolean; viewerId: string | null }

/** First page of the feed for server rendering (client continues via /api/v1/feed). */
export async function getFeedPage(kind?: 'plan' | 'story' | 'ask', place?: string): Promise<FeedPage> {
  const { supabase, user } = await getRequestAuth()
  try {
    const { data, error } = await supabase.rpc('tribe_feed', { p_kind: kind ?? null, p_place: place ?? null, p_limit: 20 })
    if (error) throw error
    const ids = ((data ?? []) as { post_id: string }[]).map((r) => r.post_id)
    const viewer = await loadViewer(supabase, user)
    const [posts, trips] = await Promise.all([
      loadPosts(supabase, ids, viewer),
      loadUpcomingTrips({ db: supabase, service: createServiceRoleClient, user }, { limit: 3 }).catch(() => ({ items: [] as TripLite[] })),
    ])
    return { posts, nextDepartures: trips.items, demo: false, signedIn: !!user, viewerId: user?.id ?? null }
  } catch (e) {
    if (shouldUseDemo(e)) {
      const posts = DEMO_POSTS.filter((p) => (!kind || p.kind === kind) && (!place || p.place?.slug === place))
      return { posts, nextDepartures: [DEMO_TRIP], demo: true, signedIn: !!user, viewerId: user?.id ?? null }
    }
    if (isMissingSchema(e)) return { posts: [], nextDepartures: [], demo: false, signedIn: !!user, viewerId: user?.id ?? null }
    throw e
  }
}

export type PostPage = { post: Post; comments: Comment[]; offers: HostOffer[]; demo: boolean; signedIn: boolean; viewerId: string | null } | null

export async function getPostPage(id: string): Promise<PostPage> {
  const { supabase, user } = await getRequestAuth()
  try {
    const viewer = await loadViewer(supabase, user)
    const [post] = await loadPosts(supabase, [id], viewer)
    if (!post || post.status === 'removed') return null
    const showOffers = post.kind === 'plan' && (post.viewer.isAuthor || post.viewer.membership === 'approved')
    const [comments, offersRes] = await Promise.all([
      loadComments(supabase, id),
      showOffers ? supabase.from('host_offers').select(HOST_OFFER_SELECT).eq('post_id', id).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
    ])
    return { post, comments, offers: ((offersRes.data ?? []) as Record<string, unknown>[]).map(toHostOffer), demo: false, signedIn: !!user, viewerId: user?.id ?? null }
  } catch (e) {
    if (shouldUseDemo(e)) {
      const post = DEMO_POSTS.find((p) => p.id === id)
      if (!post) return null
      return { post, comments: DEMO_COMMENTS.filter((c) => c.postId === post.id), offers: [], demo: true, signedIn: !!user, viewerId: user?.id ?? null }
    }
    if (isMissingSchema(e)) return null
    throw e
  }
}
