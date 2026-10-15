import Link from 'next/link'
import { getRequestAuth, getRequestProfile } from '@/lib/auth/request-session'
import {
  getStatusStripForHome,
  getMyGeneralRoomsForStatus,
  countActiveStatusStoriesForUser,
} from '@/actions/statusStories'
import { StatusStoriesBar } from '@/components/status/StatusStoriesBar'

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

  return (
    <div className="flex w-full min-w-0 flex-row flex-wrap items-center gap-x-3 gap-y-1 sm:gap-x-4">
      <div className="w-[9.75rem] shrink-0 sm:w-[10.75rem]">
        <h3 className="text-sm font-bold leading-tight text-foreground">Traveler status</h3>
        <p className="mt-0.5 text-xs font-semibold leading-snug text-muted-foreground sm:text-[13px]">
          See what your
          <br />
          connections are up to.
        </p>
      </div>
      <div className="min-h-[3.5rem] min-w-0 flex-1 flex items-center pr-1 sm:pr-2">
        <StatusStoriesBar
          initialStories={stories}
          currentUserId={currentUserId}
          seenStoryIds={seenStoryIds}
          generalRooms={generalRooms}
          addSlotAvatarUrl={profile?.avatar_url ?? avatarUrl ?? null}
          existingActiveCount={existingActiveCount}
          maxOtherAuthors={4}
          compact
        />
      </div>
    </div>
  )
}
