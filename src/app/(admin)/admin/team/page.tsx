export const dynamic = 'force-dynamic'

import { getTeamMembers } from '@/actions/admin'
import { TeamManagementClient } from './TeamManagementClient'
import { AdminPageHeader } from '@/components/admin/ui/AdminPrimitives'

export default async function AdminTeamPage() {
  const teamMembers = await getTeamMembers()
  return (
    <div>
      <AdminPageHeader title="Team" description="Staff accounts and what each role can access." />
      <TeamManagementClient teamMembers={teamMembers} />
    </div>
  )
}
