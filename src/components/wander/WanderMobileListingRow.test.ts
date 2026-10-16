// @vitest-environment happy-dom
import { createElement, type ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { loadPage } = vi.hoisted(() => ({ loadPage: vi.fn() }))
vi.mock('@/actions/wander-listings', () => ({ loadMoreWanderListings: loadPage }))
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => createElement('a', { href }, children),
}))
vi.mock('@/components/wander/WanderTripCard', () => ({
  WanderTripCard: ({ pkg }: { pkg: { id: string } }) => createElement('div', null, `Trip ${pkg.id}`),
}))
vi.mock('@/components/explore/ServiceListingCard', () => ({
  ServiceListingCard: ({ listing }: { listing: { id: string } }) => createElement('div', null, `Service ${listing.id}`),
}))
import { WanderMobileListingRow } from './WanderMobileListingRow'

type Kind = 'trips' | 'stays' | 'activities' | 'rentals'
let intersect: IntersectionObserverCallback
const observe = vi.fn()
const disconnect = vi.fn()

function page(kind: Kind, ids: string[], pageNumber = 1, hasMore = false) {
  return {
    activeTab: kind, page: pageNumber, hasMore, resultCount: 40,
    packages: kind === 'trips' ? ids.map(id => ({ id })) : [],
    serviceListings: kind !== 'trips' ? ids.map(id => ({ id })) : [],
    interestCounts: {}, spotsBooked: {},
  }
}

beforeEach(() => {
  loadPage.mockReset()
  observe.mockClear()
  disconnect.mockClear()
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) { intersect = callback }
    observe = observe
    disconnect = disconnect
  })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function mount(kind: Kind = 'trips') {
  const props = {
    kind, initialIds: ['initial'], viewAllHref: `/?search=1&tab=${kind}`, viewAllLabel: `View all ${kind}`,
    children: [createElement('div', { key: 'initial' }, 'Initial listing')],
  }
  render(createElement(WanderMobileListingRow, props))
  return screen.getByRole('region', { name: `${kind} listings` })
}

function reachEnd(track: HTMLElement) {
  fireEvent.scroll(track, { target: { scrollLeft: 300 } })
  act(() => intersect([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver))
}

describe('mobile listing rows', () => {
  it('does not fetch or observe any row on initial render', () => {
    mount()
    expect(loadPage).not.toHaveBeenCalled()
    expect(observe).not.toHaveBeenCalled()
    expect(screen.getByText('Initial listing')).toBeDefined()
    expect(screen.queryByRole('link', { name: 'View all trips' })).toBeNull()
  })

  it.each(['trips', 'stays', 'activities', 'rentals'] as const)('loads %s as the user swipes near the end and deduplicates preview cards', async kind => {
    loadPage.mockResolvedValue(page(kind, ['initial', 'next']))
    const track = mount(kind)
    reachEnd(track)
    await screen.findByText(`${kind === 'trips' ? 'Trip' : 'Service'} next`)
    expect(loadPage).toHaveBeenCalledTimes(1)
    expect(loadPage).toHaveBeenCalledWith(kind, 1)
    expect(screen.queryByText(`${kind === 'trips' ? 'Trip' : 'Service'} initial`)).toBeNull()
    expect(screen.getByRole('link', { name: `View all ${kind}` }).getAttribute('href')).toBe(`/?search=1&tab=${kind}`)
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
  })

  it('continues beyond duplicate-only pages and deduplicates later pages', async () => {
    loadPage.mockResolvedValueOnce(page('trips', ['initial'], 1, true))
      .mockResolvedValueOnce(page('trips', ['second'], 2, true))
      .mockResolvedValueOnce(page('trips', ['second', 'third'], 3, false))
    const track = mount()
    reachEnd(track)
    await screen.findByText('Trip second')
    expect(loadPage).toHaveBeenNthCalledWith(2, 'trips', 2)
    act(() => intersect([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver))
    await screen.findByText('Trip third')
    expect(screen.getAllByText('Trip second')).toHaveLength(1)
    expect(loadPage).toHaveBeenNthCalledWith(3, 'trips', 3)
  })

  it('prevents overlapping requests and displays a loading status', async () => {
    let resolve!: (value: ReturnType<typeof page>) => void
    loadPage.mockImplementation(() => new Promise<ReturnType<typeof page>>(r => { resolve = r }))
    const track = mount()
    reachEnd(track)
    act(() => intersect([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver))
    expect(loadPage).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status').textContent).toContain('Loading more')
    await act(async () => resolve(page('trips', ['next'])))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows an explicit error and retries the same failed page without dropping existing cards', async () => {
    loadPage.mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(page('trips', ['next']))
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(await screen.findByRole('alert')).toBeDefined()
    expect(screen.getByText('Initial listing')).toBeDefined()
    expect(loadPage).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByText('Trip next')
    expect(loadPage).toHaveBeenNthCalledWith(2, 'trips', 1)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('supports manual loading when automatic observation is unavailable', async () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    loadPage.mockResolvedValue(page('stays', [], 1, false))
    mount('stays')
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(screen.getByText("You're all caught up")).toBeDefined())
    expect(loadPage).toHaveBeenCalledTimes(1)
    expect(loadPage).toHaveBeenCalledWith('stays', 1)
  })
})
