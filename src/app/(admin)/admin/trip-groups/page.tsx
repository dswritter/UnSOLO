import { getAllTripChatGroups, adminAddUserToTripChat } from '@/actions/admin'
import { TripGroupsClient } from './TripGroupsClient'
import { AdminPageHeader } from '@/components/admin/ui/AdminPrimitives'

export default async function AdminTripGroupsPage() {
  const { groups, error } = await getAllTripChatGroups()

  return (
    <div>
      <AdminPageHeader title="Trip groups" description="Every trip group chat. Add any user to a group." />
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <TripGroupsClient groups={groups || []} addUser={adminAddUserToTripChat} />
      )}
    </div>
  )
}
