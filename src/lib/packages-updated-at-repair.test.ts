import { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { hostListingSchema } from './test-fixtures/host-listing-schema'

const ownership = readFileSync('supabase/migrations/104_staff_host_listing_assignments.sql', 'utf8')
const approval = readFileSync('supabase/migrations/106_staff_created_listing_approval.sql', 'utf8')
const repair = readFileSync('supabase/migrations/107_packages_updated_at_repair.sql', 'utf8')

async function schema(db: PGlite, missing = true) {
  await db.exec(hostListingSchema)
  // Original packages (001) has created_at; migration 030 adds updated_at later.
  await db.exec('ALTER TABLE packages ADD COLUMN created_at timestamptz DEFAULT now()')
  if (missing) await db.exec('ALTER TABLE packages DROP COLUMN updated_at')
  await db.exec(ownership)
  await db.exec(approval)
}
async function account(db: PGlite, email: string, confirmed = true) {
  const id = randomUUID()
  await db.query('INSERT INTO auth.users(id, email, email_confirmed_at) VALUES ($1,$2,$3)', [id, email, confirmed ? new Date() : null])
  return id
}
type Trip = { id: string; host_id: string | null; moderation_status: string; is_active: boolean; updated_at?: Date }
async function trip(db: PGlite, staff: string, email: string) {
  const { rows } = await db.query<{ trip: Trip }>('SELECT public.create_delegated_host_listing($1,$2::jsonb,$3::jsonb,$4) AS trip', [
    'trip', JSON.stringify({ title: 'Staff trip', slug: randomUUID() }), JSON.stringify({ email }), staff,
  ])
  return rows[0].trip
}

describe('package updated_at deployment repair', () => {
  it('reproduces the reported error, then creates and links a staff trip after repair', async () => {
    const db = new PGlite()
    try {
      await schema(db)
      const staff = await account(db, 'staff@example.com')
      const host = await account(db, 'host@example.com')
      await expect(trip(db, staff, 'host@example.com')).rejects.toThrow('column "updated_at" of relation "packages" does not exist')
      expect((await db.query('SELECT * FROM packages')).rows).toHaveLength(0)
      expect((await db.query('SELECT * FROM host_listing_assignments')).rows).toHaveLength(0)
      await db.exec(repair)
      const created = await trip(db, staff, 'host@example.com')
      expect(created).toMatchObject({ host_id: host, moderation_status: 'approved', is_active: true })
      expect(created.updated_at).toBeTruthy()
      expect((await db.query('SELECT * FROM notifications')).rows).toHaveLength(1)
    } finally { await db.close() }
  }, 30000)

  it('repairs a saved unlinked trip so later host verification activates it safely', async () => {
    const db = new PGlite()
    try {
      await schema(db)
      const staff = await account(db, 'staff@example.com')
      const created = await trip(db, staff, 'future@example.com')
      expect(created).toMatchObject({ host_id: null, moderation_status: 'approved', is_active: false })
      await db.exec(repair)
      const host = await account(db, 'future@example.com', false)
      const pending = await db.query('SELECT host_id, is_active FROM packages WHERE id=$1', [created.id])
      expect(pending.rows[0]).toEqual({ host_id: null, is_active: false })
      await db.query('UPDATE auth.users SET email_confirmed_at=now() WHERE id=$1', [host])
      const linked = await db.query('SELECT host_id, is_active, updated_at FROM packages WHERE id=$1', [created.id])
      expect(linked.rows[0]).toMatchObject({ host_id: host, is_active: true })
      expect(linked.rows[0].updated_at).toBeTruthy()
      expect((await db.query('SELECT * FROM notifications')).rows).toHaveLength(1)
    } finally { await db.close() }
  }, 30000)

  it('backfills from created_at and maintains timestamps on ordinary edits', async () => {
    const db = new PGlite()
    try {
      await schema(db)
      const id = randomUUID()
      const historical = new Date('2025-02-01T12:00:00Z')
      await db.query('INSERT INTO packages(id,title,created_at) VALUES ($1,$2,$3)', [id, 'Historical trip', historical])
      await db.exec(repair)
      expect((await db.query('SELECT updated_at FROM packages WHERE id=$1', [id])).rows[0].updated_at).toEqual(historical)
      await db.query("UPDATE packages SET title='Edited trip' WHERE id=$1", [id])
      const edited = (await db.query('SELECT updated_at FROM packages WHERE id=$1', [id])).rows[0].updated_at as Date
      expect(edited.getTime()).toBeGreaterThan(historical.getTime())
      const fresh = await db.query('INSERT INTO packages(title) VALUES ($1) RETURNING updated_at', ['New trip'])
      expect(fresh.rows[0].updated_at).toBeInstanceOf(Date)
    } finally { await db.close() }
  }, 30000)

  it('is rerunnable on databases with the old trigger and preserves existing listing data', async () => {
    const db = new PGlite()
    try {
      await schema(db, false)
      await db.exec(`CREATE FUNCTION public.update_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN NEW.updated_at:=now(); RETURN NEW; END; $$;
        CREATE TRIGGER packages_updated_at BEFORE UPDATE ON public.packages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();`)
      const id = randomUUID()
      const historical = new Date('2025-03-01T12:00:00Z')
      await db.query("INSERT INTO packages(id,title,updated_at,moderation_status,is_active) VALUES ($1,'Existing trip',$2,'rejected',false)", [id, historical])
      const before = (await db.query('SELECT * FROM packages')).rows
      await db.exec(repair)
      await db.exec(repair)
      expect((await db.query('SELECT * FROM packages')).rows).toEqual(before)
      expect((await db.query("SELECT tgname FROM pg_trigger WHERE tgrelid='packages'::regclass AND tgname='packages_updated_at'")).rows).toHaveLength(1)
      expect((await db.query('SELECT * FROM notifications')).rows).toHaveLength(0)
      // Reapplying older ownership definitions cannot remove the repaired column.
      await db.exec(ownership)
      await db.exec(approval)
      const staff = await account(db, 'staff@example.com')
      const host = await account(db, 'host@example.com')
      expect(await trip(db, staff, 'host@example.com')).toMatchObject({ host_id: host, is_active: true })
    } finally { await db.close() }
  }, 30000)
})