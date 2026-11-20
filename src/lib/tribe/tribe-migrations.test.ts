import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Applies migrations 119–121 to an in-memory Postgres with a minimal stub of the
 * existing schema, then exercises RLS + state machines as real roles.
 */
describe('119–121: Tribe community, trust & safety, platform', () => {
  let db: PGlite
  const organiser = randomUUID()
  const joiner = randomUUID()
  const woman = randomUUID()
  const host = randomUUID()
  const admin = randomUUID()
  const stranger = randomUUID()

  async function as<T = unknown>(uid: string | null, sql: string, params: unknown[] = []) {
    await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '${uid ?? ''}', false);
                   SELECT set_config('request.jwt.claim.role', '${uid ? 'authenticated' : 'anon'}', false);
                   SET ROLE ${uid ? 'authenticated' : 'anon'};`)
    try {
      return await db.query<T>(sql, params)
    } finally {
      await db.exec('RESET ROLE;')
    }
  }

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
        $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'service_role') $$;
      CREATE TABLE profiles(id uuid PRIMARY KEY, username text, full_name text, role text DEFAULT 'user',
        is_host boolean DEFAULT false, is_phone_verified boolean DEFAULT false, created_at timestamptz DEFAULT now());
      CREATE TABLE packages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, slug text UNIQUE NOT NULL,
        description text NOT NULL, short_description text, price_paise int NOT NULL, duration_days int NOT NULL,
        trip_days int, trip_nights int, max_group_size int, includes text[], images text[], host_id uuid,
        departure_dates date[], return_dates date[], is_active boolean DEFAULT true, is_featured boolean DEFAULT false,
        moderation_status text DEFAULT 'approved');
      CREATE TABLE notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, type text NOT NULL,
        title text NOT NULL, body text, link text, is_read boolean DEFAULT false, metadata jsonb DEFAULT '{}',
        created_at timestamptz DEFAULT now());
      ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "System can create notifications" ON notifications FOR INSERT WITH CHECK (true);
      CREATE POLICY "Users see own notifications" ON notifications FOR SELECT USING (auth.uid() = user_id);
      CREATE TABLE messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), room_id uuid, user_id uuid, content text);
      CREATE TABLE chat_rooms(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, type text,
        package_id uuid, created_by uuid, is_active boolean DEFAULT true);
      CREATE TABLE chat_room_members(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), room_id uuid, user_id uuid,
        UNIQUE(room_id, user_id));
      CREATE TABLE join_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), trip_id uuid, user_id uuid,
        status text, message text, payment_deadline timestamptz, UNIQUE(trip_id, user_id));
      CREATE TABLE bookings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, status text,
        total_amount_paise int, created_at timestamptz DEFAULT now());
      CREATE TABLE audit_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), admin_id uuid NOT NULL, action text NOT NULL,
        target_type text NOT NULL, target_id text, details jsonb DEFAULT '{}', created_at timestamptz DEFAULT now());
      CREATE TABLE platform_settings(key text PRIMARY KEY, value text NOT NULL, description text, updated_at timestamptz DEFAULT now());
      ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "Anyone can read settings" ON platform_settings FOR SELECT USING (true);
      CREATE POLICY "Admins can update settings" ON platform_settings FOR UPDATE USING (true);
      CREATE POLICY "Admins can insert settings" ON platform_settings FOR INSERT WITH CHECK (true);
      CREATE FUNCTION create_notification(p_user_id uuid, p_type text, p_title text, p_body text DEFAULT NULL,
        p_link text DEFAULT NULL, p_metadata jsonb DEFAULT '{}') RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
      GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
    `)
    for (const f of ['119_tribe_community.sql', '120_trust_safety.sql', '121_platform_devices_prefs_analytics.sql']) {
      // NOTIFY / realtime publication are Supabase-only; PGlite ignores missing publication via the DO blocks.
      await db.exec(readFileSync(`supabase/migrations/${f}`, 'utf8'))
    }
    await db.exec(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;`)
    await db.query(`INSERT INTO profiles(id, username, full_name, role, is_host, is_phone_verified) VALUES
      ($1, 'ananya', 'Ananya', 'user', false, true),
      ($2, 'dev', 'Dev', 'user', false, true),
      ($3, 'riya', 'Riya', 'user', false, true),
      ($4, 'tentit', 'Tent It India', 'user', true, true),
      ($5, 'staff', 'Staff', 'admin', false, true),
      ($6, 'nophone', 'No Phone', 'user', false, false)`, [organiser, joiner, woman, host, admin, stranger])
    await db.query(`UPDATE profiles SET gender = 'woman', is_id_verified = true WHERE id = $1`, [woman])
  })
  afterAll(async () => { await db?.close() })

  let planId: string

  it('lets a phone-verified user post a plan and seats them as organiser', async () => {
    const { rows } = await as<{ id: string }>(organiser, `INSERT INTO posts(kind, author_id, title, place_name, place_slug,
      starts_on, ends_on, spots_total, est_cost_text) VALUES ('plan', $1, 'Spiti in January', 'Spiti', 'spiti',
      current_date + 20, current_date + 27, 4, 'Est. ₹14,000 each') RETURNING id`, [organiser])
    planId = rows[0].id
    const m = await db.query<{ role: string; state: string }>('SELECT role, state FROM plan_members WHERE post_id = $1', [planId])
    expect(m.rows).toEqual([{ role: 'organiser', state: 'approved' }])
  })

  it('blocks posting without phone verification', async () => {
    await expect(as(stranger, `INSERT INTO posts(kind, author_id, body) VALUES ('ask', $1, 'hi')`, [stranger]))
      .rejects.toThrow(/row-level security/)
  })

  it('requires an intro to join and notifies the organiser', async () => {
    await expect(as(joiner, `INSERT INTO plan_members(post_id, user_id, intro) VALUES ($1, $2, 'hey')`, [planId, joiner]))
      .rejects.toThrow(/row-level security/)
    await as(joiner, `INSERT INTO plan_members(post_id, user_id, intro) VALUES ($1, $2, 'Did Hampta last year, flexible on dates')`, [planId, joiner])
    const n = await db.query<{ type: string }>(`SELECT type FROM notifications WHERE user_id = $1`, [organiser])
    expect(n.rows.map(r => r.type)).toContain('tribe_join_request')
  })

  it('lets the requester only withdraw, and the organiser approve', async () => {
    await expect(as(joiner, `UPDATE plan_members SET state = 'approved' WHERE post_id = $1 AND user_id = $2`, [planId, joiner]))
      .rejects.toThrow(/only withdraw/)
    await as(organiser, `UPDATE plan_members SET state = 'approved' WHERE post_id = $1 AND user_id = $2`, [planId, joiner])
    const p = await db.query<{ member_count: number }>('SELECT member_count FROM posts WHERE id = $1', [planId])
    expect(p.rows[0].member_count).toBe(2)
    const room = await db.query<{ n: number }>(`SELECT count(*)::int n FROM chat_room_members m JOIN chat_rooms r ON r.id = m.room_id
      WHERE r.post_id = $1 AND r.type = 'trip'`, [planId])
    expect(room.rows[0].n).toBe(2)
  })

  it('keeps women-only plans hidden from men and restricts joiners', async () => {
    const { rows } = await as<{ id: string }>(woman, `INSERT INTO posts(kind, author_id, place_name, starts_on, spots_total, audience)
      VALUES ('plan', $1, 'Gokarna', current_date + 5, 3, 'women') RETURNING id`, [woman])
    const feedForMan = await as<{ post_id: string }>(joiner, `SELECT post_id FROM tribe_feed()`)
    expect(feedForMan.rows.map(r => r.post_id)).not.toContain(rows[0].id)
    const feedForWoman = await as<{ post_id: string }>(woman, `SELECT post_id FROM tribe_feed()`)
    expect(feedForWoman.rows.map(r => r.post_id)).toContain(rows[0].id)
    await as(joiner, `INSERT INTO plan_members(post_id, user_id, intro) VALUES ($1, $2, 'I would love to come along')`, [rows[0].id, joiner])
    await expect(as(woman, `UPDATE plan_members SET state = 'approved' WHERE post_id = $1 AND user_id = $2`, [rows[0].id, joiner]))
      .rejects.toThrow(/ID-verified|women-only/)
  })

  it('keeps replies one level deep and counts comments', async () => {
    const c = await as<{ id: string }>(joiner, `INSERT INTO post_comments(post_id, author_id, body) VALUES ($1, $2, 'Which pass?') RETURNING id`, [planId, joiner])
    const r = await as<{ id: string }>(organiser, `INSERT INTO post_comments(post_id, parent_id, author_id, body) VALUES ($1, $2, $3, 'Kunzum') RETURNING id`, [planId, c.rows[0].id, organiser])
    await expect(as(joiner, `INSERT INTO post_comments(post_id, parent_id, author_id, body) VALUES ($1, $2, $3, 'nested')`, [planId, r.rows[0].id, joiner]))
      .rejects.toThrow(/one level/)
    const p = await db.query<{ comment_count: number }>('SELECT comment_count FROM posts WHERE id = $1', [planId])
    expect(p.rows[0].comment_count).toBe(2)
  })

  it('stops authors from tampering with counters or un-hiding', async () => {
    await as(organiser, `UPDATE posts SET comment_count = 999, body = 'edited' WHERE id = $1`, [planId])
    const p = await db.query<{ comment_count: number; body: string }>('SELECT comment_count, body FROM posts WHERE id = $1', [planId])
    expect(p.rows[0]).toEqual({ comment_count: 2, body: 'edited' })
  })

  it('maintains reaction counts', async () => {
    await as(joiner, `INSERT INTO post_reactions(post_id, user_id, kind) VALUES ($1, $2, 'want_to_go')`, [planId, joiner])
    await as(woman, `INSERT INTO post_reactions(post_id, user_id, kind) VALUES ($1, $2, 'want_to_go')`, [planId, woman])
    await as(woman, `DELETE FROM post_reactions WHERE post_id = $1 AND user_id = $2`, [planId, woman])
    const p = await db.query<{ reaction_counts: Record<string, number> }>('SELECT reaction_counts FROM posts WHERE id = $1', [planId])
    expect(p.rows[0].reaction_counts.want_to_go).toBe(1)
  })

  it('accepts a host offer into a package with held seats', async () => {
    await expect(as(joiner, `INSERT INTO host_offers(post_id, host_id, price_paise) VALUES ($1, $2, 1500000)`, [planId, joiner]))
      .rejects.toThrow(/row-level security/)
    const o = await as<{ id: string }>(host, `INSERT INTO host_offers(post_id, host_id, price_paise, includes) VALUES ($1, $2, 1500000, ARRAY['Stay','Transport']) RETURNING id`, [planId, host])
    // a member (not organiser) cannot accept
    await expect(as(joiner, `SELECT accept_host_offer($1)`, [o.rows[0].id])).rejects.toThrow(/organiser/)
    const r = await as<{ pkg: string }>(organiser, `SELECT accept_host_offer($1) AS pkg`, [o.rows[0].id])
    const pkg = r.rows[0].pkg
    const jr = await db.query<{ n: number }>(`SELECT count(*)::int n FROM join_requests WHERE trip_id = $1 AND status = 'approved'`, [pkg])
    expect(jr.rows[0].n).toBe(2)
    const k = await db.query<{ host_id: string; max_group_size: number }>('SELECT host_id, max_group_size FROM packages WHERE id = $1', [pkg])
    expect(k.rows[0]).toEqual({ host_id: host, max_group_size: 4 })
  })

  it('auto-hides a post after three distinct reports and prioritises safety reasons', async () => {
    const { rows } = await as<{ id: string }>(joiner, `INSERT INTO posts(kind, author_id, body) VALUES ('ask', $1, 'Best cafe in Kasol?') RETURNING id`, [joiner])
    for (const uid of [organiser, woman, host]) {
      await as(uid, `INSERT INTO reports(reporter_id, target_type, target_id, reason) VALUES ($1, 'post', $2, $3)`,
        [uid, rows[0].id, uid === woman ? 'harassment' : 'spam'])
    }
    const p = await db.query<{ status: string }>('SELECT status FROM posts WHERE id = $1', [rows[0].id])
    expect(p.rows[0].status).toBe('hidden')
    const pr = await db.query<{ priority: string }>(`SELECT priority FROM reports WHERE reporter_id = $1`, [woman])
    expect(pr.rows[0].priority).toBe('safety')
    // the author cannot un-hide it
    await expect(as(joiner, `UPDATE posts SET status = 'live' WHERE id = $1`, [rows[0].id])).rejects.toThrow(/under review/)
  })

  it('hides blocked authors from the feed', async () => {
    await as(woman, `INSERT INTO user_blocks(blocker_id, blocked_id) VALUES ($1, $2)`, [woman, organiser])
    const feed = await as<{ post_id: string }>(woman, `SELECT post_id FROM tribe_feed()`)
    expect(feed.rows.map(r => r.post_id)).not.toContain(planId)
  })

  it('fixes platform_settings and notification spoofing', async () => {
    await expect(as(joiner, `UPDATE platform_settings SET value = '0' WHERE key = 'tribe_enabled' RETURNING key`))
      .resolves.toMatchObject({ rows: [] })
    const s = await db.query<{ value: string }>(`SELECT value FROM platform_settings WHERE key = 'tribe_enabled'`)
    expect(s.rows[0].value).toBe('true')
    await expect(as(joiner, `INSERT INTO notifications(user_id, type, title, link) VALUES ($1, 'x', 'Win', 'https://evil.example')`, [organiser]))
      .rejects.toThrow(/row-level security/)
    await expect(as(null, `INSERT INTO notifications(user_id, type, title, link) VALUES ($1, 'x', 'Win', '/ok')`, [organiser]))
      .rejects.toThrow(/row-level security|permission/)
  })

  it('returns suggestions and staff analytics, and refuses analytics to users', async () => {
    const s = await as<{ item_type: string }>(woman, `SELECT item_type FROM suggest_for_user(15.0, 74.0)`)
    expect(s.rows.length).toBeGreaterThan(0)
    const a = await as<{ r: { open_reports: number } }>(admin, `SELECT admin_analytics_overview(30) AS r`)
    expect(Number(a.rows[0].r.open_reports)).toBeGreaterThan(0)
    await expect(as(joiner, `SELECT admin_analytics_overview(30)`)).rejects.toThrow(/staff only/)
  })

  it('expires stale requests and past plans', async () => {
    await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.role', 'service_role', false);`)
    await db.exec(`UPDATE plan_members SET expires_at = now() - interval '1 hour' WHERE state = 'requested'`)
    const r = await db.query<{ r: { requests_expired: number } }>(`SELECT expire_tribe_items() AS r`)
    expect(r.rows[0].r.requests_expired).toBeGreaterThan(0)
  })
})
