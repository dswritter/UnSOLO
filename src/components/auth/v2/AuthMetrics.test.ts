// @vitest-environment happy-dom
import { createElement } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthMetrics, authMetricItems } from './AuthMetrics'
import {
  AUTH_METRICS_MAX_AGE_MS, AUTH_METRICS_SESSION_KEY, AUTH_METRICS_STORAGE_KEY, needsAuthMetricsRefresh,
} from '@/lib/auth-metrics-cache'

const metrics = { travellers: 1250, hosts: 24, rating: 4.86, reviewCount: 7, happyPercent: 98 }
const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('localStorage', window.localStorage ?? window.sessionStorage)
  localStorage.clear()
  sessionStorage.clear()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

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

  it('refreshes only on reload, a new browser session, or after a day', () => {
    const cached = { savedAt: 1_000, metrics }
    const base = { cached, now: 2_000, sessionSeen: true, reload: false }
    expect(needsAuthMetricsRefresh(base)).toBe(false)
    expect(needsAuthMetricsRefresh({ ...base, cached: null })).toBe(true)
    expect(needsAuthMetricsRefresh({ ...base, reload: true })).toBe(true)
    expect(needsAuthMetricsRefresh({ ...base, sessionSeen: false })).toBe(true)
    expect(needsAuthMetricsRefresh({ ...base, now: 1_000 + AUTH_METRICS_MAX_AGE_MS })).toBe(true)
  })

  it('renders cached metrics without touching the network within a session', async () => {
    localStorage.setItem(AUTH_METRICS_STORAGE_KEY, JSON.stringify({ savedAt: Date.now(), metrics }))
    sessionStorage.setItem(AUTH_METRICS_SESSION_KEY, '1')
    render(createElement(AuthMetrics))
    expect(await screen.findByRole('list', { name: 'Unsolo community' })).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fetches and stores metrics when nothing is cached', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => metrics })
    render(createElement(AuthMetrics))
    expect(await screen.findByText('Hosts')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith('/api/auth-metrics', expect.anything())
    expect(JSON.parse(localStorage.getItem(AUTH_METRICS_STORAGE_KEY)!).metrics).toEqual(metrics)
  })

  it('removes the loading row when metrics fail and nothing is cached', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) })
    const { container } = render(createElement(AuthMetrics))
    await waitFor(() => expect(container.innerHTML).toBe(''))
  })
})
