import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Applies migrations 119–121 to an in-memory Postgres with a minimal stub of the existing schema,
 * then exercises RLS, guard triggers and workflows as real roles (anon / authenticated / service).
 */
describe('119–121: Tribe community, trust & safety, platform', () => {
  let db: PGlite
  const organiser = randomUUID()
  const joiner = randomUUID()
  const woman = randomUUID()
  const host = randomUUID()
  const admin = randomUUID()
  const stranger = randomUUID()
  const manVerified = randomUUID()
  const fieldPerson = randomUUID()
  const moderator = randomUUID()

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
  /** Server (API) context: service role, bypasses RLS like supabase-js with the service key. */
  async function svc<T = unknown>(sql: string, params: unknown[] = []) {
    await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false);
                   SELECT set_config('request.jwt.claim.role', 'service_role', false);`)
    return db.query<T>(sql, params)
  }
  const one = async <T,>(p: Promise<{ rows: T[] }>) => (await p).rows[0]

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
      ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
      CREATE POLICY profiles_select_all ON profiles FOR SELECT USING (true);
      CREATE POLICY profiles_update_own ON profiles FOR UPDATE USING (auth.uid() = id);
      CREATE TABLE team_members(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid UNIQUE, role text,
        is_active boolean DEFAULT true, custom_permissions text[] DEFAULT '{}');
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
      CREATE TABLE chat_rooms(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, type text,
        package_id uuid, created_by uuid, is_active boolean DEFAULT true);
      ALTER TABLE chat_rooms ENABLE ROW LEVEL SECURITY;
      CREATE POLICY chat_rooms_select_all ON chat_rooms FOR SELECT USING (true);
      CREATE TABLE chat_room_members(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), room_id uuid, user_id uuid,
        last_read timestamptz DEFAULT now(), UNIQUE(room_id, user_id));
      ALTER TABLE chat_room_members ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "members_select_all" ON chat_room_members FOR SELECT USING (true);
      CREATE POLICY "members_insert_auth" ON chat_room_members FOR INSERT WITH CHECK (auth.uid() = user_id);
      CREATE TABLE messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), room_id uuid, user_id uuid, content text,
        message_type text DEFAULT 'text', created_at timestamptz DEFAULT now());
      ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "messages_select_room_members" ON messages FOR SELECT USING (
        EXISTS (SELECT 1 FROM chat_room_members crm WHERE crm.room_id = messages.room_id AND crm.user_id = auth.uid()));
      CREATE POLICY "messages_insert_room_members" ON messages FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM chat_room_members crm WHERE crm.room_id = messages.room_id AND crm.user_id = auth.uid())
        AND user_id = auth.uid());
      CREATE TABLE message_read_receipts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), message_id uuid, user_id uuid,
        read_at timestamptz DEFAULT now(), UNIQUE(message_id, user_id));
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
      await db.exec(readFileSync(`supabase/migrations/${f}`, 'utf8'))
    }
    await db.exec(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;`)
    await svc(`INSERT INTO profiles(id, username, full_name, role, is_host, is_phone_verified) VALUES
      ($1, 'ananya', 'Ananya', 'user', false, true),
      ($2, 'dev', 'Dev', 'user', false, true),
      ($3, 'riya', 'Riya', 'user', false, true),
      ($4, 'tentit', 'Tent It India', 'user', true, true),
      ($5, 'staff', 'Staff', 'admin', false, true),
      ($6, 'nophone', 'No Phone', 'user', false, false),
      ($7, 'arjun', 'Arjun', 'user', false, true),
      ($8, 'field', 'Field', 'field_person', false, true),
      ($9, 'mod', 'Mod', 'chat_responder', false, true)`,
      [organiser, joiner, woman, host, admin, stranger, manVerified, fieldPerson, moderator])
    await svc(`UPDATE profiles SET is_id_verified = true WHERE id IN ($1, $2)`, [woman, manVerified])
    await svc(`INSERT INTO profile_private(user_id, gender, home_city, home_lat, home_lng) VALUES
      ($1, 'woman', 'Bengaluru', 12.97, 77.59), ($2, 'man', 'Pune', 18.52, 73.86)`, [woman, manVerified])
  })
  afterAll(async () => { await db?.close() })

  let planId: string
  const newPlan = async (author: string, extra: Record<string, unknown> = {}) => {
    const cols = { kind: 'plan', author_id: author, title: 'Plan', place_name: 'Spiti', place_slug: 'spiti',
      starts_on: '2099-01-10', ends_on: '2099-01-17', spots_total: 4, ...extra }
    const keys = Object.keys(cols)
    const r = await svc<{ id: string }>(`INSERT INTO posts(${keys.join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING id`, Object.values(cols))
    return r.rows[0].id
  }

  it('server creates plans (organiser seated); clients cannot insert posts directly', async () => {
    planId = await newPlan(organiser, { title: 'Spiti in January' })
    const m = await db.query<{ role: string; state: string }>('SELECT role, state FROM plan_members WHERE post_id = $1', [planId])
    expect(m.rows).toEqual([{ role: 'organiser', state: 'approved' }])
    await expect(as(organiser, `INSERT INTO posts(kind, author_id, body, status) VALUES ('ask', $1, 'pay me ₹5000/person', 'live')`, [organiser]))
      .rejects.toThrow(/row-level security/)
  })

  it('requires an intro, forces a fresh 72h window, and notifies the organiser', async () => {
    await expect(as(joiner, `INSERT INTO plan_members(post_id, user_id, intro) VALUES ($1, $2, 'hey')`, [planId, joiner]))
      .rejects.toThrow(/row-level security/)
    await as(joiner, `INSERT INTO plan_members(post_id, user_id, intro, expires_at) VALUES ($1, $2, 'Did Hampta last year, flexible on dates', NULL)`, [planId, joiner])
    const r = await one(db.query<{ ok: boolean }>(`SELECT expires_at > now() + interval '71 hours' AS ok FROM plan_members WHERE post_id = $1 AND user_id = $2`, [planId, joiner]))
    expect(r.ok).toBe(true)
    const n = await db.query<{ type: string }>(`SELECT type FROM notifications WHERE user_id = $1`, [organiser])
    expect(n.rows.map((x) => x.type)).toContain('tribe_join_request')
  })

  it('stops the organiser re-targeting a membership row onto someone else', async () => {
    await as(organiser, `UPDATE plan_members SET user_id = $3, state = 'approved' WHERE post_id = $1 AND user_id = $2`, [planId, joiner, stranger])
    const rows = await db.query<{ user_id: string }>(`SELECT user_id FROM plan_members WHERE post_id = $1`, [planId])
    expect(rows.rows.map((x) => x.user_id)).not.toContain(stranger)
    // identity is pinned, so this only approved the original request (the organiser's right)
    const j = await one(db.query<{ state: string }>(`SELECT state FROM plan_members WHERE post_id = $1 AND user_id = $2`, [planId, joiner]))
    expect(j.state).toBe('approved')
    const room = await one(db.query<{ n: number }>(`SELECT count(*)::int n FROM chat_room_members m JOIN chat_rooms r ON r.id = m.room_id WHERE r.post_id = $1`, [planId]))
    expect(room.n).toBe(2)
  })

  it('lets a requester only withdraw, and refuses approving expired requests', async () => {
    const p = await newPlan(organiser)
    await as(manVerified, `INSERT INTO plan_members(post_id, user_id, intro) VALUES ($1, $2, 'Happy to share driving, done Spiti twice')`, [p, manVerified])
    await expect(as(manVerified, `UPDATE plan_members SET state = 'approved' WHERE post_id = $1 AND user_id = $2`, [p, manVerified])).rejects.toThrow(/only withdraw/)
    await svc(`UPDATE plan_members SET expires_at = now() - interval '1 minute' WHERE post_id = $1 AND user_id = $2`, [p, manVerified])
    await expect(as(organiser, `UPDATE plan_members SET state = 'approved' WHERE post_id = $1 AND user_id = $2`, [p, manVerified])).rejects.toThrow(/expired/)
  })

  it('women-only: hidden from men in RLS (not just the feed), and verified gender is locked', async () => {
    const w = await newPlan(woman, { audience: 'women', place_name: 'Gokarna', place_slug: 'gokarna', spots_total: 3 })
    expect((await as(manVerified, `SELECT id FROM posts WHERE id = $1`, [w])).rows).toHaveLength(0)
    expect((await as(null, `SELECT id FROM posts WHERE id = $1`, [w])).rows).toHaveLength(0)
    expect((await as(manVerified, `SELECT user_id FROM plan_members WHERE post_id = $1`, [w])).rows).toHaveLength(0)
    expect((await as(woman, `SELECT id FROM posts WHERE id = $1`, [w])).rows).toHaveLength(1)
    await expect(as(manVerified, `UPDATE profile_private SET gender = 'woman' WHERE user_id = $1`, [manVerified])).rejects.toThrow(/verified ID/)
    // an unverified person may set it, but is still refused at approval (ID verification required)
    await as(joiner, `INSERT INTO profile_private(user_id, gender) VALUES ($1, 'woman')`, [joiner])
    await as(joiner, `INSERT INTO plan_members(post_id, user_id, intro) VALUES ($1, $2, 'Would love to join this weekend')`, [w, joiner])
    await expect(as(woman, `UPDATE plan_members SET state = 'approved' WHERE post_id = $1 AND user_id = $2`, [w, joiner])).rejects.toThrow(/ID-verified/)
    await svc(`DELETE FROM profile_private WHERE user_id = $1`, [joiner])
  })

  it('keeps meeting points and private profile fields away from everyone else', async () => {
    await svc(`INSERT INTO plan_private(post_id, meeting_point) VALUES ($1, 'ISBT gate 3, 6am')`, [planId])
    expect((await as(null, `SELECT meeting_point FROM plan_private`)).rows).toHaveLength(0)
    expect((await as(stranger, `SELECT meeting_point FROM plan_private`)).rows).toHaveLength(0)
    expect((await as(joiner, `SELECT meeting_point FROM plan_private WHERE post_id = $1`, [planId])).rows).toHaveLength(1)
    await expect(as(null, `SELECT meeting_point FROM posts`)).rejects.toThrow(/does not exist/)
    expect((await as(stranger, `SELECT gender, home_lat FROM profile_private`)).rows).toHaveLength(0)
    expect((await as(moderator, `SELECT gender FROM profile_private`)).rows.length).toBeGreaterThan(0)
  })

  it('keeps replies one level deep; authors cannot un-hide, move or re-parent comments', async () => {
    const c = await one(svc<{ id: string }>(`INSERT INTO post_comments(post_id, author_id, body) VALUES ($1, $2, 'Which pass?') RETURNING id`, [planId, joiner]))
    const r = await one(svc<{ id: string }>(`INSERT INTO post_comments(post_id, parent_id, author_id, body) VALUES ($1, $2, $3, 'Kunzum') RETURNING id`, [planId, c.id, organiser]))
    await expect(svc(`INSERT INTO post_comments(post_id, parent_id, author_id, body) VALUES ($1, $2, $3, 'nested')`, [planId, r.id, joiner])).rejects.toThrow(/one level/)
    await svc(`UPDATE post_comments SET status = 'hidden' WHERE id = $1`, [c.id])
    const res = await as(joiner, `UPDATE post_comments SET status = 'live', post_id = $2 WHERE id = $1 RETURNING id`, [c.id, planId])
    expect(res.rows).toHaveLength(0)
    expect((await one(db.query<{ status: string }>(`SELECT status FROM post_comments WHERE id = $1`, [c.id]))).status).toBe('hidden')
    expect((await one(db.query<{ comment_count: number }>('SELECT comment_count FROM posts WHERE id = $1', [planId]))).comment_count).toBe(1)
  })

  it('maintains reaction counts and blocks reactions across a block', async () => {
    await as(joiner, `INSERT INTO post_reactions(post_id, user_id, kind) VALUES ($1, $2, 'want_to_go')`, [planId, joiner])
    expect((await one(db.query<{ reaction_counts: Record<string, number> }>('SELECT reaction_counts FROM posts WHERE id = $1', [planId]))).reaction_counts.want_to_go).toBe(1)
    await as(organiser, `INSERT INTO user_blocks(blocker_id, blocked_id) VALUES ($1, $2)`, [organiser, stranger])
    await expect(as(stranger, `INSERT INTO post_reactions(post_id, user_id, kind) VALUES ($1, $2, 'love')`, [planId, stranger])).rejects.toThrow(/row-level security/)
  })

  it('host offers: identity pinned, price must match what the organiser saw, one conversion only', async () => {
    const other = await newPlan(host)
    const o = await one(as<{ id: string }>(host, `INSERT INTO host_offers(post_id, host_id, price_paise, includes) VALUES ($1, $2, 1500000, ARRAY['Stay']) RETURNING id`, [planId, host]))
    await as(host, `UPDATE host_offers SET post_id = $2, expires_at = now() + interval '1 year' WHERE id = $1`, [o.id, other])
    const after = await one(db.query<{ post_id: string; long: boolean }>(`SELECT post_id, expires_at > now() + interval '8 days' AS long FROM host_offers WHERE id = $1`, [o.id]))
    expect(after).toEqual({ post_id: planId, long: false })
    await as(host, `UPDATE host_offers SET price_paise = 2500000 WHERE id = $1`, [o.id])
    await expect(as(organiser, `SELECT accept_host_offer($1, 1500000)`, [o.id])).rejects.toThrow(/changed this offer/)
    await expect(as(joiner, `SELECT accept_host_offer($1, 2500000)`, [o.id])).rejects.toThrow(/organiser/)
    const pkg = (await one(as<{ pkg: string }>(organiser, `SELECT accept_host_offer($1, 2500000) AS pkg`, [o.id]))).pkg
    expect((await one(db.query<{ n: number }>(`SELECT count(*)::int n FROM join_requests WHERE trip_id = $1 AND status = 'approved'`, [pkg]))).n).toBe(2)
    expect((await one(db.query<{ converted_package_id: string }>(`SELECT converted_package_id FROM posts WHERE id = $1`, [planId]))).converted_package_id).toBe(pkg)
    await expect(as(host, `INSERT INTO host_offers(post_id, host_id, price_paise) VALUES ($1, $2, 900000)`, [planId, host])).rejects.toThrow()
  })

  it('auto-hides after three reports, prioritises safety, and keeps reported posts from deletion', async () => {
    const ask = await one(svc<{ id: string }>(`INSERT INTO posts(kind, author_id, body) VALUES ('ask', $1, 'Best cafe in Kasol?') RETURNING id`, [joiner]))
    await as(woman, `INSERT INTO reports(reporter_id, target_type, target_id, reason) VALUES ($1, 'post', $2, 'harassment')`, [woman, ask.id])
    expect((await as(joiner, `DELETE FROM posts WHERE id = $1 RETURNING id`, [ask.id])).rows).toHaveLength(0)
    for (const uid of [organiser, host]) {
      await as(uid, `INSERT INTO reports(reporter_id, target_type, target_id, reason) VALUES ($1, 'post', $2, 'spam')`, [uid, ask.id])
    }
    expect((await one(db.query<{ status: string }>('SELECT status FROM posts WHERE id = $1', [ask.id]))).status).toBe('hidden')
    expect((await one(db.query<{ priority: string }>(`SELECT priority FROM reports WHERE reporter_id = $1 AND target_id = $2`, [woman, ask.id]))).priority).toBe('safety')
    expect((await as(joiner, `UPDATE posts SET status = 'live' WHERE id = $1 RETURNING id`, [ask.id])).rows).toHaveLength(0)
    const s = await one(as<{ r: { removed_posts: string[] } }>(woman, `SELECT sync_changes(now() - interval '1 hour') AS r`))
    expect(s.r.removed_posts).toContain(ask.id)
  })

  it('only lets people self-join public community rooms, not trip or plan chats', async () => {
    const planRoom = await one(db.query<{ id: string }>(`SELECT id FROM chat_rooms WHERE post_id = $1`, [planId]))
    await expect(as(stranger, `INSERT INTO chat_room_members(room_id, user_id) VALUES ($1, $2)`, [planRoom.id, stranger])).rejects.toThrow(/row-level security/)
    const general = await one(svc<{ id: string }>(`INSERT INTO chat_rooms(name, type) VALUES ('Himachal travellers', 'general') RETURNING id`))
    await as(stranger, `INSERT INTO chat_room_members(room_id, user_id) VALUES ($1, $2)`, [general.id, stranger])
  })

  it('blocks notification spoofing and lookalike links', async () => {
    await expect(as(joiner, `INSERT INTO notifications(user_id, type, title, link) VALUES ($1, 'x', 'Win', '/ok')`, [organiser])).rejects.toThrow(/row-level security/)
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', '/\t/evil.example']) {
      await expect(as(joiner, `INSERT INTO notifications(user_id, type, title, link) VALUES ($1, 'x', 'Hi', $2)`, [joiner, bad])).rejects.toThrow(/row-level security/)
    }
    await as(joiner, `INSERT INTO notifications(user_id, type, title, link) VALUES ($1, 'x', 'Saved', '/bookings')`, [joiner])
    await as(admin, `INSERT INTO notifications(user_id, type, title, link) VALUES ($1, 'system', 'Refund done', '/bookings')`, [joiner])
    await expect(as(null, `INSERT INTO notifications(user_id, type, title) VALUES ($1, 'x', 'anon')`, [joiner])).rejects.toThrow(/row-level security|permission/)
  })

  it('fixes platform_settings writes', async () => {
    expect((await as(joiner, `UPDATE platform_settings SET value = '0' WHERE key = 'tribe_enabled' RETURNING key`)).rows).toHaveLength(0)
    expect((await one(db.query<{ value: string }>(`SELECT value FROM platform_settings WHERE key = 'tribe_enabled'`))).value).toBe('true')
  })

  it('refuses DM rooms / read receipts on behalf of someone else, and DMs across a block', async () => {
    await expect(as(joiner, `SELECT get_or_create_dm_room($1, $2)`, [organiser, woman])).rejects.toThrow(/not allowed/)
    const r = await one(as<{ id: string }>(joiner, `SELECT get_or_create_dm_room($1, $2) AS id`, [joiner, host]))
    expect(r.id).toBeTruthy()
    await expect(as(joiner, `SELECT mark_room_messages_read($1, $2)`, [r.id, host])).rejects.toThrow(/not allowed/)
    await as(joiner, `INSERT INTO messages(room_id, user_id, content) VALUES ($1, $2, 'hi')`, [r.id, joiner])
    await as(host, `INSERT INTO user_blocks(blocker_id, blocked_id) VALUES ($1, $2)`, [host, joiner])
    await expect(as(joiner, `INSERT INTO messages(room_id, user_id, content) VALUES ($1, $2, 'hello?')`, [r.id, joiner])).rejects.toThrow(/row-level security/)
  })

  it('mutes stop reactions and join requests', async () => {
    await svc(`INSERT INTO user_sanctions(user_id, kind, until) VALUES ($1, 'mute', now() + interval '7 days')`, [woman])
    await expect(as(woman, `INSERT INTO post_reactions(post_id, user_id, kind) VALUES ($1, $2, 'love')`, [planId, woman])).rejects.toThrow(/row-level security/)
    const p = await newPlan(manVerified)
    await expect(as(woman, `INSERT INTO plan_members(post_id, user_id, intro) VALUES ($1, $2, 'Can I come along please?')`, [p, woman])).rejects.toThrow(/row-level security/)
    await svc(`UPDATE user_sanctions SET revoked_at = now() WHERE user_id = $1`, [woman])
  })

  it('scopes staff powers: field staff get neither moderation nor analytics', async () => {
    expect((await as(fieldPerson, `SELECT id FROM reports`)).rows).toHaveLength(0)
    await expect(as(fieldPerson, `SELECT admin_analytics_overview(30)`)).rejects.toThrow(/staff only/)
    expect((await as(moderator, `SELECT id FROM reports`)).rows.length).toBeGreaterThan(0)
    await expect(as(moderator, `SELECT admin_analytics_overview(30)`)).rejects.toThrow(/staff only/)
    const a = await one(as<{ r: { open_reports: number } }>(admin, `SELECT admin_analytics_overview(30) AS r`))
    expect(Number(a.r.open_reports)).toBeGreaterThan(0)
  })

  it('returns suggestions and a stable feed page', async () => {
    const s = await as<{ item_type: string }>(woman, `SELECT item_type FROM suggest_for_user(15.0, 74.0)`)
    expect(s.rows.length).toBeGreaterThan(0)
    const t = '2099-01-01T00:00:00Z'
    const a = await as<{ post_id: string }>(woman, `SELECT post_id FROM tribe_feed(p_as_of => $1::timestamptz)`, [t])
    const b = await as<{ post_id: string }>(woman, `SELECT post_id FROM tribe_feed(p_as_of => $1::timestamptz)`, [t])
    expect(a.rows.length).toBeGreaterThan(0)
    expect(a.rows).toEqual(b.rows)
  })

  it('expires stale requests and reports membership changes to sync', async () => {
    const p = await newPlan(organiser)
    await as(joiner, `INSERT INTO plan_members(post_id, user_id, intro) VALUES ($1, $2, 'Count me in for this one')`, [p, joiner])
    await svc(`UPDATE plan_members SET expires_at = now() - interval '1 hour' WHERE state = 'requested'`)
    const r = await one(svc<{ r: { requests_expired: number } }>(`SELECT expire_tribe_items() AS r`))
    expect(r.r.requests_expired).toBeGreaterThan(0)
    const s = await one(as<{ r: { memberships: { post_id: string; state: string }[] } }>(joiner, `SELECT sync_changes(now() - interval '1 minute') AS r`))
    expect(s.r.memberships).toContainEqual({ post_id: p, state: 'expired' })
  })
})
