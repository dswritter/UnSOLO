import { createServiceRoleClient } from '@/lib/supabase/server'

export const ADMIN_USERS_PAGE_SIZE = 50
export const ADMIN_USER_FILTERS = ['all', 'hosts', 'active_travelers', 'no_phone', 'no_instagram'] as const
export type AdminUserFilter = typeof ADMIN_USER_FILTERS[number]

export type AdminUserEntry = {
  id: string
  username: string
  full_name: string | null
  avatar_url: string | null
  phone_number: string | null
  is_host: boolean | null
  is_phone_verified: boolean | null
  instagram_url: string | null
  created_at: string
  role: string
  bookings: { confirmed: number; completed: number; cancelled: number }
  totalTrips: number
}

export type AdminUsersPage = {
  rows: AdminUserEntry[]
  total: number
  counts: Record<AdminUserFilter, number>
}

type RpcRow = Omit<AdminUserEntry, 'bookings' | 'totalTrips'> & { confirmed: number; completed: number; cancelled: number }

export function parseAdminUserFilter(value: string | undefined | null): AdminUserFilter {
  return (ADMIN_USER_FILTERS as readonly string[]).includes(value ?? '') ? value as AdminUserFilter : 'all'
}

function toEntry(row: RpcRow): AdminUserEntry {
  const { confirmed, completed, cancelled, ...rest } = row
  const bookings = { confirmed: Number(confirmed) || 0, completed: Number(completed) || 0, cancelled: Number(cancelled) || 0 }
  return { ...rest, bookings, totalTrips: bookings.confirmed + bookings.completed }
}

/** Caller must have verified admin access. */
export async function searchAdminUsers(opts: { q?: string; filter?: AdminUserFilter; offset?: number }): Promise<AdminUsersPage> {
  const svc = createServiceRoleClient()
  const q = opts.q?.trim().slice(0, 100) || null
  const { data, error } = await svc.rpc('admin_search_users', {
    p_search: q,
    p_filter: opts.filter ?? 'all',
    p_limit: ADMIN_USERS_PAGE_SIZE,
    p_offset: Math.max(0, opts.offset ?? 0),
  })
  if (error || !data) {
    console.error('admin_search_users failed (is migration 113 applied?):', error?.message)
    return { rows: [], total: 0, counts: { all: 0, hosts: 0, active_travelers: 0, no_phone: 0, no_instagram: 0 } }
  }
  const result = data as { rows: RpcRow[]; total: number; counts: Record<AdminUserFilter, number> }
  return { rows: (result.rows || []).map(toEntry), total: Number(result.total) || 0, counts: result.counts }
}
