import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { hostListingSchema } from './test-fixtures/host-listing-schema'

const migration104 = readFileSync('supabase/migrations/104_staff_host_listing_assignments.sql', 'utf8')
const migration106 = readFileSync('supabase/migrations/106_staff_created_listing_approval.sql', 'utf8')
const cases = [
  { kind: 'trip', table: 'packages', approval: 'moderation_status', type: undefined },
  ...['stays', 'activities', 'rentals', 'getting_around'].map(type => ({
    kind: 'service', table: 'service_listings', approval: 'status', type,
  })),
]
type ListingCase = typeof cases[number]
type Listing = {
  id: string; host_id: string | null; created_on_behalf_by: string | null
  is_active: boolean; status?: string | null; moderation_status?: string | null
}

describe('staff-created listing approval (104 then 106, without 105)', () => {
  let db: PGlite
  let staffId: string
  beforeAll(async () => {
    db = new PGlite()
    await db.exec(hostListingSchema)
    await db.exec(migration104)
    await db.exec(migration106)
  }, 30000)
  afterAll(async () => { await db?.close() })
  beforeEach(async () => {
    await db.exec('TRUNCATE host_listing_assignments, notifications, audit_logs, packages, service_listings, profiles, auth.users CASCADE')
    staffId = await account('staff@example.com', true)
  })

  async function account(email: string, confirmed = false, phone?: string) {
    const id = randomUUID()
    await db.query(`INSERT INTO auth.users(id, email, email_confirmed_at, phone, phone_confirmed_at)
      VALUES ($1, $2, $3, $4, $5)`, [id, email, confirmed ? new Date() : null, phone ?? null, phone ? new Date() : null])
    return id
  }
  async function create(c: ListingCase, contact: { email?: string; phone?: string }, overrides = {}) {
    const payload = {
      title: 'Staff-created listing', slug: randomUUID(), ...(c.type ? { type: c.type } : {}), ...overrides,
    }
    const { rows } = await db.query<{ listing: Listing }>(
      'SELECT public.create_delegated_host_listing($1, $2::jsonb, $3::jsonb, $4) AS listing',
      [c.kind, JSON.stringify(payload), JSON.stringify(contact), staffId])
    return rows[0].listing
  }
  async function read(c: ListingCase, id: string) {
    return (await db.query<Listing>(`SELECT * FROM public.${c.table} WHERE id = $1`, [id])).rows[0]
  }
  async function assignment(id: string) {
    return (await db.query<{ id: string; status: string; claimed_by: string | null }>(
      'SELECT id, status, claimed_by FROM host_listing_assignments WHERE package_id = $1 OR service_listing_id = $1', [id])).rows[0]
  }
  async function noticeCount(id: string) {
    return (await db.query<{ count: number }>('SELECT count(*)::int AS count FROM notifications WHERE user_id = $1', [id])).rows[0].count
  }
  function expectApproval(c: ListingCase, row: Listing, host: string | null, active: boolean, approval = 'approved') {
    expect(row).toMatchObject({ host_id: host, is_active: active, [c.approval]: approval })
  }

  it.each(cases)('$kind/$type: overrides forged publication, approval, owner, ID and staff marker for unverified contacts', async c => {
    const unverified = await account('host@example.com')
    const forgedId = randomUUID()
    const row = await create(c, { email: ' HOST@Example.com ' }, {
      id: forgedId, host_id: unverified, created_on_behalf_by: unverified,
      [c.approval]: 'rejected', is_active: true,
    })
    expectApproval(c, row, null, false)
    expect(row.id).not.toBe(forgedId)
    expect(row.created_on_behalf_by).toBe(staffId)
    expect(await assignment(row.id)).toMatchObject({ status: 'pending', claimed_by: null })
    expect(await noticeCount(unverified)).toBe(0)
    expect((await db.query('SELECT is_host, is_phone_verified FROM profiles WHERE id = $1', [unverified])).rows)
      .toEqual([{ is_host: false, is_phone_verified: false }])
    expect((await db.query('SELECT action, admin_id FROM audit_logs')).rows)
      .toEqual([{ action: 'CREATE_LISTING_ON_BEHALF', admin_id: staffId }])
  })

  it.each(cases)('$kind/$type: verified email/phone conflicts remain approved but hidden', async c => {
    const emailHost = await account('host@example.com', true)
    const phoneHost = await account('other@example.com', false, '+919876543210')
    const row = await create(c, { email: 'host@example.com', phone: '+919876543210' })
    expectApproval(c, row, null, false)
    expect(await assignment(row.id)).toMatchObject({ status: 'conflict', claimed_by: null })
    expect(await noticeCount(emailHost)).toBe(0)
    expect(await noticeCount(phoneHost)).toBe(0)
  })

  it.each(cases)('$kind/$type: returns an immediately linked, approved and active verified host atomically', async c => {
    const hostId = await account('host@example.com', true, '+919876543210')
    const row = await create(c, { email: 'host@example.com', phone: '+919876543210' }, {
      [c.approval]: 'pending', is_active: false,
    })
    expectApproval(c, row, hostId, true)
    expect(await assignment(row.id)).toMatchObject({ status: 'claimed', claimed_by: hostId })
    expect(await noticeCount(hostId)).toBe(1)
    expect((await db.query('SELECT is_host, is_phone_verified FROM profiles WHERE id = $1', [hostId])).rows)
      .toEqual([{ is_host: true, is_phone_verified: false }])
  })

  it.each(cases.flatMap(c => ['profile', 'auth'].map(source => ({ ...c, source }))))(
    '$kind/$type: immediately links an existing verified $source phone without verified email', async c => {
      const hostId = await account('host@example.com', false, c.source === 'auth' ? '919876543210' : undefined)
      if (c.source === 'profile') {
        await db.query("UPDATE profiles SET phone_number = '9876543210', is_phone_verified = true WHERE id = $1", [hostId])
      }
      const row = await create(c, { phone: '+919876543210' })
      expectApproval(c, row, hostId, true)
      expect(await assignment(row.id)).toMatchObject({ status: 'claimed', claimed_by: hostId })
      expect(await noticeCount(hostId)).toBe(1)
      expect((await db.query('SELECT email_confirmed_at FROM auth.users WHERE id = $1', [hostId])).rows)
        .toEqual([{ email_confirmed_at: null }])
    })

  const verificationCases = cases.flatMap(c => ['email', 'OAuth', 'profile phone', 'auth phone'].map(method => ({ ...c, method })))
  it.each(verificationCases)('$kind/$type: later $method verification activates exactly once', async c => {
    const phone = c.method.includes('phone')
    const row = await create(c, phone ? { phone: '+919876543210' } : { email: 'host@example.com' })
    expectApproval(c, row, null, false)
    const hostId = await account('host@example.com', c.method === 'OAuth')
    if (c.method === 'email') {
      expectApproval(c, await read(c, row.id), null, false)
      await db.query('UPDATE auth.users SET email_confirmed_at = now() WHERE id = $1', [hostId])
    } else if (c.method === 'profile phone') {
      await db.query("UPDATE profiles SET phone_number = '9876543210', is_phone_verified = false WHERE id = $1", [hostId])
      expectApproval(c, await read(c, row.id), null, false)
      await db.query('UPDATE profiles SET is_phone_verified = true WHERE id = $1', [hostId])
    } else if (c.method === 'auth phone') {
      await db.query("UPDATE auth.users SET phone = '919876543210' WHERE id = $1", [hostId])
      expectApproval(c, await read(c, row.id), null, false)
      await db.query('UPDATE auth.users SET phone_confirmed_at = now() WHERE id = $1', [hostId])
    }
    expectApproval(c, await read(c, row.id), hostId, true)
    expect(await assignment(row.id)).toMatchObject({ status: 'claimed', claimed_by: hostId })
    await db.query('SELECT public.resolve_host_listings_for_user($1)', [hostId])
    await db.query('SELECT public.resolve_host_listing_assignment($1)', [(await assignment(row.id)).id])
    expect(await noticeCount(hostId)).toBe(1)
    // Once claimed, repeated verification must not republish a deactivated/rejected listing.
    await db.query(`UPDATE public.${c.table} SET is_active = false, ${c.approval} = 'rejected' WHERE id = $1`, [row.id])
    await db.query('UPDATE auth.users SET email_confirmed_at = now() WHERE id = $1', [hostId])
    await db.query('SELECT public.resolve_host_listings_for_user($1)', [hostId])
    expectApproval(c, await read(c, row.id), hostId, false, 'rejected')
    expect(await noticeCount(hostId)).toBe(1)
  })

  it.each(cases.flatMap(c => ['pending', 'rejected', 'archived'].map(status => ({ ...c, status }))))(
    '$kind/$type: linking does not activate a listing changed to $status', async c => {
      const row = await create(c, { email: 'host@example.com' })
      await db.query(`UPDATE public.${c.table} SET ${c.approval} = $1 WHERE id = $2`, [c.status, row.id])
      const hostId = await account('host@example.com', true)
      expectApproval(c, await read(c, row.id), hostId, false, c.status)
      expect(await assignment(row.id)).toMatchObject({ status: 'claimed', claimed_by: hostId })
    })

  it.each(cases)('$kind/$type: approved listings without a staff marker do not autoactivate', async c => {
    const row = await create(c, { email: 'host@example.com' })
    await db.query(`UPDATE public.${c.table} SET created_on_behalf_by = NULL WHERE id = $1`, [row.id])
    const hostId = await account('host@example.com', true)
    expectApproval(c, await read(c, row.id), hostId, false)
  })

  it.each(cases)('$kind/$type: outside staff-approved activation, the resolver preserves existing activity', async c => {
    const row = await create(c, { email: 'host@example.com' })
    await db.query(`UPDATE public.${c.table} SET created_on_behalf_by = NULL, ${c.approval} = 'pending', is_active = true WHERE id = $1`, [row.id])
    const hostId = await account('host@example.com', true)
    expectApproval(c, await read(c, row.id), hostId, true, 'pending')
  })

  it.each(cases)('$kind/$type: normal host inserts still default to pending and inactive', async c => {
    const hostId = await account('host@example.com', true)
    const { rows } = await db.query<Listing>(`INSERT INTO public.${c.table}(title, host_id${c.type ? ', type' : ''})
      VALUES ($1, $2${c.type ? ', $3' : ''}) RETURNING *`, ['Ordinary host listing', hostId, ...(c.type ? [c.type] : [])])
    expectApproval(c, rows[0], hostId, false, 'pending')
    expect(rows[0].created_on_behalf_by).toBeNull()
  })

  it.each(cases)('$kind/$type: approved unlinked listings cannot be published by insert or update', async c => {
    const row = await create(c, { email: 'future@example.com' })
    await expect(db.query(`UPDATE public.${c.table} SET is_active = true WHERE id = $1`, [row.id]))
      .rejects.toThrow('Link the host account')
    await expect(db.query(`INSERT INTO public.${c.table}(title, created_on_behalf_by, ${c.approval}, is_active)
      VALUES ('Unlinked', $1, 'approved', true)`, [staffId])).rejects.toThrow('Link the host account')
    expectApproval(c, await read(c, row.id), null, false)
  })

  it.each(cases)('$kind/$type: the unchanged contact-update RPC uses the new resolver', async c => {
    await account('conflict@example.com', true)
    await account('phone@example.com', false, '+919876543210')
    const row = await create(c, { email: 'conflict@example.com', phone: '+919876543210' })
    expect((await assignment(row.id)).status).toBe('conflict')
    const hostId = await account('correct@example.com', true)
    await db.query('SELECT public.update_host_listing_contact($1, $2, $3::jsonb, $4)',
      [c.kind, row.id, JSON.stringify({ email: 'correct@example.com' }), staffId])
    expectApproval(c, await read(c, row.id), hostId, true)
    await expect(db.query('SELECT public.update_host_listing_contact($1, $2, $3::jsonb, $4)',
      [c.kind, row.id, JSON.stringify({ email: 'conflict@example.com' }), staffId])).rejects.toThrow('ownership cannot be changed')
    expectApproval(c, await read(c, row.id), hostId, true)
  })

  it.each(cases)('$kind/$type: the resolver never overwrites an existing owner', async c => {
    const row = await create(c, { email: 'future@example.com' })
    const ownerId = await account('owner@example.com', true)
    await db.query(`UPDATE public.${c.table} SET host_id = $1 WHERE id = $2`, [ownerId, row.id])
    const matchingId = await account('future@example.com', true)
    await db.query('SELECT public.resolve_host_listing_assignment($1)', [(await assignment(row.id)).id])
    expectApproval(c, await read(c, row.id), ownerId, false)
    expect(await assignment(row.id)).toMatchObject({ status: 'pending', claimed_by: null })
    expect(await noticeCount(matchingId)).toBe(0)
  })

  it.each(['anon', 'authenticated'])('%s cannot call delegated creation, resolver, or guard RPCs', async role => {
    await db.exec(`SET ROLE ${role}`)
    try {
      await expect(db.query('SELECT public.create_delegated_host_listing($1, $2::jsonb, $3::jsonb, $4)',
        ['trip', JSON.stringify({ title: 'Forged' }), JSON.stringify({ email: 'host@example.com' }), staffId])).rejects.toThrow('permission denied')
      await expect(db.query('SELECT public.resolve_host_listing_assignment($1)', [randomUUID()])).rejects.toThrow('permission denied')
      await expect(db.query('SELECT public.guard_unclaimed_host_listing_publication()')).rejects.toThrow('permission denied')
      await expect(db.query('SELECT public.resolve_host_listings_for_user($1)', [staffId])).rejects.toThrow('permission denied')
    } finally { await db.exec('RESET ROLE') }
  })

  it('service_role can create but helper functions remain private and search paths empty', async () => {
    await db.exec('SET ROLE service_role')
    try {
      expectApproval(cases[0], await create(cases[0], { email: 'future@example.com' }), null, false)
    } finally { await db.exec('RESET ROLE') }
    const { rows } = await db.query<{ proname: string; proconfig: string[]; prosecdef: boolean; client: boolean; service: boolean }>(`
      SELECT proname, proconfig, prosecdef, has_function_privilege('authenticated', oid, 'EXECUTE') AS client,
        has_function_privilege('service_role', oid, 'EXECUTE') AS service FROM pg_proc
      WHERE pronamespace = 'public'::regnamespace AND proname IN
        ('create_delegated_host_listing', 'resolve_host_listing_assignment', 'guard_unclaimed_host_listing_publication')`)
    expect(rows).toHaveLength(3)
    for (const row of rows) {
      expect(row.proconfig).toEqual(['search_path=""'])
      expect(row.client).toBe(false)
      expect(row.service).toBe(row.proname === 'create_delegated_host_listing')
      expect(row.prosecdef).toBe(row.proname !== 'guard_unclaimed_host_listing_publication')
    }
  })

  it('failed contact validation rolls back listing creation and audit writes atomically', async () => {
    await expect(create(cases[0], {})).rejects.toThrow('check constraint')
    expect((await db.query('SELECT * FROM packages')).rows).toEqual([])
    expect((await db.query('SELECT * FROM audit_logs')).rows).toEqual([])
    expect((await db.query('SELECT * FROM host_listing_assignments')).rows).toEqual([])
  })

  it('rerunning 106 preserves all data, triggers and later linking behavior', async () => {
    await account('claimed@example.com', true)
    await create(cases[1], { email: 'claimed@example.com' })
    const future = await create(cases[0], { email: 'future@example.com' })
    const rejected = await create(cases[2], { email: 'rejected@example.com' })
    await db.query("UPDATE service_listings SET status = 'rejected' WHERE id = $1", [rejected.id])
    const tables = ['packages', 'service_listings', 'host_listing_assignments', 'notifications', 'audit_logs', 'profiles', 'auth.users']
    const snapshot = await Promise.all(tables.map(table => db.query(`SELECT * FROM ${table}`)))
    const triggers = await db.query('SELECT tgrelid, tgname FROM pg_trigger WHERE NOT tgisinternal ORDER BY tgrelid, tgname')
    await db.exec(migration106)
    await db.exec(migration106)
    for (const [index, table] of tables.entries()) {
      expect((await db.query(`SELECT * FROM ${table}`)).rows).toEqual(snapshot[index].rows)
    }
    expect((await db.query('SELECT tgrelid, tgname FROM pg_trigger WHERE NOT tgisinternal ORDER BY tgrelid, tgname')).rows).toEqual(triggers.rows)
    const hostId = await account('future@example.com', true)
    expectApproval(cases[0], await read(cases[0], future.id), hostId, true)
    expect(await noticeCount(hostId)).toBe(1)
  })
})

