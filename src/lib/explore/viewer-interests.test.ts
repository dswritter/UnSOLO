import { beforeEach, describe, expect, it, vi } from 'vitest'

const query = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: (_col: string, userId: string) => ({ limit: () => query(userId) }),
      }),
    }),
  }),
}))

import {
  loadViewerInterestedPackageIds,
  rememberViewerInterest,
  resetViewerInterestsForTests,
} from '@/lib/explore/viewer-interests'

describe('viewer interests', () => {
  beforeEach(() => {
    resetViewerInterestsForTests()
    query.mockReset()
  })

  it('runs one query per user no matter how many cards ask', async () => {
    query.mockResolvedValue({ data: [{ package_id: 'p1' }, { package_id: 'p2' }], error: null })
    const [a, b] = await Promise.all([loadViewerInterestedPackageIds('u1'), loadViewerInterestedPackageIds('u1')])
    expect(query).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
    expect([...a]).toEqual(['p1', 'p2'])
  })

  it('keeps the shared set in sync after a toggle', async () => {
    query.mockResolvedValue({ data: [{ package_id: 'p1' }], error: null })
    await loadViewerInterestedPackageIds('u1')
    rememberViewerInterest('u1', 'p2', true)
    rememberViewerInterest('u1', 'p1', false)
    await Promise.resolve()
    const ids = await loadViewerInterestedPackageIds('u1')
    expect([...ids]).toEqual(['p2'])
  })

  it('retries after a failed load instead of caching the failure', async () => {
    query.mockResolvedValueOnce({ data: null, error: new Error('offline') })
    await expect(loadViewerInterestedPackageIds('u1')).rejects.toThrow('offline')
    query.mockResolvedValueOnce({ data: [{ package_id: 'p3' }], error: null })
    expect([...(await loadViewerInterestedPackageIds('u1'))]).toEqual(['p3'])
  })
})
