import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('112: admin_revenue_breakdown', () => {
  let db: PGlite
  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.profiles(id uuid PRIMARY KEY, username text, full_name text);
      CREATE TABLE public.packages(id uuid PRIMARY KEY, title text, slug text);
      CREATE TABLE public.bookings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, package_id uuid,
        status text, deposit_paise integer, total_amount_paise integer, refund_amount_paise integer, cancellation_status text);
    `)
    await db.exec(readFileSync('supabase/migrations/112_admin_revenue_breakdown.sql', 'utf8'))
  })
  afterAll(async () => { await db?.close() })

  it('matches the page semantics: deposit-or-total collected, approved refunds, top spenders', async () => {
    const [u1, u2, p1, p2] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()]
    await db.query(`INSERT INTO profiles VALUES ($1, 'asha', 'Asha'), ($2, 'ravi', NULL)`, [u1, u2])
    await db.query(`INSERT INTO packages VALUES ($1, 'Kuari', 'kuari'), ($2, 'Sama', 'sama')`, [p1, p2])
    await db.query(`INSERT INTO bookings(user_id, package_id, status, deposit_paise, total_amount_paise, refund_amount_paise, cancellation_status) VALUES
      ($1, $3, 'confirmed', 2000, 10000, 0, NULL),
      ($1, $3, 'completed', 0, 5000, 1000, 'approved'),
      ($2, $4, 'confirmed', NULL, 3000, 500, 'requested'),
      ($2, $4, 'pending', 9000, 9000, 0, NULL),
      ($2, NULL, 'confirmed', 0, 700, 0, NULL)`, [u1, u2, p1, p2])

    const { rows } = await db.query<{ r: { gross: number; refunds: number; packages: unknown[]; users: unknown[] } }>(
      'SELECT public.admin_revenue_breakdown(20) AS r')
    const r = rows[0].r
    expect(Number(r.gross)).toBe(2000 + 5000 + 3000 + 700)
    expect(Number(r.refunds)).toBe(1000)
    expect(r.packages).toEqual([
      { title: 'Kuari', slug: 'kuari', revenue: 6000, bookings: 2 },
      { title: 'Sama', slug: 'sama', revenue: 3000, bookings: 1 },
    ])
    expect(r.users).toEqual([
      { username: 'asha', name: 'Asha', spent: 7000, bookings: 2 },
      { username: 'ravi', name: 'ravi', spent: 3700, bookings: 2 },
    ])
  })
})
