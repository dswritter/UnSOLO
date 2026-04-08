import { getMyGeneralRoomsForStatus } from '@/actions/statusStories'
import type { StatusStripStory } from '@/actions/statusStories'
import { ProfileStatusStories } from '@/components/status/ProfileStatusStories'

export async function ProfileStatusRail({
  isOwn,
  stories,
  viewerId,
}: {
  isOwn: boolean
  stories: StatusStripStory[]
  viewerId: string
}) {
  const rooms = isOwn ? await getMyGeneralRoomsForStatus() : []

  if (stories.length === 0 && !isOwn) return null

  return (
    <section className="mb-6 border border-border rounded-xl p-4 bg-card/40">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">24h status</p>
      <ProfileStatusStories
        stories={stories}
        isOwn={isOwn}
        generalRooms={rooms}
        viewerId={viewerId}
      />
    </section>
  )
}
