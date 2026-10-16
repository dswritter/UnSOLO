import Link from 'next/link'
import { getRequestAuth, getRequestProfile } from '@/lib/auth/request-session'
import {
  getStatusStripForHome,
  getMyGeneralRoomsForStatus,
  countActiveStatusStoriesForUser,
} from '@/actions/statusStories'
import { StatusStoriesBar } from '@/components/status/StatusStoriesBar'
import { StatusRailCacheWriter, StatusRailLayout } from '@/components/wander/CachedCommunityRail'

export async function WanderStatusRail({ avatarUrl }: { avatarUrl?: string | null } = {}) {
  const { user } = await getRequestAuth()
  if (!user) return <div className="space-y-1">
    <h3 className="text-sm font-bold">Traveler status</h3>
    <p className="mb-3 text-sm text-muted-foreground">Sign in to see recent stories from people you follow — unread first.</p>
    <Link href="/login?redirectTo=/" className="text-sm font-semibold text-primary hover:underline">Sign in</Link>
  </div>

  const [profile, strip, generalRooms, existingActiveCount] = await Promise.all([
    getRequestProfile(user.id),
    getStatusStripForHome(),
    getMyGeneralRoomsForStatus(),
    countActiveStatusStoriesForUser(),
  ])
  const { stories, currentUserId, seenStoryIds } = strip
  if (!currentUserId) return null

  const bar = {
    initialStories: stories,
    currentUserId,
    seenStoryIds,
    generalRooms,
    addSlotAvatarUrl: profile?.avatar_url ?? avatarUrl ?? null,
    existingActiveCount,
    maxOtherAuthors: 4,
    compact: true,
  }

  return (
    <StatusRailLayout>
      <StatusStoriesBar {...bar} />
      <StatusRailCacheWriter bar={bar} />
    </StatusRailLayout>
  )
}
