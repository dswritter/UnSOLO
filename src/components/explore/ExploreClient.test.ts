// @vitest-environment happy-dom
import { createElement } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Package } from '@/types'
import type { ServiceListingWithItems } from '@/lib/explore/explorePageData'

const { loadPage, router, params } = vi.hoisted(() => ({
  loadPage: vi.fn(),
  router: { push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() },
  params: { search: '1', tab: 'trips' },
}))
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(params),
}))
vi.mock('@/actions/explore-listings', () => ({ loadMoreExploreListings: loadPage }))
vi.mock('@/actions/booking', () => ({ toggleInterest: vi.fn() }))
vi.mock('@/components/layout/AuthProvider', () => ({ useAuth: () => ({ userId: null }) }))
vi.mock('./ExploreSidebar', () => ({ ExploreSidebar: () => null }))
vi.mock('./FilterDrawer', () => ({ FilterDrawer: () => null }))
vi.mock('./SearchDrawer', () => ({ SearchDrawer: () => null }))
vi.mock('./MobileExploreActionBar', () => ({
  MobileExploreActionBar: () => createElement('button', null, 'Search'),
}))
vi.mock('./ExploreTripPackageCard', () => ({
  ExploreTripPackageCard: ({ pkg }: { pkg: Package }) => createElement('article', null, pkg.title),
}))
vi.mock('./ServiceListingCard', () => ({
  ServiceListingCard: ({ listing }: { listing: { title: string } }) => createElement('article', null, listing.title),
}))
import { ExploreClient } from './ExploreClient'

let intersect: IntersectionObserverCallback
const observe = vi.fn()
const disconnect = vi.fn()
const trips = (start: number, count: number) => Array.from({ length: count }, (_, index) => ({
  id: `trip-${start + index}`, title: `Trip ${start + index}`, price_paise: 10000,
  departure_dates: null, duration_days: 2,
} as Package))

function page(start: number, hasMore = false) {
  return {
    packages: trips(start, 20), serviceListings: [], page: 2, resultCount: 40,
    hasMore, interestCounts: {}, spotsBooked: {}, interestedPackageIds: [],
  }
}

function mount(hasMore = true) {
  return render(createElement(ExploreClient, {
    packages: trips(1, 20), serviceListings: [], params, resultCount: 40,
    page: 1, hasMore, activeTab: 'trips', pageVariant: 'wander',
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) { intersect = callback }
    observe = observe
    disconnect = disconnect
  })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('progressive Explore results', () => {
  it('renders only the initial batch and keeps mobile search in the bottom action bar', () => {
    const { container } = mount()
    expect(screen.getAllByRole('article')).toHaveLength(20)
    expect(loadPage).not.toHaveBeenCalled()
    expect(container.querySelector('#explore-results-search-mobile')).toBeNull()
    expect(container.querySelector('#explore-results-search')?.closest('[data-explore-desktop-toolbar]')?.className).toContain('hidden')
    expect(screen.getByRole('button', { name: 'Search' })).toBeDefined()
    expect(container.querySelector('[data-explore-mobile-tabs]')?.className).toContain('sticky')
    expect(container.querySelector('[data-explore-desktop-toolbar]')?.className).toContain('sticky!')
  })

  it('appends the next batch at the bottom without duplicating cards or requesting concurrently', async () => {
    let resolve!: (value: ReturnType<typeof page>) => void
    loadPage.mockImplementation(() => new Promise<ReturnType<typeof page>>(r => { resolve = r }))
    mount()
    act(() => {
      intersect([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
      intersect([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
    })
    expect(loadPage).toHaveBeenCalledTimes(1)
    expect(loadPage).toHaveBeenCalledWith(params, 2)
    expect(screen.getAllByRole('article')).toHaveLength(20)
    await act(async () => resolve(page(21)))
    expect(screen.getAllByRole('article')).toHaveLength(40)
    expect(screen.getAllByText('Trip 1')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
  })

  it('keeps existing results on failure and retries the failed page manually', async () => {
    loadPage.mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValueOnce(page(21))
    mount()
    act(() => intersect([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver))
    expect((await screen.findByRole('alert')).textContent).toBe('Connection lost')
    expect(screen.getAllByRole('article')).toHaveLength(20)
    expect(loadPage).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(40))
    expect(loadPage).toHaveBeenNthCalledWith(2, params, 2)
  })

  it('does not observe a finished list and offers manual loading without observer support', async () => {
    mount(false)
    expect(observe).not.toHaveBeenCalled()
    cleanup()
    vi.stubGlobal('IntersectionObserver', undefined)
    loadPage.mockResolvedValueOnce(page(21))
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(40))
  })

  it.each(['stays', 'activities', 'rentals'] as const)('progressively appends %s in batches of 20', async kind => {
    const services = (start: number) => Array.from({ length: 20 }, (_, index) => ({
      id: `${kind}-${start + index}`, title: `Listing ${start + index}`, type: kind,
      price_paise: 10000, items: [],
    } as ServiceListingWithItems))
    const filters = { search: '1', tab: kind }
    loadPage.mockResolvedValue({
      ...page(21), packages: [], serviceListings: services(21),
    })
    render(createElement(ExploreClient, {
      packages: [], serviceListings: services(1), params: filters,
      resultCount: 40, page: 1, hasMore: true, activeTab: kind, pageVariant: 'wander',
    }))
    expect(screen.getAllByRole('article')).toHaveLength(20)
    act(() => intersect([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver))
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(40))
    expect(loadPage).toHaveBeenCalledWith(filters, 2)
  })
})
