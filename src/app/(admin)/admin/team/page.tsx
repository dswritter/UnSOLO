import { getTeamMembers } from '@/actions/admin'
import { TeamManagementClient } from './TeamManagementClient'

export default async function AdminTeamPage() {
  const teamMembers = await getTeamMembers()
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Team Management</h1>
      <TeamManagementClient teamMembers={teamMembers} />
    </div>
  )
}
