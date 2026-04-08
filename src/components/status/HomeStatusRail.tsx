import {
  getStatusStripForHome,
  getMyGeneralRoomsForStatus,
  countActiveStatusStoriesForUser,
} from '@/actions/statusStories'
import { StatusStoriesBar } from '@/components/status/StatusStoriesBar'

export async function HomeStatusRail({ avatarUrl }: { avatarUrl?: string | null }) {
  const { stories, currentUserId } = await getStatusStripForHome()
  if (!currentUserId) return null

  const generalRooms = await getMyGeneralRoomsForStatus()
  const existingActiveCount = await countActiveStatusStoriesForUser()

  return (
    <div className="border-b border-white/10 bg-black/40 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-3 sm:px-4 py-3">
        <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold mb-2">Status</p>
        <StatusStoriesBar
          initialStories={stories}
          currentUserId={currentUserId}
          generalRooms={generalRooms}
          addSlotAvatarUrl={avatarUrl}
          existingActiveCount={existingActiveCount}
        />
      </div>
    </div>
  )
}
