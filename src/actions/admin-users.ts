'use server'

import { getActionAuth } from '@/lib/auth/action-auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { parseAdminUserFilter, searchAdminUsers, type AdminUsersPage } from '@/lib/admin/users-query'

export async function loadAdminUsersPage(q: string, filter: string, offset: number): Promise<AdminUsersPage> {
  const { user } = await getActionAuth()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await createServiceRoleClient().from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') throw new Error('Unauthorized — admin only')
  return searchAdminUsers({ q, filter: parseAdminUserFilter(filter), offset: Number.isFinite(offset) ? offset : 0 })
}
