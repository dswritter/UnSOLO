import { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const migration = readFileSync('supabase/migrations/109_explore_pagination_metadata_search.sql', 'utf8')

describe('metadata-indexed Explore pagination RPC', () => {
  let db: PGlite
  const destinationId = randomUUID()
  const hostId = randomUUID()
  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      GRANT USAGE ON SCHEMA auth TO anon, authenticated;
      GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
      CREATE TABLE profiles(id uuid PRIMARY KEY, username text, full_name text, avatar_url text, bio text, host_rating numeric, is_verified boolean, total_hosted_trips integer);
      CREATE TABLE destinations(id uuid PRIMARY KEY, name text, state text, country text, slug text);
      CREATE TABLE packages(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), destination_id uuid REFERENCES destinations(id), title text NOT NULL, slug text NOT NULL UNIQUE,
        description text NOT NULL, short_description text, price_paise integer NOT NULL, duration_days integer NOT NULL,
        difficulty text, includes text[], images text[], is_featured boolean DEFAULT false, is_active boolean DEFAULT true,
        host_id uuid REFERENCES profiles(id), created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), moderation_status text,
        departure_dates date[], departure_dates_closed date[], join_preferences jsonb
      );
      CREATE TABLE package_interests(id uuid DEFAULT gen_random_uuid(), package_id uuid REFERENCES packages(id), user_id uuid);
      ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
      CREATE POLICY packages_public ON packages FOR SELECT USING (true);
      ALTER TABLE package_interests ENABLE ROW LEVEL SECURITY;
      CREATE POLICY interests_public ON package_interests FOR SELECT USING (true);
      CREATE TABLE service_listings(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, short_description text, description text, location text,
        tags text[], amenities text[], metadata jsonb, destination_id uuid, destination_ids uuid[], host_id uuid,
        status text, first_approved_at timestamptz, is_active boolean DEFAULT true
      );
      CREATE TABLE bookings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), package_id uuid, user_id uuid, guests integer, status text);
      ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
      CREATE POLICY bookings_select_own ON bookings FOR SELECT USING (auth.uid() = user_id);
      CREATE TABLE reviews(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), package_id uuid, rating integer);
      CREATE TABLE host_reviews(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), rating integer);
      CREATE FUNCTION public.test_packages_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;
      CREATE TRIGGER packages_updated_at BEFORE UPDATE ON packages FOR EACH ROW EXECUTE FUNCTION public.test_packages_updated_at();
      GRANT SELECT ON packages, package_interests, destinations, profiles, bookings TO anon, authenticated;
    `)
    const oldId = randomUUID()
    const oldUpdatedAt = new Date('2025-01-02T03:04:05Z')
    await db.query('INSERT INTO packages(id,title,slug,description,price_paise,duration_days,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [oldId, 'Existing metadata trip', `old-${oldId}`, 'Preserve the imported row', 10000, 2, oldUpdatedAt])
    await db.exec(migration)
    const oldRow = await db.query<{ updated_at: Date; search_document: unknown }>('SELECT updated_at, search_document FROM packages WHERE id=$1', [oldId])
    expect(oldRow.rows[0].updated_at).toEqual(oldUpdatedAt)
    expect(oldRow.rows[0].search_document).toBeTruthy()
  }, 30000)
  afterAll(async () => { await db?.close() })
  beforeEach(async () => {
    await db.exec('RESET ROLE; TRUNCATE packages, package_interests, service_listings, destinations, profiles CASCADE')
    await db.query('INSERT INTO destinations(id,name,state,country,slug) VALUES ($1,$2,$3,$4,$5)', [destinationId, 'Hidden Valley', 'Sikkim', 'India', 'hidden-valley'])
    await db.query('INSERT INTO profiles(id,username,full_name) VALUES ($1,$2,$3)', [hostId, 'host', 'Host'])
  })

  async function addTrip(index: number, options: { metadata?: unknown; departure?: string; isFeatured?: boolean } = {}) {
    const id = randomUUID()
    await db.query(`INSERT INTO packages(id,destination_id,title,slug,description,short_description,price_paise,duration_days,difficulty,includes,images,is_featured,is_active,host_id,created_at,metadata,departure_dates,departure_dates_closed)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,$13,now() - ($14::text || ' seconds')::interval,$15::jsonb,$16::date[],'{}'::date[])`, [
      id, destinationId, `Sikkim trip ${index}`, `sikkim-${index}`, 'A guided mountain journey', 'Explore nature', 100000, 3, 'moderate', [], [], options.isFeatured ?? false, hostId, index,
      JSON.stringify(options.metadata ?? {}), options.departure ? [options.departure] : null,
    ])
    return id
  }
  async function search(query: string | null, page = 1, pageSize = 24, options: { month?: number; interested?: boolean } = {}) {
    const { rows } = await db.query<{ listing: { id: string; metadata: unknown; destination: { name: string } } | null; total_count: number }>(
      'SELECT * FROM public.search_explore_packages_page($1,NULL,NULL,NULL,NULL,NULL,NULL,$2,$3,$4,$5)',
      [query, options.month ?? null, options.interested ?? false, page, pageSize],
    )
    return rows
  }

  it('returns later pages beyond the former 200-row cap with stable ordering and exact totals', async () => {
    for (let i = 0; i < 235; i++) await addTrip(i)
    const first = await search(null, 1, 24)
    const later = await search(null, 10, 24)
    expect(first).toHaveLength(24)
    expect(later).toHaveLength(19)
    expect(first[0].total_count).toBe(235)
    expect(later[0].total_count).toBe(235)
    expect(new Set([...first, ...later].map(row => row.listing?.id)).size).toBe(43)
    expect(later.every(row => row.listing?.id)).toBe(true)
  })
  it('preserves featured, public popularity, and recency order across page boundaries', async () => {
    const newest = await addTrip(0)
    const popular = await addTrip(10)
    const featured = await addTrip(20, { isFeatured: true })
    const searchUser = randomUUID()
    await db.query('INSERT INTO package_interests(package_id,user_id) VALUES ($1,$2),($1,$3)', [popular, hostId, searchUser])
    await db.query("INSERT INTO bookings(package_id,user_id,guests,status) VALUES ($1,$2,9,'confirmed')", [newest, searchUser])
    const first = await search(null, 1, 1)
    const second = await search(null, 2, 1)
    const third = await search(null, 3, 1)
    expect([first[0].listing?.id, second[0].listing?.id, third[0].listing?.id]).toEqual([featured, popular, newest])
  })
  it('aggregates home-preview reviews, bookings, and interests into one compact metrics row', async () => {
    const first = await addTrip(1)
    const second = await addTrip(2)
    await db.query('INSERT INTO reviews(package_id,rating) VALUES ($1,5),($1,3),($2,4)', [first, second])
    await db.query("INSERT INTO bookings(package_id,guests,status) VALUES ($1,2,'confirmed'),($1,1,'completed'),($2,4,'pending')", [first, second])
    const secondUser = randomUUID()
    await db.query('INSERT INTO package_interests(package_id,user_id) VALUES ($1,$2),($1,$3),($4,$3)', [first, hostId, secondUser, second])
    const { rows } = await db.query<{ package_id: string; average_rating: string; review_count: number; booked_guests: number; interest_count: number }>(
      'SELECT * FROM public.get_wander_trip_candidate_metrics($1::uuid[])', [[first, second]])
    const metrics = new Map(rows.map(row => [row.package_id, row]))
    expect(metrics.get(first)).toEqual({ package_id: first, average_rating: '4.0', review_count: 2, booked_guests: 3, interest_count: 2 })
    expect(metrics.get(second)).toEqual({ package_id: second, average_rating: '4.0', review_count: 1, booked_guests: 0, interest_count: 1 })
  })
  it('finds terms stored only in JSONB metadata and joined destination fields before paging', async () => {
    const matching = await addTrip(1, { metadata: { season: 'monsoon', group_size: 'small', activities: ['bird watching', 'waterfall'] } })
    await addTrip(2, { metadata: { season: 'winter' } })
    expect(await search('bird watching')).toMatchObject([{ listing: { id: matching }, total_count: 1 }])
    expect(await search('Hidden Valley')).toMatchObject([
      { listing: { id: matching, destination: { name: 'Hidden Valley' } }, total_count: 2 },
      { listing: { destination: { name: 'Hidden Valley' } }, total_count: 2 },
    ])
  })
  it('indexes service tags, amenities, and structured metadata for full-text search', async () => {
    const id = randomUUID()
    await db.query(`INSERT INTO service_listings(id,title,short_description,description,location,tags,amenities,metadata,is_active)
      VALUES ($1,'Hillside rental','Bike hire','Electric scooter for mountain roads','Gangtok',ARRAY['adventure'],ARRAY['helmet'],
        '{"vehicle_type":"electric scooter","range_km":80}'::jsonb,true)`, [id])
    const { rows } = await db.query('SELECT id FROM service_listings WHERE search_document @@ websearch_to_tsquery($1::regconfig,$2)', ['simple', 'electric scooter'])
    expect(rows).toEqual([{ id }])
  })
  it('refreshes trip and service search documents when metadata changes', async () => {
    const trip = await addTrip(1)
    const service = randomUUID()
    await db.query(`INSERT INTO service_listings(id,title,short_description,description,location,tags,amenities,metadata,is_active)
      VALUES ($1,'Rental','Short','Details','Ladakh','{}','{}','{}',true)`, [service])
    expect(await search('glacier equipment')).toMatchObject([{ listing: null, total_count: 0 }])
    await db.query('UPDATE packages SET metadata=$2::jsonb WHERE id=$1', [trip, JSON.stringify({ search_keywords: ['glacier'] })])
    await db.query("UPDATE service_listings SET tags=ARRAY['equipment'] WHERE id=$1", [service])
    expect(await search('glacier')).toMatchObject([{ listing: { id: trip } }])
    const services = await db.query<{ id: string }>("SELECT id FROM service_listings WHERE search_document @@ websearch_to_tsquery('simple','equipment')")
    expect(services.rows).toEqual([{ id: service }])
  })
  it('applies departure month and caller-owned interests before exact counts and pagination', async () => {
    const inMonth = await addTrip(1, { departure: '2027-05-10' })
    await addTrip(2, { departure: '2027-06-10' })
    await db.query('INSERT INTO package_interests(package_id,user_id) VALUES ($1,$2)', [inMonth, hostId])
    await db.exec(`SET request.jwt.claim.sub = '${hostId}'`)
    expect(await search(null, 1, 10, { month: 4, interested: true })).toMatchObject([{ listing: { id: inMonth }, total_count: 1 }])
    expect(await search(null, 1, 10, { month: 5, interested: true })).toMatchObject([{ listing: null, total_count: 0 }])
  })
  it('keeps the RPC public-safe and bounded to 48 rows per page', async () => {
    for (let i = 0; i < 60; i++) await addTrip(i)
    expect(await search(null, 1, 100)).toHaveLength(48)
    await db.exec('SET ROLE anon')
    try { expect(await search(null, 1, 4)).toHaveLength(4) } finally { await db.exec('RESET ROLE') }
  })

  it('111: treats staff-created trips without a linked host as community trips', async () => {
    const m111 = readFileSync('supabase/migrations/111_unlinked_host_display.sql', 'utf8')
    const start = m111.indexOf('CREATE OR REPLACE FUNCTION public.search_explore_packages_page(')
    await db.exec('ALTER TABLE packages ADD COLUMN IF NOT EXISTS created_on_behalf_by uuid')
    await db.exec(m111.slice(start, m111.indexOf('$$;', m111.indexOf('AS $$', start) + 5) + 3))
    const hosted = await addTrip(1)
    const unlinked = await addTrip(2)
    const own = await addTrip(3)
    await db.query('UPDATE packages SET host_id = NULL, created_on_behalf_by = $1 WHERE id = $2', [hostId, unlinked])
    await db.query('UPDATE packages SET host_id = NULL WHERE id = $1', [own])
    const ids = async (source: string) => (await db.query<{ listing: { id: string } }>(
      'SELECT * FROM public.search_explore_packages_page(NULL,$1)', [source])).rows.map(r => r.listing.id).sort()
    expect(await ids('community')).toEqual([hosted, unlinked].sort())
    expect(await ids('unsolo')).toEqual([own])
  })
})
