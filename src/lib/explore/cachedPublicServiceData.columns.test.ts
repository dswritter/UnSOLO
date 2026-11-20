import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }))
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({}) }))

/** Every column the migrations give service_listings: the CREATE TABLE plus later ALTER TABLE … ADD COLUMN. */
function serviceListingColumns(): Set<string> {
  const dir = 'supabase/migrations'
  const sql = readdirSync(dir).filter(f => f.endsWith('.sql')).sort().map(f => readFileSync(`${dir}/${f}`, 'utf8')).join('\n')
  const cols = new Set<string>()
  const create = /create table (?:if not exists )?(?:public\.)?service_listings\s*\(([\s\S]*?)\n\);/i.exec(sql)
  for (const line of create?.[1].split('\n') ?? []) {
    const m = /^\s*([a-z_]+)\s+[A-Z]/.exec(line)
    if (m) cols.add(m[1])
  }
  for (const stmt of sql.split(';')) {
    if (!/alter table (?:if exists )?(?:public\.)?service_listings\b/i.test(stmt)) continue
    for (const m of stmt.matchAll(/add column (?:if not exists )?([a-z_]+)/gi)) cols.add(m[1])
  }
  return cols
}

describe('public service listing select', () => {
  it('only reads columns that exist on service_listings', async () => {
    const { SERVICE_LISTING_PUBLIC_COLUMNS } = await import('./cachedPublicServiceData')
    const known = serviceListingColumns()
    const missing = SERVICE_LISTING_PUBLIC_COLUMNS.split(',').map(c => c.trim()).filter(c => !known.has(c))
    // A single unknown column makes PostgREST reject the query, which emptied every service search page.
    expect(missing).toEqual([])
  })
})
