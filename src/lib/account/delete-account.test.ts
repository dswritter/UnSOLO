import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { deleteAccount, OWNED_ROWS } from './delete-account'

type Opts = { upcoming?: number; live?: number; hardFails?: boolean }

function fake(o: Opts = {}) {
  const deletes: string[] = []
  const updates: { table: string; row: Record<string, unknown> }[] = []
  const svc = {
    from: vi.fn((table: string) => {
      const q: Record<string, unknown> = {}
      let mode: 'count' | 'delete' | 'update' = 'count'
      let row: Record<string, unknown> = {}
      const done = () => {
        if (mode === 'delete') return { error: null }
        if (mode === 'update') { updates.push({ table, row }); return { error: null } }
        return { count: table === 'bookings' ? (o.upcoming ?? 0) : table === 'packages' ? (o.live ?? 0) : 0, error: null }
      }
      Object.assign(q, {
        select: () => q, gte: () => q,
        eq: (col: string) => { if (mode === 'delete') deletes.push(`${table}.${col}`); return q },
        then: (res: (v: unknown) => void) => res(done()),
        delete: () => { mode = 'delete'; return q },
        update: (r: Record<string, unknown>) => { mode = 'update'; row = r; return q },
      })
      return q
    }),
    auth: { admin: { deleteUser: vi.fn(async (_id: string, soft?: boolean) => ({ error: o.hardFails && !soft ? { message: 'violates foreign key constraint' } : null })) } },
  }
  return { svc: svc as unknown as SupabaseClient, raw: svc, deletes, updates }
}

describe('account deletion', () => {
  it('stops for an upcoming paid trip, touching nothing', async () => {
    const t = fake({ upcoming: 1 })
    expect(await deleteAccount(t.svc, 'u1')).toMatchObject({ ok: false, code: 'upcoming_trip' })
    expect(t.deletes).toHaveLength(0)
    expect(t.raw.auth.admin.deleteUser).not.toHaveBeenCalled()
  })

  it('stops while the person still has live trips or listings', async () => {
    expect(await deleteAccount(fake({ live: 2 }).svc, 'u1')).toMatchObject({ ok: false, code: 'active_listings' })
  })

  it('removes their content, strips booking details, anonymises the profile and deletes the login', async () => {
    const t = fake()
    expect(await deleteAccount(t.svc, '0f1e2d3c-aaaa-bbbb-cccc-1234567890ab')).toEqual({ ok: true, mode: 'deleted' })
    expect(t.deletes).toEqual(OWNED_ROWS.map(([tb, c]) => `${tb}.${c}`))
    expect(t.updates.find((u) => u.table === 'bookings')?.row).toEqual({ traveller_details: null, special_requests: null })
    expect(t.updates.find((u) => u.table === 'profiles')?.row).toMatchObject({ full_name: 'Deleted traveller', username: 'deleted_0f1e2d3caaaa', phone_number: null, avatar_url: null })
  })

  it('soft-deletes the login when bookings still point at the profile', async () => {
    const t = fake({ hardFails: true })
    expect(await deleteAccount(t.svc, 'u1')).toEqual({ ok: true, mode: 'anonymised' })
    expect(t.raw.auth.admin.deleteUser).toHaveBeenLastCalledWith('u1', true)
  })
})
