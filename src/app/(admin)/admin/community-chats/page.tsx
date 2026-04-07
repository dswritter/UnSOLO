import { getCommunityChatRoomsAdmin } from '@/actions/admin'
import { CommunityChatsClient } from './CommunityChatsClient'

export default async function AdminCommunityChatsPage() {
  const { rooms, error } = await getCommunityChatRoomsAdmin()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-black">Community <span className="text-primary">Chat Rooms</span></h1>
        <p className="text-sm text-muted-foreground mt-1">Create and manage public tribe rooms shown under Community in chat</p>
      </div>
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <CommunityChatsClient initialRooms={rooms} />
      )}
    </div>
  )
}
