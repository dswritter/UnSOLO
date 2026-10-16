import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('113: admin_search_users', () => {
  let db: PGlite
  const ids = Array.from({ length: 5 }, () => randomUUID())
  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.profiles(id uuid PRIMARY KEY, username text, full_name text, avatar_url text, phone_number text,
        is_host boolean, is_phone_verified boolean, instagram_url text, created_at timestamptz, role text);
      CREATE TABLE public.bookings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, status text);
    `)
    await db.exec(readFileSync('supabase/migrations/113_admin_search_users.sql', 'utf8'))
    await db.query(`INSERT INTO profiles VALUES
      ($1, 'asha', 'Asha Rao', NULL, '+91', true, true, 'ig', now() - interval '1 day', 'user'),
      ($2, 'ravi', NULL, NULL, NULL, false, false, NULL, now() - interval '2 day', 'user'),
      ($3, 'meera', 'Meera', NULL, NULL, false, true, '', now() - interval '3 day', 'admin'),
      ($4, 'dev', 'Dev', NULL, NULL, true, false, NULL, now() - interval '4 day', 'user'),
      ($5, 'zoe', 'Zoe 100%', NULL, NULL, false, false, NULL, now() - interval '5 day', 'user')`, ids)
    await db.query(`INSERT INTO bookings(user_id, status) VALUES ($1, 'confirmed'), ($1, 'cancelled'), ($2, 'completed'), ($3, 'pending')`, ids.slice(0, 3))
  })
  afterAll(async () => { await db?.close() })

  async function search(q: string | null, filter = 'all', limit = 50, offset = 0) {
    const { rows } = await db.query<{ r: { rows: { username: string; confirmed: number; cancelled: number }[]; total: number; counts: Record<string, number> } }>(
      'SELECT public.admin_search_users($1, $2, $3, $4) AS r', [q, filter, limit, offset])
    return rows[0].r
  }

  it('pages newest first with exact totals and per-filter counts', async () => {
    const first = await search(null, 'all', 2, 0)
    expect(first.rows.map(r => r.username)).toEqual(['asha', 'ravi'])
    expect(Number(first.total)).toBe(5)
    expect(first.counts).toEqual({ all: 5, hosts: 2, active_travelers: 2, no_phone: 3, no_instagram: 4 })
    expect((await search(null, 'all', 2, 4)).rows.map(r => r.username)).toEqual(['zoe'])
  })

  it('filters and searches server-side, treating search text literally', async () => {
    expect((await search(null, 'active_travelers')).rows.map(r => r.username)).toEqual(['asha', 'ravi'])
    expect((await search('RAO')).rows.map(r => r.username)).toEqual(['asha'])
    expect((await search('100%')).rows.map(r => r.username)).toEqual(['zoe'])
    expect((await search('%')).rows.map(r => r.username)).toEqual(['zoe'])
    const asha = (await search('asha')).rows[0]
    expect([asha.confirmed, asha.cancelled]).toEqual([1, 1])
  })
})
