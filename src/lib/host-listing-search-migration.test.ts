import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { HostListingContactOption } from './host-listing-search'
import { hostListingSchema as fixture } from './test-fixtures/host-listing-schema'
const migration104 = readFileSync('supabase/migrations/104_staff_host_listing_assignments.sql', 'utf8')
const migration105 = readFileSync('supabase/migrations/105_staff_host_contact_search.sql', 'utf8')

describe('private global staff host contact SQL', () => {
  let db: PGlite
  beforeAll(async () => {
    db = new PGlite()
    await db.exec(fixture)
    await db.exec(migration104)
    await db.exec(migration105)
    await db.exec(migration105)
  }, 30000)
  afterAll(async () => { await db?.close() })
  beforeEach(async () => {
    await db.exec('RESET ROLE; TRUNCATE host_listing_assignments, notifications, audit_logs, packages, service_listings, profiles, auth.users CASCADE')
  })

  async function account(options: {
    email?: string; confirmed?: boolean; name?: string; username?: string; host?: boolean;
    phone?: string; phoneConfirmed?: boolean; profilePhone?: string; country?: string; profileVerified?: boolean;
  } = {}) {
    const id = randomUUID()
    await db.query(`INSERT INTO auth.users(id, email, email_confirmed_at, phone, phone_confirmed_at)
      VALUES ($1, $2, $3, $4, $5)`, [id, options.email ?? null,
      options.confirmed ? new Date() : null, options.phone ?? null, options.phoneConfirmed ? new Date() : null])
    await db.query(`UPDATE profiles SET full_name=$2, username=$3, is_host=$4,
      phone_number=$5, phone_country_code=$6, is_phone_verified=$7 WHERE id=$1`,
    [id, options.name ?? null, options.username ?? null, options.host ?? true,
      options.profilePhone ?? null, options.country ?? '+91', options.profileVerified ?? false])
    return id
  }
  async function listing(kind: string, title: string, host: string | null = null) {
    const id = randomUUID()
    if (kind === 'trip') await db.query('INSERT INTO packages(id, title, host_id) VALUES ($1,$2,$3)', [id, title, host])
    else await db.query('INSERT INTO service_listings(id, title, type, host_id) VALUES ($1,$2,$3,$4)', [id, title, kind, host])
    return id
  }
  async function assignment(kind: string, title: string, email: string | null, phone: string | null,
    status = 'pending', claimant: string | null = null) {
    const listingId = await listing(kind, title, claimant)
    const id = randomUUID()
    await db.query(`INSERT INTO host_listing_assignments(id, package_id, service_listing_id, email, phone, status, claimed_by, claimed_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [id, kind === 'trip' ? listingId : null,
      kind === 'trip' ? null : listingId, email, phone, status, claimant, status === 'claimed' ? new Date() : null])
    // 104's AFTER INSERT resolver resets a synthetic conflict without matching identities.
    // Set the persisted state explicitly; status-only updates do not run contact resolution.
    if (status === 'conflict') await db.query("UPDATE host_listing_assignments SET status='conflict' WHERE id=$1", [id])
    return `previous-listing:${id}`
  }
  async function search(query = '', limit: number | null = 20) {
    return (await db.query<HostListingContactOption>('SELECT * FROM public.search_staff_host_contacts($1,$2)', [query, limit])).rows
  }

  it('finds older verified emails across more than 25 registered hosts', async () => {
    const oldest = await account({ email: 'oldest@example.com', confirmed: true, name: 'ZZ oldest host' })
    for (let i = 0; i < 30; i++) await account({ email: `new${i}@example.com`, confirmed: true, name: `AA New ${i}` })
    expect(await search()).toHaveLength(20)
    expect(await search('OLDEST@EXAMPLE.COM')).toMatchObject([{ id: `registered:${oldest}`, email: 'oldest@example.com', verified: true }])
  })
  it('searches names, usernames and formatted confirmed auth phones', async () => {
    const id = await account({ name: 'Jane Mountain Host', username: 'jane_handle', phone: '12025550123', phoneConfirmed: true })
    for (const term of ['MOUNTAIN HOST', 'JANE_HANDLE', '+1 (202) 555-0123', '(202) 555']) {
      expect(await search(term)).toMatchObject([{ id: `registered:${id}`, phone: '+12025550123', email: null }])
    }
  })
  it('qualifies all listing owners even with is_host false, but not ordinary profiles', async () => {
    for (const kind of ['trip', 'stays', 'activities', 'rentals', 'getting_around']) {
      const id = await account({ email: `${kind}@example.com`, confirmed: true, host: false })
      await listing(kind, kind, id)
      expect(await search(`${kind}@`)).toMatchObject([{ id: `registered:${id}` }])
    }
    await account({ email: 'ordinary@example.com', confirmed: true, host: false })
    expect(await search('ordinary')).toEqual([])
  })
  it('includes cross-kind phone-only pending and claimed contacts, excludes conflicts', async () => {
    const claimant = await account({ name: 'Known Claimant', email: 'known@example.com', confirmed: true })
    for (const [kind, label] of [['trip', 'trip'], ['stays', 'stay'], ['activities', 'activity'], ['rentals', 'rental']]) {
      const pending = await assignment(kind, `${kind} pending`, null, '+9779812345678')
      const claimed = await assignment(kind, `${kind} claimed`, 'old@example.com', null, 'claimed', claimant)
      await assignment(kind, `${kind} conflict`, 'conflict@example.com', null, 'conflict')
      expect(await search(`${kind} pending`)).toMatchObject([{ id: pending, email: null, phone: '+9779812345678', verified: false, subtitle: `${label}: ${kind} pending` }])
      expect(await search(`${kind} claimed`)).toMatchObject([{ id: claimed, label: 'Known Claimant', verified: false, subtitle: `${label}: ${kind} claimed` }])
    }
    expect((await search('Known Claimant')).filter(row => row.source === 'previous-listing')).toHaveLength(4)
    expect(await search('conflict')).toEqual([])
    expect((await search('+977 (981) 234-5678')).filter(row => row.source === 'previous-listing')).toHaveLength(4)
    expect((await search()).some(row => row.subtitle?.includes('Awaiting'))).toBe(false)
  })
  it('exposes only usable verified registered contacts with trusted profile phone fallback', async () => {
    await account({ email: 'unverified@example.com', name: 'Hidden host', phone: '919999999999', profilePhone: '9888888888' })
    expect(await search()).toEqual([])
    const trusted = await account({ email: 'unverified@example.com', name: 'Trusted phone', profilePhone: '9812345678', country: '+977', profileVerified: true })
    expect(await search('Trusted')).toMatchObject([{ id: `registered:${trusted}`, email: null, phone: '+9779812345678' }])
    expect(await search('unverified@')).toEqual([])
    const auth = await account({ email: ' VERIFIED@Example.com ', confirmed: true, name: 'Preferred auth', phone: '+12025550123', phoneConfirmed: true,
      profilePhone: '9876543210', profileVerified: true })
    expect(await search('Preferred')).toMatchObject([{ id: `registered:${auth}`, email: 'verified@example.com', phone: '+12025550123' }])
    const fallback = await account({ name: 'Invalid auth fallback', phone: '123', phoneConfirmed: true, profilePhone: '919876543210', profileVerified: true })
    expect(await search('Invalid auth')).toMatchObject([{ id: `registered:${fallback}`, phone: '+919876543210' }])
    await account({ name: 'Invalid contacts', email: 'bad email', confirmed: true, phone: '123', phoneConfirmed: true, profilePhone: '123', profileVerified: true })
    expect(await search('Invalid contacts')).toEqual([])
  })
  it('matches punctuation and SQL injection literally, not as wildcard or digit-only searches', async () => {
    const id = await account({ name: "x%_*'),is_host.eq.false; DROP TABLE profiles; --", email: 'marker@example.com', confirmed: true })
    await account({ name: 'Ordinary 123 host', email: 'ordinary@example.com', confirmed: true, phone: '12025550123', phoneConfirmed: true })
    for (const term of ['%', '_', '*', "'),is_host.eq.false", '; DROP TABLE profiles; --']) {
      expect(await search(term)).toMatchObject([{ id: `registered:${id}` }])
    }
    for (const term of ['phone123', 'x123', "' OR true --"]) expect(await search(term)).toEqual([])
    expect(await search('+')).toMatchObject([{ label: 'Ordinary 123 host', phone: '+12025550123' }])
    // Punctuation-only must not strip to an empty digit needle and match every phone.
    for (const term of ['.', '-']) expect((await search(term)).every(row => row.id === `registered:${id}` || row.email?.includes(term))).toBe(true)
    expect((await db.query('SELECT count(*)::int AS count FROM profiles')).rows).toEqual([{ count: 2 }])
  })
  it('caps each source at twenty and honors smaller, zero, negative and default limits', async () => {
    for (let i = 0; i < 25; i++) {
      await account({ email: `host${i}@example.com`, confirmed: true })
      await assignment('trip', `Prior ${i}`, `previous${i}@example.com`, null)
    }
    for (const limit of [20, 999, null]) {
      const rows = await search('', limit)
      expect(rows.filter(row => row.source === 'registered')).toHaveLength(20)
      expect(rows.filter(row => row.source === 'previous-listing')).toHaveLength(20)
    }
    expect(await search('', 2)).toHaveLength(4)
    expect(await search('', 0)).toEqual([])
    expect(await search('', -1)).toEqual([])
    expect((await db.query('SELECT * FROM public.search_staff_host_contacts()')).rows).toHaveLength(40)
  })
  it('denies anon/authenticated RPC execution and keeps assignment contacts private', async () => {
    await assignment('trip', 'Private', 'private@example.com', null)
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`SET ROLE ${role}`)
      try {
        await expect(search()).rejects.toThrow('permission denied')
        await expect(db.query('SELECT * FROM public.host_listing_assignments')).rejects.toThrow('permission denied')
      } finally { await db.exec('RESET ROLE') }
    }
    await db.exec('SET ROLE service_role')
    try { expect(await search()).toMatchObject([{ email: 'private@example.com' }]) }
    finally { await db.exec('RESET ROLE') }
    expect((await db.query(`SELECT relrowsecurity FROM pg_class WHERE oid='public.host_listing_assignments'::regclass`)).rows).toEqual([{ relrowsecurity: true }])
    expect((await db.query(`SELECT * FROM pg_policies WHERE tablename='host_listing_assignments'`)).rows).toEqual([])
  })
  it('reruns harmlessly and is read-only, stable and SECURITY DEFINER with empty search_path', async () => {
    const id = await account({ email: 'unchanged@example.com', confirmed: true })
    await assignment('trip', 'Unchanged prior', 'pending@example.com', null)
    const tables = ['auth.users', 'profiles', 'packages', 'service_listings', 'host_listing_assignments', 'notifications', 'audit_logs']
    const snapshots = await Promise.all(tables.map(table => db.query(`SELECT * FROM ${table}`)))
    const before = await search()
    await db.exec(migration105)
    await db.exec(migration105)
    expect(await search()).toEqual(before)
    expect(await search('unchanged')).toContainEqual(expect.objectContaining({ id: `registered:${id}` }))
    for (const [index, table] of tables.entries()) expect((await db.query(`SELECT * FROM ${table}`)).rows).toEqual(snapshots[index].rows)
    expect((await db.query(`SELECT prosecdef, provolatile, proconfig,
      has_function_privilege('service_role', oid, 'EXECUTE') AS service_access,
      has_function_privilege('anon', oid, 'EXECUTE') AS anon_access,
      has_function_privilege('authenticated', oid, 'EXECUTE') AS auth_access
      FROM pg_proc WHERE oid='public.search_staff_host_contacts(text,integer)'::regprocedure`)).rows).toEqual([
      { prosecdef: true, provolatile: 's', proconfig: ['search_path=""'], service_access: true, anon_access: false, auth_access: false },
    ])
  })
})