import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  host: vi.fn(), manage: vi.fn(), trip: vi.fn(), destinations: vi.fn(), payout: vi.fn(),
  bootstrap: vi.fn(), auth: vi.fn(), draft: vi.fn(), redirect: vi.fn(), notFound: vi.fn(),
}))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound }))
vi.mock('@/actions/hosting', () => ({
  checkIsHost: mocks.host, canManageAnyHostTrip: mocks.manage,
  getHostTripDetail: mocks.trip, getDestinationsPublic: mocks.destinations,
}))
vi.mock('@/actions/payout', () => ({ hasPayoutConfigured: mocks.payout }))
vi.mock('@/actions/listing-drafts', () => ({ getMyLatestServiceDraft: mocks.draft }))
vi.mock('@/lib/auth/request-session', () => ({ getRequestAuth: mocks.auth }))
vi.mock('@/lib/hosting/trip-form-bootstrap', () => ({ getTripFormBootstrap: mocks.bootstrap }))
vi.mock('@/components/hosting/HostTripForm', () => ({ HostTripForm: () => null }))
vi.mock('@/components/hosting/HostServiceListingTabs', () => ({ HostServiceListingTabs: () => null }))
import CreateTripPage from '@/app/(main)/host/create/page'
import EditTripPage from '@/app/(main)/host/[tripId]/edit/page'
import CreateServiceListingPage from '@/app/(main)/host/create-service/page'

const bootstrap = { destinations: [], includesOptions: [], maxGroupSize: 30, platformFeePercent: 15 }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.host.mockResolvedValue({ authenticated: true, isHost: true })
  mocks.auth.mockResolvedValue({ user: { id: 'host-1' } })
  mocks.manage.mockResolvedValue(false)
  mocks.payout.mockResolvedValue(true)
  mocks.bootstrap.mockResolvedValue(bootstrap)
  mocks.trip.mockResolvedValue({ id: 'trip-1', title: 'Mountain trek' })
  mocks.destinations.mockResolvedValue([])
  mocks.draft.mockResolvedValue(null)
  mocks.redirect.mockImplementation((href: string) => { throw new Error(`redirect:${href}`) })
  mocks.notFound.mockImplementation(() => { throw new Error('not found') })
})

describe('host create and edit page loaders', () => {
  it('starts payout and option reads together, then authorizes the create form', async () => {
    let finishPayout!: (value: boolean) => void
    let finishBootstrap!: (value: typeof bootstrap) => void
    mocks.payout.mockReturnValue(new Promise(resolve => { finishPayout = resolve }))
    mocks.bootstrap.mockReturnValue(new Promise(resolve => { finishBootstrap = resolve }))
    const result = CreateTripPage({ searchParams: Promise.resolve({ draft: 'draft-1' }) })
    await vi.waitFor(() => {
      expect(mocks.payout).toHaveBeenCalledWith('host-1')
      expect(mocks.bootstrap).toHaveBeenCalledOnce()
    })
    finishPayout(true)
    finishBootstrap(bootstrap)
    expect((await result).props).toEqual({ bootstrap, serverAuthorized: true, resumeDraftId: 'draft-1' })
  })
  it('keeps the payout requirement before authorizing trip creation', async () => {
    mocks.payout.mockResolvedValue(false)
    await expect(CreateTripPage({ searchParams: Promise.resolve({}) }))
      .rejects.toThrow('redirect:/host/payout?returnTo=%2Fhost%2Fcreate')
  })
  it('rejects signed-out visitors before loading creation options', async () => {
    mocks.host.mockResolvedValue({ authenticated: false, isHost: false })
    await expect(CreateTripPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('redirect:/login')
    expect(mocks.bootstrap).not.toHaveBeenCalled()
  })
  it('passes the authorized trip into the edit form instead of requiring a client read', async () => {
    const trip = { id: 'trip-1', title: 'Mountain trek' }
    mocks.trip.mockResolvedValue(trip)
    const page = await EditTripPage({ params: Promise.resolve({ tripId: 'trip-1' }) })
    expect(mocks.trip).toHaveBeenCalledWith('trip-1')
    expect(page.props).toEqual({ bootstrap, editTripId: 'trip-1', initialTrip: trip, serverAuthorized: true })
  })
  it('preserves edit access for authorized onboarding staff who are not hosts', async () => {
    mocks.host.mockResolvedValue({ authenticated: true, isHost: false })
    mocks.manage.mockResolvedValue(true)
    expect((await EditTripPage({ params: Promise.resolve({ tripId: 'trip-1' }) })).props.serverAuthorized).toBe(true)
  })
  it('rejects an unverified non-staff editor before fetching a trip', async () => {
    mocks.host.mockResolvedValue({ authenticated: true, isHost: false })
    await expect(EditTripPage({ params: Promise.resolve({ tripId: 'trip-1' }) }))
      .rejects.toThrow('redirect:/host/verify')
    expect(mocks.trip).not.toHaveBeenCalled()
  })
  it('keeps missing or inaccessible trip details not found', async () => {
    mocks.trip.mockResolvedValue(null)
    await expect(EditTripPage({ params: Promise.resolve({ tripId: 'trip-1' }) })).rejects.toThrow('not found')
  })
  it('starts service destinations and draft reads without waiting for either', async () => {
    let finishDestinations!: (value: unknown[]) => void
    let finishDraft!: (value: null) => void
    mocks.destinations.mockReturnValue(new Promise(resolve => { finishDestinations = resolve }))
    mocks.draft.mockReturnValue(new Promise(resolve => { finishDraft = resolve }))
    const result = CreateServiceListingPage({ searchParams: Promise.resolve({ type: 'stays' }) })
    await vi.waitFor(() => {
      expect(mocks.destinations).toHaveBeenCalledOnce()
      expect(mocks.draft).toHaveBeenCalledWith('stays')
    })
    finishDestinations([])
    finishDraft(null)
    await expect(result).resolves.toBeDefined()
  })
})
