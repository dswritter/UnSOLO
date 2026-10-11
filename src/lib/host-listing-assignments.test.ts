import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest'

// Minimal existing schema; the ACTUAL migration supplies all tested functions,
// triggers, constraints and grants. No Supabase project/credentials required.
const fixture = `
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, phone text, email_confirmed_at timestamptz, phone_confirmed_at timestamptz);
  CREATE TABLE public.profiles(id uuid PRIMARY KEY, role text DEFAULT 'user', phone_number text,
    phone_country_code text DEFAULT '+91', is_phone_verified boolean DEFAULT false, is_host boolean DEFAULT false);
  CREATE TABLE public.service_listings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, slug text UNIQUE,
    host_id uuid REFERENCES profiles(id), updated_at timestamptz DEFAULT now(), status text DEFAULT 'pending', is_active boolean DEFAULT false);
  CREATE TABLE public.packages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, slug text UNIQUE,
    host_id uuid REFERENCES profiles(id), updated_at timestamptz DEFAULT now(), moderation_status text DEFAULT 'pending', is_active boolean DEFAULT false);
  CREATE TABLE public.notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES profiles(id), type text, title text, body text, link text);
  CREATE TABLE public.audit_logs(admin_id uuid, action text, target_type text, target_id text, details jsonb);
  CREATE TABLE public.phone_otp_verifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, verified boolean DEFAULT false);
  GRANT SELECT, UPDATE ON public.profiles TO authenticated;
  GRANT ALL ON public.phone_otp_verifications TO authenticated;
  CREATE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
    BEGIN INSERT INTO public.profiles(id) VALUES (NEW.id); RETURN NEW; END;
  $$;
  CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
`

