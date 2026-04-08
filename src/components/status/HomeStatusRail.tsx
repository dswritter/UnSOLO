import {
  getStatusStripForHome,
  getMyGeneralRoomsForStatus,
  countActiveStatusStoriesForUser,
} from '@/actions/statusStories'
import { StatusStoriesBar } from '@/components/status/StatusStoriesBar'

export async function HomeStatusRail({ avatarUrl }: { avatarUrl?: string | null }) {
  const { stories, currentUserId, seenStoryIds } = await getStatusStripForHome()
  if (!currentUserId) return null

  const generalRooms = await getMyGeneralRoomsForStatus()
  const existingActiveCount = await countActiveStatusStoriesForUser()

  return (
    <div className="border-b border-border bg-background/90 dark:bg-black/40 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-3 sm:px-4 py-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Status</p>
        <StatusStoriesBar
          initialStories={stories}
          currentUserId={currentUserId}
          seenStoryIds={seenStoryIds}
          generalRooms={generalRooms}
          addSlotAvatarUrl={avatarUrl}
          existingActiveCount={existingActiveCount}
        />
      </div>
    </div>
  )
}
