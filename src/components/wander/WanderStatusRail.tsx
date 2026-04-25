import {
  getStatusStripForHome,
  getMyGeneralRoomsForStatus,
  countActiveStatusStoriesForUser,
} from '@/actions/statusStories'
import { StatusStoriesBar } from '@/components/status/StatusStoriesBar'

export async function WanderStatusRail({ avatarUrl }: { avatarUrl?: string | null }) {
  const { stories, currentUserId, seenStoryIds } = await getStatusStripForHome()
  if (!currentUserId) return null

  const generalRooms = await getMyGeneralRoomsForStatus()
  const existingActiveCount = await countActiveStatusStoriesForUser()

  return (
    <div className="min-w-0">
      <div className="mb-1">
        <h3 className="text-sm font-bold text-foreground">Traveler status</h3>
        <p className="text-[11px] text-muted-foreground">See what your connections are up to.</p>
      </div>
      <StatusStoriesBar
        initialStories={stories}
        currentUserId={currentUserId}
        seenStoryIds={seenStoryIds}
        generalRooms={generalRooms}
        addSlotAvatarUrl={avatarUrl}
        existingActiveCount={existingActiveCount}
        maxOtherAuthors={4}
      />
    </div>
  )
}
