import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { hostListingSchema } from './test-fixtures/host-listing-schema'

const migration = (name: string) => readFileSync(`supabase/migrations/${name}`, 'utf8')
const migration104 = migration('104_staff_host_listing_assignments.sql')
const migration106 = migration('106_staff_created_listing_approval.sql')
const migration110 = migration('110_publish_staff_created_listings.sql')

const cases = [
  { kind: 'trip', table: 'packages', type: undefined },
  { kind: 'service', table: 'service_listings', type: 'rentals' },
]

describe('110: staff-created listings publish immediately', () => {
  let db: PGlite
  let staffId: string

  beforeEach(async () => {
    db = new PGlite()
    await db.exec(hostListingSchema)
    await db.exec(migration104)
    await db.exec(migration106)
    staffId = await account('staff@example.com', true)
  }, 30000)
  afterEach(async () => { await db?.close() })

  async function account(email: string, confirmed = false) {
    const id = randomUUID()
    await db.query('INSERT INTO auth.users(id, email, email_confirmed_at) VALUES ($1, $2, $3)',
      [id, email, confirmed ? new Date() : null])
    return id
  }
  async function create(c: typeof cases[number], email: string) {
    const payload = { title: 'Staff-created', slug: randomUUID(), ...(c.type ? { type: c.type } : {}) }
    const { rows } = await db.query<{ listing: { id: string; is_active: boolean } }>(
      'SELECT public.create_delegated_host_listing($1, $2::jsonb, $3::jsonb, $4) AS listing',
      [c.kind, JSON.stringify(payload), JSON.stringify({ email }), staffId])
    return rows[0].listing
  }
  async function read(c: typeof cases[number], id: string) {
    return (await db.query<{ is_active: boolean; host_id: string | null }>(
      `SELECT is_active, host_id FROM public.${c.table} WHERE id = $1`, [id])).rows[0]
  }

  it.each(cases)('$kind: backfills listings hidden by the old guard', async c => {
    const before = await create(c, 'later@example.com')
    expect(before.is_active).toBe(false)
    await db.exec(migration110)
    expect((await read(c, before.id)).is_active).toBe(true)
  })

  it.each(cases)('$kind: new listings are live and can be hidden/shown before linking', async c => {
    await db.exec(migration110)
    const row = await create(c, 'later@example.com')
    expect(row.is_active).toBe(true)
    await db.query(`UPDATE public.${c.table} SET is_active = false WHERE id = $1`, [row.id])
    await db.query(`UPDATE public.${c.table} SET is_active = true WHERE id = $1`, [row.id])
    expect(await read(c, row.id)).toMatchObject({ is_active: true, host_id: null })
  })

  it.each(cases)('$kind: linking the host keeps the visibility staff chose', async c => {
    await db.exec(migration110)
    const row = await create(c, 'host@example.com')
    await db.query(`UPDATE public.${c.table} SET is_active = false WHERE id = $1`, [row.id])
    const hostId = await account('host@example.com', true)
    expect(await read(c, row.id)).toMatchObject({ is_active: false, host_id: hostId })
  })

  it('is safe to rerun', async () => {
    await db.exec(migration110)
    await db.exec(migration110)
    const row = await create(cases[1], 'x@example.com')
    expect(row.is_active).toBe(true)
  })

  it('111: stores and updates the staff-entered host display name', async () => {
    await db.exec(migration110)
    await db.exec('SET check_function_bodies = off')
    await db.exec(readFileSync('supabase/migrations/111_unlinked_host_display.sql', 'utf8'))
    const payload = { title: 'Named', slug: randomUUID(), type: 'rentals' }
    const { rows } = await db.query<{ listing: { id: string; is_active: boolean } }>(
      'SELECT public.create_delegated_host_listing($1, $2::jsonb, $3::jsonb, $4) AS listing',
      ['service', JSON.stringify(payload), JSON.stringify({ email: 'n@example.com', name: '  Asha Rentals ' }), staffId])
    const id = rows[0].listing.id
    expect(rows[0].listing.is_active).toBe(true)
    const name = async () => (await db.query<{ host_name: string | null }>(
      'SELECT host_name FROM host_listing_assignments WHERE service_listing_id = $1', [id])).rows[0].host_name
    expect(await name()).toBe('Asha Rentals')
    await db.query('SELECT public.update_host_listing_contact($1, $2, $3::jsonb, $4)',
      ['service', id, JSON.stringify({ email: 'n@example.com', name: 'Asha Bike Rentals' }), staffId])
    expect(await name()).toBe('Asha Bike Rentals')
  })
})
