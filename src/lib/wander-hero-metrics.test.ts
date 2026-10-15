import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const migration = readFileSync('supabase/migrations/108_wander_hero_metrics.sql', 'utf8')

describe('wander hero metrics aggregate RPC', () => {
  let db: PGlite
  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE profiles(id uuid PRIMARY KEY);
      CREATE TABLE packages(id uuid PRIMARY KEY, destination_id uuid, host_id uuid, is_active boolean);
      CREATE TABLE service_listings(id uuid PRIMARY KEY, destination_id uuid, destination_ids uuid[], host_id uuid,
        is_active boolean, status text, first_approved_at timestamptz);
      CREATE TABLE bookings(id uuid PRIMARY KEY, status text);
      CREATE TABLE reviews(id uuid PRIMARY KEY, user_id uuid, rating integer, created_at timestamptz DEFAULT now());
      CREATE TABLE host_reviews(id uuid PRIMARY KEY, reviewer_id uuid NOT NULL, rating integer, created_at timestamptz DEFAULT now());
    `)
    await db.exec(migration)
  }, 30000)
  afterAll(async () => { await db?.close() })
  beforeEach(async () => { await db.exec('TRUNCATE profiles, packages, service_listings, bookings, reviews, host_reviews CASCADE') })

  it('aggregates counts and ratings in SQL without counting inactive/unapproved destinations', async () => {
    await db.exec(`
      INSERT INTO profiles VALUES ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');
      INSERT INTO packages VALUES
        ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',true),
        ('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002',NULL,true),
        ('10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001',false);
      INSERT INTO service_listings VALUES
        ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002',
          ARRAY['20000000-0000-0000-0000-000000000002'::uuid,'20000000-0000-0000-0000-000000000003'::uuid],
          '00000000-0000-0000-0000-000000000002',true,'approved',NULL),
        ('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000004',
          ARRAY['20000000-0000-0000-0000-000000000004'::uuid],
          '00000000-0000-0000-0000-000000000002',true,'pending',now()),
        ('30000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000005',
          ARRAY['20000000-0000-0000-0000-000000000005'::uuid],
          '00000000-0000-0000-0000-000000000002',true,'pending',NULL);
      INSERT INTO bookings VALUES ('40000000-0000-0000-0000-000000000001','confirmed'),
        ('40000000-0000-0000-0000-000000000002','cancelled'), ('40000000-0000-0000-0000-000000000003','pending');
      INSERT INTO reviews(id,rating) VALUES ('50000000-0000-0000-0000-000000000001',5), ('50000000-0000-0000-0000-000000000002',2);
      INSERT INTO host_reviews(id,reviewer_id,rating) VALUES
        ('60000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',4),
        ('60000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002',NULL);
    `)
    const { rows } = await db.query(`SELECT * FROM public.get_wander_hero_metrics()`)
    expect(rows[0]).toMatchObject({ solo_travelers: 2, destinations: 4, bookings: 2, overall_rating: '3.7', review_count: 4 })
    expect(Number(rows[0].happy_percent)).toBe(50)
  })

  it('returns empty-table defaults matching the hero UI fallbacks', async () => {
    const { rows } = await db.query(`SELECT * FROM public.get_wander_hero_metrics()`)
    expect(rows[0]).toEqual({ solo_travelers: 0, destinations: 0, bookings: 0, happy_percent: '0', overall_rating: null, review_count: 0 })
  })

  it('allows only the trusted service role to call the aggregate', async () => {
    await db.exec('SET ROLE authenticated')
    try {
      await expect(db.query('SELECT * FROM public.get_wander_hero_metrics()')).rejects.toThrow('permission denied')
    } finally { await db.exec('RESET ROLE') }
    await db.exec('SET ROLE service_role')
    try {
      const { rows } = await db.query('SELECT * FROM public.get_wander_hero_metrics()')
      expect(rows).toHaveLength(1)
    } finally { await db.exec('RESET ROLE') }
  })
})