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
    <div className="flex flex-row flex-wrap items-center gap-x-4 gap-y-2 min-w-0 -my-1">
      <div className="w-[9.5rem] sm:w-[12rem] shrink-0 pr-1">
        <h3 className="text-sm font-bold text-foreground leading-tight">Traveler status</h3>
        <p className="text-[11px] text-muted-foreground leading-snug mt-0.5 max-w-[11rem] text-pretty">
          See what your connections are up to.
        </p>
      </div>
      <div className="flex-1 min-w-0 min-h-[4.5rem] flex items-center">
        <div className="w-full -mx-1">
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
      </div>
    </div>
  )
}
