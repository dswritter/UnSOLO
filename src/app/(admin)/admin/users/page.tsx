export const dynamic = 'force-dynamic'

import { getRequestAuth } from '@/lib/auth/request-session'
import { redirect } from 'next/navigation'
import { UsersClient } from './UsersClient'
import { searchAdminUsers } from '@/lib/admin/users-query'

export default async function AdminUsersPage() {
  const { supabase, user } = await getRequestAuth()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') redirect('/')

  const initial = await searchAdminUsers({})

  return <UsersClient initial={initial} />
}