describe('staff host listing ownership database', () => {
  let db: PGlite
  let staffId: string
  beforeAll(async () => {
    db = new PGlite()
    await db.exec(fixture)
    await db.exec(readFileSync('supabase/migrations/104_staff_host_listing_assignments.sql', 'utf8'))
  }, 30000)
  afterAll(async () => { await db?.close() })
  beforeEach(async () => {
    await db.exec('TRUNCATE public.host_listing_assignments, public.notifications, public.audit_logs, public.packages, public.service_listings, public.profiles, auth.users CASCADE')
    staffId = await account('staff@example.com', true)
  })

  async function account(email: string, confirmed = false, phone?: string) {
    const id = randomUUID()
    await db.query('INSERT INTO auth.users(id, email, email_confirmed_at, phone, phone_confirmed_at) VALUES ($1, $2, $3, $4, $5)',
      [id, email, confirmed ? new Date() : null, phone || null, phone ? new Date() : null])
    return id
  }
  async function listing(contact: { email?: string; phone?: string }, kind = 'service', slug = randomUUID()) {
    const { rows } = await db.query<{ listing: { id: string; host_id: string | null; status?: string } }>(
      'SELECT public.create_delegated_host_listing($1, $2::jsonb, $3::jsonb, $4) AS listing',
      [kind, JSON.stringify({ title: 'Staff-created listing', slug }), JSON.stringify(contact), staffId])
    return rows[0].listing
  }
  async function ownership(id: string) {
    const { rows } = await db.query<{ status: string; claimed_by: string | null }>(
      'SELECT status, claimed_by FROM public.host_listing_assignments WHERE service_listing_id = $1 OR package_id = $1', [id])
    return rows[0]
  }
  async function host(id: string) {
    const { rows } = await db.query<{ host_id: string | null }>('SELECT host_id FROM service_listings WHERE id = $1', [id])
    return rows[0].host_id
  }

  it('keeps unverified signup unclaimed, then links on email confirmation', async () => {
    const l = await listing({ email: 'host@example.com' })
    const id = await account('HOST@example.com')
    expect(await host(l.id)).toBeNull()
    await db.query('UPDATE auth.users SET email_confirmed_at = now() WHERE id = $1', [id])
    expect(await host(l.id)).toBe(id)
    expect(await ownership(l.id)).toEqual({ status: 'claimed', claimed_by: id })
    const { rows } = await db.query<{ is_host: boolean; is_phone_verified: boolean }>('SELECT is_host, is_phone_verified FROM profiles WHERE id = $1', [id])
    expect(rows[0]).toEqual({ is_host: true, is_phone_verified: false })
  })
  it('links a new verified OAuth account after profile creation', async () => {
    const l = await listing({ email: 'google@example.com' })
    const id = await account('google@example.com', true)
    expect(await host(l.id)).toBe(id)
  })
  it('immediately links an existing verified account', async () => {
    const id = await account('existing@example.com', true)
    const l = await listing({ email: 'existing@example.com' })
    expect(l.host_id).toBe(id)
  })
  it('links by verified profile phone, never an unverified phone', async () => {
    const l = await listing({ phone: '+919876543210' })
    const id = await account('different@example.com', true)
    await db.query('UPDATE profiles SET phone_number = $1 WHERE id = $2', ['9876543210', id])
    expect(await host(l.id)).toBeNull()
    await db.query('UPDATE profiles SET is_phone_verified = true WHERE id = $1', [id])
    expect(await host(l.id)).toBe(id)
  })
  it('links a verified Supabase phone account', async () => {
    const l = await listing({ phone: '+919876543210' })
    const id = await account('phone@example.com', false, '919876543210')
    expect(await host(l.id)).toBe(id)
  })
  it('matches international phones with country code', async () => {
    const l = await listing({ phone: '+9779812345678' })
    const id = await account('nepal@example.com', true)
    await db.query("UPDATE profiles SET phone_number = '9812345678', phone_country_code = '+977', is_phone_verified = true WHERE id = $1", [id])
    expect(await host(l.id)).toBe(id)
  })
  it('refuses ambiguous email and phone and permits staff correction', async () => {
    const emailId = await account('email@example.com', true)
    const phoneId = await account('phone@example.com', true)
    await db.query("UPDATE profiles SET phone_number = '9876543210', is_phone_verified = true WHERE id = $1", [phoneId])
    const l = await listing({ email: 'email@example.com', phone: '+919876543210' })
    expect(await host(l.id)).toBeNull()
    expect((await ownership(l.id)).status).toBe('conflict')
    await db.query('SELECT public.update_host_listing_contact($1, $2, $3::jsonb, $4)',
      ['service', l.id, JSON.stringify({ email: 'email@example.com' }), staffId])
    expect(await host(l.id)).toBe(emailId)
  })
  it('refuses duplicate verified phone identities', async () => {
    const a = await account('a@example.com', true)
    const b = await account('b@example.com', true)
    await db.query("UPDATE profiles SET phone_number = '9876543210', is_phone_verified = true WHERE id IN ($1, $2)", [a, b])
    const l = await listing({ phone: '+919876543210' })
    expect((await ownership(l.id)).status).toBe('conflict')
  })
  it('links every matching listing without duplicate notifications or reassigning later', async () => {
    const first = await listing({ email: 'host@example.com' })
    const second = await listing({ email: 'host@example.com' })
    const id = await account('host@example.com', true)
    await db.query('SELECT public.resolve_host_listings_for_user($1)', [id])
    await db.query('UPDATE auth.users SET email = $1 WHERE id = $2', ['changed@example.com', id])
    await account('host@example.com', true)
    expect(await host(first.id)).toBe(id)
    expect(await host(second.id)).toBe(id)
    const { rows } = await db.query<{ count: number }>('SELECT count(*)::int AS count FROM notifications WHERE user_id = $1', [id])
    expect(rows[0].count).toBe(2)
    await expect(db.query('SELECT public.update_host_listing_contact($1, $2, $3::jsonb, $4)',
      ['service', first.id, JSON.stringify({ email: 'someone@example.com' }), staffId])).rejects.toThrow('already has a host')
  })
  it('creates and links community trips using the same atomic flow', async () => {
    const l = await listing({ email: 'trip@example.com' }, 'trip')
    const id = await account('trip@example.com', true)
    const { rows } = await db.query<{ host_id: string; moderation_status: string }>('SELECT host_id, moderation_status FROM packages WHERE id = $1', [l.id])
    expect(rows[0]).toEqual({ host_id: id, moderation_status: 'pending' })
  })
  it('prevents publishing before claiming, and allows approval once claimed', async () => {
    const l = await listing({ email: 'publish@example.com' })
    await expect(db.query("UPDATE service_listings SET status = 'approved', is_active = true WHERE id = $1", [l.id])).rejects.toThrow('Link the host')
    const trip = await listing({ email: 'publish@example.com' }, 'trip')
    await expect(db.query("UPDATE packages SET moderation_status = 'approved', is_active = true WHERE id = $1", [trip.id])).rejects.toThrow('Link the host')
    await account('publish@example.com', true)
    await db.query("UPDATE service_listings SET status = 'approved', is_active = true WHERE id = $1", [l.id])
    await db.query("UPDATE packages SET moderation_status = 'approved', is_active = true WHERE id = $1", [trip.id])
  })
  it('assigns an existing unowned listing and marks it as delegated', async () => {
    const id = randomUUID()
    await db.query("INSERT INTO service_listings(id, title, status, is_active) VALUES ($1, 'Existing listing', 'approved', true)", [id])
    await db.query('SELECT public.update_host_listing_contact($1, $2, $3::jsonb, $4)',
      ['service', id, JSON.stringify({ email: 'future@example.com' }), staffId])
    const { rows } = await db.query<{ created_on_behalf_by: string; status: string; is_active: boolean }>('SELECT created_on_behalf_by, status, is_active FROM service_listings WHERE id = $1', [id])
    expect(rows[0]).toEqual({ created_on_behalf_by: staffId, status: 'pending', is_active: false })
    expect((await ownership(id)).status).toBe('pending')
  })
  it('rolls back listing creation if contact is missing', async () => {
    await expect(listing({})).rejects.toThrow()
    const { rows } = await db.query<{ count: number }>('SELECT count(*)::int AS count FROM service_listings')
    expect(rows[0].count).toBe(0)
  })
  it('rolls back duplicate slugs without leaving an assignment', async () => {
    await listing({ email: 'host@example.com' }, 'service', 'unique')
    await expect(listing({ email: 'host@example.com' }, 'service', 'unique')).rejects.toThrow()
    const { rows } = await db.query<{ count: number }>('SELECT count(*)::int AS count FROM host_listing_assignments')
    expect(rows[0].count).toBe(1)
  })
  it('never overwrites a manually assigned host', async () => {
    const l = await listing({ email: 'future@example.com' })
    await db.query('UPDATE service_listings SET host_id = $1 WHERE id = $2', [staffId, l.id])
    await account('future@example.com', true)
    expect(await host(l.id)).toBe(staffId)
  })
  it('denies direct client access to contacts, ownership RPCs and OTP records', async () => {
    await db.exec('SET ROLE authenticated')
    try {
      await expect(db.query('SELECT * FROM host_listing_assignments')).rejects.toThrow('permission denied')
      await expect(db.query('SELECT * FROM phone_otp_verifications')).rejects.toThrow('permission denied')
      await expect(db.query('SELECT public.resolve_host_listings_for_user($1)', [staffId])).rejects.toThrow('permission denied')
      await expect(listing({ email: 'spoof@example.com' })).rejects.toThrow('permission denied')
    } finally { await db.exec('RESET ROLE') }
  })
  it('prevents phone verification and staff-role spoofing by authenticated users', async () => {
    await db.exec('SET ROLE authenticated')
    try {
      await expect(db.query('UPDATE profiles SET is_phone_verified = true WHERE id = $1', [staffId])).rejects.toThrow('trusted server')
      await expect(db.query("UPDATE profiles SET role = 'admin' WHERE id = $1", [staffId])).rejects.toThrow('trusted server')
    } finally { await db.exec('RESET ROLE') }
  })
  it('revokes verification when a user edits their phone directly', async () => {
    await db.query("UPDATE profiles SET phone_number = '9876543210', is_phone_verified = true WHERE id = $1", [staffId])
    await db.exec('SET ROLE authenticated')
    try { await db.query("UPDATE profiles SET phone_number = '9876543211' WHERE id = $1", [staffId]) }
    finally { await db.exec('RESET ROLE') }
    const { rows } = await db.query<{ is_phone_verified: boolean }>('SELECT is_phone_verified FROM profiles WHERE id = $1', [staffId])
    expect(rows[0].is_phone_verified).toBe(false)
  })
})