it('installing 106 does not change deployed 104 pending listings or autoactivate them on later linking', async () => {
  const db = new PGlite()
  try {
    await db.exec(hostListingSchema)
    await db.exec(migration104)
    const staffId = randomUUID()
    await db.query('INSERT INTO auth.users(id, email) VALUES ($1, $2)', [staffId, 'staff@example.com'])
    const { rows } = await db.query<{ listing: Listing }>(
      'SELECT public.create_delegated_host_listing($1, $2::jsonb, $3::jsonb, $4) AS listing',
      ['trip', JSON.stringify({ title: '104 pending trip' }), JSON.stringify({ email: 'host@example.com' }), staffId])
    const tables = ['packages', 'host_listing_assignments', 'notifications', 'audit_logs']
    const snapshot = await Promise.all(tables.map(table => db.query(`SELECT * FROM ${table}`)))
    await db.exec(migration106)
    for (const [index, table] of tables.entries()) {
      expect((await db.query(`SELECT * FROM ${table}`)).rows).toEqual(snapshot[index].rows)
    }
    const hostId = randomUUID()
    await db.query('INSERT INTO auth.users(id, email, email_confirmed_at) VALUES ($1, $2, now())', [hostId, 'host@example.com'])
    expect((await db.query<Listing>('SELECT * FROM packages WHERE id = $1', [rows[0].listing.id])).rows[0])
      .toMatchObject({ moderation_status: 'pending', is_active: false, host_id: hostId })
  } finally { await db.close() }
}, 30000)