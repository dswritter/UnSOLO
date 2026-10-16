import { getCommunityChatRoomsAdmin } from '@/actions/admin'
import { CommunityChatsClient } from './CommunityChatsClient'
import { AdminPageHeader } from '@/components/admin/ui/AdminPrimitives'

export default async function AdminCommunityChatsPage() {
  const { rooms, error } = await getCommunityChatRoomsAdmin()

  return (
    <div>
      <AdminPageHeader title="Community chats" description="Public Meet Travellers rooms shown under Community in chat." />
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <CommunityChatsClient initialRooms={rooms} />
      )}
    </div>
  )
}
