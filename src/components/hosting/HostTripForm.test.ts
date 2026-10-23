// @vitest-environment happy-dom
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TripFormBootstrap } from '@/lib/hosting/trip-form-bootstrap'
import { emptyHostTripCreateDraftFields, upsertHostTripDraft } from '@/lib/host-trip-create-draft'

const mocks = vi.hoisted(() => ({
  host: vi.fn(), manage: vi.fn(), trip: vi.fn(), destinations: vi.fn(), includes: vi.fn(),
  cloud: vi.fn(), browserQuery: vi.fn(), push: vi.fn(),
}))
vi.mock('next/navigation', () => {
  const router = { push: mocks.push }
  return { useRouter: () => router }
})
vi.mock('@/actions/hosting', () => ({
  checkIsHost: mocks.host, canManageAnyHostTrip: mocks.manage, getHostTripDetail: mocks.trip,
  getDestinationsPublic: mocks.destinations, getIncludesOptionsPublic: mocks.includes,
  createHostedTrip: vi.fn(), updateHostedTrip: vi.fn(), createHostDestination: vi.fn(),
}))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ from: mocks.browserQuery }) }))
vi.mock('@/actions/listing-drafts', () => ({
  getMyListingDraft: mocks.cloud, saveListingDraft: vi.fn(), saveListingDraftAsStaff: vi.fn(),
  markListingDraftSubmitted: vi.fn(),
}))
vi.mock('@/components/admin/HostListingContactFields', () => ({
  HostListingContactFields: ({ onChange }: { onChange: (v: { phone: string }) => void }) =>
    createElement('button', { type: 'button', onClick: () => onChange({ phone: '9876543210' }) }, 'Pick host'),
}))
vi.mock('@/components/hosting/TripImageCropModal', () => ({ TripImageCropModal: () => null }))
vi.mock('@/components/ui/ImageUploadOverlay', () => ({ ImageUploadOverlay: () => null }))
import { HostTripForm } from './HostTripForm'

const bootstrap: TripFormBootstrap = {
  destinations: [{ id: 'destination', name: 'Manali', state: 'Himachal Pradesh' }],
  includesOptions: [], maxGroupSize: 30, platformFeePercent: 12,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', window.sessionStorage)
  localStorage.clear()
  mocks.host.mockResolvedValue({ authenticated: false, isHost: false })
  mocks.cloud.mockResolvedValue(null)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('server-bootstrapped trip forms', () => {
  it('renders the create form on the first render instead of a full-page spinner', () => {
    const html = renderToStaticMarkup(createElement(HostTripForm, { bootstrap, serverAuthorized: true }))
    expect(html).toContain('<input')
    expect(html).not.toContain('animate-spin')
    expect(mocks.host).not.toHaveBeenCalled()
  })
  it('staff see trip fields only after choosing a host', () => {
    render(createElement(HostTripForm, { bootstrap, staffCreate: true }))
    expect(screen.queryByPlaceholderText('e.g. Kasol Backpacking Adventure')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Pick host' }))
    expect(screen.getByPlaceholderText('e.g. Kasol Backpacking Adventure')).toBeTruthy()
  })
  it('does not repeat authorization, option or cloud reads for a fresh server-authorized create', async () => {
    render(createElement(HostTripForm, { bootstrap, serverAuthorized: true }))
    await waitFor(() => expect(document.querySelector('input')).not.toBeNull())
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(mocks.host).not.toHaveBeenCalled()
    expect(mocks.manage).not.toHaveBeenCalled()
    expect(mocks.destinations).not.toHaveBeenCalled()
    expect(mocks.includes).not.toHaveBeenCalled()
    expect(mocks.cloud).not.toHaveBeenCalled()
    expect(mocks.browserQuery).not.toHaveBeenCalled()
  })
  it('hydrates the authorized edit without fetching the trip again', async () => {
    render(createElement(HostTripForm, {
      bootstrap, serverAuthorized: true, editTripId: 'trip-1',
      initialTrip: { id: 'trip-1', title: 'Existing mountain trek', destination_id: 'destination' },
    }))
    await screen.findByDisplayValue('Existing mountain trek')
    expect(mocks.trip).not.toHaveBeenCalled()
    expect(mocks.host).not.toHaveBeenCalled()
    expect(mocks.manage).not.toHaveBeenCalled()
  })
  it('keeps access checks for callers without server authorization', async () => {
    render(createElement(HostTripForm, { bootstrap }))
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/login'))
    expect(mocks.host).toHaveBeenCalledOnce()
  })
  it('still checks for a newer cloud draft when resuming', async () => {
    upsertHostTripDraft('saved-draft', { ...emptyHostTripCreateDraftFields(), title: 'Saved trek' })
    render(createElement(HostTripForm, { bootstrap, serverAuthorized: true, resumeDraftId: 'saved-draft' }))
    await waitFor(() => expect(mocks.cloud).toHaveBeenCalledWith('trip', 'saved-draft'))
  })
  it('resumes the requested cloud draft when it is not stored on this device', async () => {
    mocks.cloud.mockResolvedValue({
      payload: { ...emptyHostTripCreateDraftFields(), title: 'Cloud-only trek' },
      updatedAt: new Date().toISOString(),
    })
    render(createElement(HostTripForm, { bootstrap, serverAuthorized: true, resumeDraftId: 'cloud-draft' }))
    await screen.findByDisplayValue('Cloud-only trek')
    expect(mocks.cloud).toHaveBeenCalledWith('trip', 'cloud-draft')
  })
  it('restores a saved meeting point when resuming a trip draft', async () => {
    upsertHostTripDraft('mapped-draft', {
      ...emptyHostTripCreateDraftFields(), meetingAddress: 'Manali bus station',
      meetingPoint: { lat: 32.25, lon: 77.2, label: 'Bus station' },
    })
    render(createElement(HostTripForm, { bootstrap, serverAuthorized: true, resumeDraftId: 'mapped-draft' }))
    await screen.findByDisplayValue('Manali bus station')
    expect(screen.getByRole('link', { name: /Bus station/ }).getAttribute('href')).toContain('32.25,77.2')
  })
})
