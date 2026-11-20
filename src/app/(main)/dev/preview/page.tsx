import { notFound } from 'next/navigation'
import { Composer } from '@/components/tribe/Composer'
import { SettingsClient } from '@/components/tribe/SettingsClient'
import { ActivityClient } from '@/components/tribe/ActivityClient'
import { PostDetailClient } from '@/components/tribe/PostDetailClient'
import { FeedClient } from '@/components/tribe/FeedClient'
import { DEMO_TRIPS } from '@/lib/tribe/demo-trips'
import { AnalyticsDashboard, type Overview } from '@/app/(admin)/admin/analytics/AnalyticsDashboard'
import { DEFAULT_PREFERENCES } from '@/lib/tribe/preferences'
import { DEMO_COMMENTS, DEMO_POSTS, DEMO_USERS } from '@/lib/tribe/demo'
import type { NotificationItem } from '@/lib/tribe/models'

/**
 * DEVELOPMENT-ONLY visual preview of signed-in screens with sample props (no data access).
 * 404s in production. /dev/preview?screen=feed|compose|settings|activity|plan-member|plan-organiser|story|analytics
 */
export const dynamic = 'force-dynamic'

export default async function DevPreview({ searchParams }: { searchParams: Promise<{ screen?: string; kind?: string; poll?: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound()
  const { screen, kind, poll } = await searchParams
  // eslint-disable-next-line react-hooks/purity -- dev-only fixture timestamps
  const now = Date.now()
  const ago = (h: number) => new Date(now - h * 3600_000).toISOString()
  if (screen === 'compose') return <Composer initialKind={kind === 'plan' || kind === 'story' || kind === 'ask' ? kind : null} initialPoll={poll === '1'} me={DEMO_USERS.riya} pastTrips={[{ id: 'x', title: 'Kheerganga Trek with Tent It India' }]} />
  // Signed-in feed: your gold story ring (Riya has stories), "Planning something?" prompt, saved posts.
  if (screen === 'feed') return <FeedClient initial={DEMO_POSTS} nextDepartures={DEMO_TRIPS.slice(0, 3)} signedIn demo me={DEMO_USERS.riya} />
  if (screen === 'plan-organiser') {
    const post = { ...DEMO_POSTS[0], viewer: { ...DEMO_POSTS[0].viewer, isAuthor: true, membership: 'approved' as const, canJoin: false, joinBlockedReason: 'own_plan' as const } }
    return <PostDetailClient post={post} comments={DEMO_COMMENTS.filter((c) => c.postId === post.id)} offers={[]} signedIn viewerId={DEMO_USERS.ananya.id} viewerName="Ananya Rao" demo />
  }
  if (screen === 'plan-approved') {
    const post = { ...DEMO_POSTS[0], meetingPoint: 'ISBT Kashmere Gate, 6 am', viewer: { ...DEMO_POSTS[0].viewer, membership: 'approved' as const, canJoin: false },
      seats: [DEMO_POSTS[0].seats[0], DEMO_POSTS[0].seats[1], { state: 'you' as const, user: DEMO_USERS.kabir }, { state: 'open' as const, user: null }] }
    return <PostDetailClient post={post} comments={DEMO_COMMENTS.filter((c) => c.postId === post.id)} offers={[]} signedIn viewerId={DEMO_USERS.kabir.id} viewerName="Kabir Singh" demo />
  }
  if (screen === 'story') {
    const post = DEMO_POSTS[4]
    return <PostDetailClient post={post} comments={DEMO_COMMENTS.filter((c) => c.postId === post.id)} offers={[]} signedIn viewerId={DEMO_USERS.riya.id} viewerName="Riya Kapoor" demo />
  }
  if (screen === 'poll') {
    const post = { ...DEMO_POSTS[5], poll: { ...DEMO_POSTS[5].poll!, myChoice: null } }
    return <PostDetailClient post={post} comments={[]} offers={[]} signedIn viewerId={DEMO_USERS.riya.id} viewerName="Riya Kapoor" demo />
  }
  if (screen === 'settings') return <SettingsClient initial={{ ...DEFAULT_PREFERENCES, landingTab: 'tribe', interests: ['trek', 'mountains'] }} me={{ gender: 'woman', homeCity: 'Bengaluru', phone: null, isPhoneVerified: false }} />
  if (screen === 'activity') {
    const items: NotificationItem[] = [
      { id: 'n1', type: 'tribe_join_request', category: 'plans', title: 'Kabir Singh asked to join your plan', body: 'Did Triund and Hampta, flexible on dates. Can bring a car from Chandigarh.', link: '/tribe/p/x', isRead: false, createdAt: ago(1), postId: 'p', actorId: 'a' },
      { id: 'n2', type: 'tribe_host_offer', category: 'plans', title: 'Tent It India offered to host your plan', body: '₹15,000 each · reply within 7 days', link: '/tribe/p/x', isRead: false, createdAt: ago(3) },
      { id: 'n3', type: 'tribe_comment', category: 'replies', title: 'Riya Kapoor replied to your plan', body: 'Langza homestays are lovely. Carry a power bank.', link: '/tribe/p/x', isRead: true, createdAt: ago(20) },
      { id: 'n4', type: 'booking', category: 'trips', title: 'Balance due for Valley of Flowers', body: '₹4,000 by 2 Dec', link: '/bookings', isRead: true, createdAt: ago(50) },
    ]
    return <ActivityClient initial={items} initialCursor={null} />
  }
  if (screen === 'plan-member') {
    const post = { ...DEMO_POSTS[0], viewer: { ...DEMO_POSTS[0].viewer, membership: 'requested' as const, canJoin: false },
      seats: [...DEMO_POSTS[0].seats.slice(0, 2), { state: 'requested' as const, user: DEMO_USERS.kabir }, { state: 'open' as const, user: null }] }
    return <PostDetailClient post={post} comments={DEMO_COMMENTS} offers={[]} signedIn viewerId={DEMO_USERS.kabir.id} viewerName="Kabir Singh" demo />
  }
  if (screen === 'analytics') {
    const days = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(now - (29 - i) * 86400_000).toISOString().slice(0, 10)
      return { day: d, active: 60 + Math.round(30 * Math.sin(i / 4) + i * 2), posts: 3 + (i % 5), bookings: 1 + (i % 3), signups: 2 + (i % 4) }
    })
    const data: Overview = {
      range_days: 30, dau: 84, wau: 212, mau: 431, signups: 96, bookings: 41, gmv_paise: 61_40_000_00 / 10,
      posts: { plan: 38, story: 52, ask: 27 }, weekly_posters_pct: 6.2, plan_fill_rate_pct: 47.4, asks_answered_pct: 88.9,
      median_first_reply_hours: 3.4, reports_per_1k_posts: 4.3, open_reports: 3, overdue_reports: 1, plans_converted: 2,
      platform_split: { web: 280, android: 121, ios: 30 }, daily: days,
      top_screens: [{ screen: 'tribe', views: 2210 }, { screen: 'explore', views: 1980 }, { screen: 'trip_detail', views: 1203 }, { screen: 'post_detail', views: 940 }, { screen: 'trips', views: 433 }],
      funnel: { trip_viewed: 612, seat_tapped: 133, paid: 41 },
    }
    return <div className="mx-auto max-w-[1280px] px-4 py-6"><h1 className="mb-4 text-2xl">Analytics (sample)</h1><AnalyticsDashboard data={data} /></div>
  }
  return (
    <ul className="mx-auto max-w-md space-y-2 px-4 py-8">
      {['feed', 'compose', 'compose&kind=plan', 'compose&kind=story', 'compose&kind=ask&poll=1', 'settings', 'activity', 'plan-member', 'plan-approved', 'plan-organiser', 'story', 'poll', 'analytics'].map((s) => <li key={s}><a className="pc-link" href={`/dev/preview?screen=${s}`}>{s}</a></li>)}
    </ul>
  )
}
