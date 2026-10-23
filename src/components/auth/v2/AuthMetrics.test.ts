import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ metrics: vi.fn() }))
vi.mock('@/lib/wander/wanderQueries', () => ({ getAuthHeroMetrics: mocks.metrics }))
import { AuthMetrics, authMetricItems } from './AuthMetrics'

const metrics = { travellers: 1250, hosts: 24, rating: 4.86, reviewCount: 7, happyPercent: 98 }

beforeEach(() => vi.clearAllMocks())

describe('auth metrics', () => {
  it('shows travellers, hosts, rating and happiness in one row', () => {
    expect(authMetricItems(metrics).map(({ value, label }) => [value, label])).toEqual([
      ['1.3K+', 'Travellers'], ['24+', 'Hosts'], ['4.9', '7 reviews'], ['98%', 'Happy'],
    ])
  })
  it('hides unavailable values instead of advertising zeros or a default rating', () => {
    expect(authMetricItems({ travellers: 0, hosts: 3, rating: null, reviewCount: 0, happyPercent: 0 })
      .map(item => item.id)).toEqual(['hosts'])
  })
  it('renders nothing when metrics fail, leaving sign-in usable', async () => {
    mocks.metrics.mockRejectedValue(new Error('offline'))
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(await AuthMetrics({})).toBeNull()
    } finally { errorLog.mockRestore() }
  })
  it('renders loaded metrics as an accessible list', async () => {
    mocks.metrics.mockResolvedValue(metrics)
    const html = renderToStaticMarkup((await AuthMetrics({}))!)
    expect(html).toContain('aria-label="Unsolo community"')
    expect(html).toContain('Hosts')
  })
})
