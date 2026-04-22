import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listPendingCollaboratorInvites } from '@/actions/host-service-collaborators'
import { InvitationsList } from './InvitationsList'

export default async function HostInvitationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirectTo=/host/invitations')

  const res = await listPendingCollaboratorInvites()
  const invites = 'error' in res ? [] : res.invites

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-6">
      <h1 className="text-2xl font-bold">Co-host invitations</h1>
      <p className="text-sm text-muted-foreground mt-1">
        Accept to start editing bookings and content on these listings. Payouts stay with the primary host.
      </p>
      <div className="mt-6">
        <InvitationsList invites={invites} />
      </div>
    </div>
  )
}
