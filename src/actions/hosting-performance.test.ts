import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  resetCaches: [] as Array<() => void>,
}))
vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    cache: <T extends (...args: never[]) => unknown>(fn: T) => {
      let result: ReturnType<T> | undefined
      mocks.resetCaches.push(() => { result = undefined })
      return () => result ??= fn() as ReturnType<T>
    },
  }
})
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth/action-auth', () => ({ getActionAuth: mocks.auth }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createServiceRoleClient: vi.fn() }))

import { checkIsHost, getHostDashboardStats } from './hosting'

type Query = { table: string; filters: Array<[string, unknown]> }
type Result = { data: unknown; error: { message: string } | null; count?: number }
let queries: Query[]
let started: Query[]
let host = true
let fail: string | null
let release: () => void
let barrier: Promise<void>

function from(table: string) {
  const query: Query = { table, filters: [] }
  queries.push(query)
  const builder = {
    select: () => builder,
    eq: (key: string, value: unknown) => { query.filters.push([key, value]); return builder },
    single: async (): Promise<Result> => ({ data: { is_host: host }, error: fail === 'profiles' ? { message: 'profile unavailable' } : null }),
    then: (fulfilled: (value: Result) => unknown) => {
      started.push(query)
      return barrier.then(() => fulfilled({
        data: table === 'host_earnings' ? [
          { host_paise: 100, payout_status: 'pending' },
          { host_paise: 200, payout_status: 'paid' },
        ] : null,
        error: fail === table ? { message: 'query unavailable' } : null,
        count: table === 'packages' ? query.filters.some(([key]) => key === 'is_active') ? 2 : 3 : 4,
      }))
    },
  }
  return builder
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resetCaches.forEach(reset => reset())
  queries = []
  started = []
  host = true
  fail = null
  barrier = new Promise<void>(resolve => { release = resolve })
  mocks.auth.mockResolvedValue({ user: { id: 'host-1' }, supabase: { from } })
})

describe('hosting query scheduling', () => {
  it('starts all four stats queries before waiting for any, and reuses the request host check', async () => {
    expect(await checkIsHost()).toEqual({ authenticated: true, isHost: true })
    const result = getHostDashboardStats()
    await vi.waitFor(() => expect(started).toHaveLength(4))
    expect(queries.filter(query => query.table === 'profiles')).toHaveLength(1)
    for (const query of started) {
      expect(query.filters).toContainEqual([query.table === 'join_requests' ? 'trip.host_id' : 'host_id', 'host-1'])
    }
    release()
    expect(await result).toEqual({ totalTrips: 3, activeTrips: 2, pendingRequests: 4, totalEarned: 300, pendingPayout: 100 })
  })
  it('denies non-hosts before loading dashboard data', async () => {
    host = false
    await expect(getHostDashboardStats()).rejects.toThrow('Host verification required')
    expect(started).toHaveLength(0)
  })
  it('denies signed-out users without querying profiles', async () => {
    mocks.auth.mockResolvedValue({ user: null, supabase: { from } })
    expect(await checkIsHost()).toEqual({ authenticated: false, isHost: false })
    await expect(getHostDashboardStats()).rejects.toThrow('Not authenticated')
    expect(queries).toHaveLength(0)
  })
  it('does not reuse host access in a later request', async () => {
    await checkIsHost()
    mocks.resetCaches.forEach(reset => reset())
    host = false
    expect(await checkIsHost()).toEqual({ authenticated: true, isHost: false })
    expect(queries.filter(query => query.table === 'profiles')).toHaveLength(2)
  })
  it('surfaces stats failures rather than showing zero earnings', async () => {
    fail = 'host_earnings'
    release()
    await expect(getHostDashboardStats()).rejects.toEqual({ message: 'query unavailable' })
  })
  it('surfaces host-check database failures', async () => {
    fail = 'profiles'
    await expect(checkIsHost()).rejects.toEqual({ message: 'profile unavailable' })
  })
})
