import { getAllTripChatGroups, adminAddUserToTripChat } from '@/actions/admin'
import { TripGroupsClient } from './TripGroupsClient'

export default async function AdminTripGroupsPage() {
  const { groups, error } = await getAllTripChatGroups()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-black">Trip <span className="text-primary">Groups</span></h1>
        <p className="text-sm text-muted-foreground mt-1">Every trip group chat. Add any user into a group.</p>
      </div>
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <TripGroupsClient groups={groups || []} addUser={adminAddUserToTripChat} />
      )}
    </div>
  )
}
