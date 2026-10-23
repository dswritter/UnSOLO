// @vitest-environment happy-dom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ staffCreate: vi.fn(), hostCreate: vi.fn(), saveDraft: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }))
vi.mock('next/dynamic', () => ({ default: () => () => null }))
vi.mock('@/actions/admin-service-listings', () => ({ createServiceListingForHost: mocks.staffCreate }))
vi.mock('@/actions/host-service-listings', () => ({ createHostServiceListing: mocks.hostCreate, updateHostServiceListing: vi.fn() }))
vi.mock('@/actions/host-service-listing-items', () => ({
  createServiceListingItem: vi.fn(), updateServiceListingItem: vi.fn(), deleteServiceListingItem: vi.fn(),
}))
vi.mock('@/actions/host-service-item-unavailability', () => ({ addItemUnavailability: vi.fn(), removeItemUnavailability: vi.fn() }))
vi.mock('@/actions/listing-drafts', () => ({
  saveListingDraft: mocks.saveDraft, saveListingDraftAsStaff: mocks.saveDraft, markListingDraftSubmitted: vi.fn(),
}))
vi.mock('@/components/admin/HostListingContactFields', () => ({
  HostListingContactFields: () => createElement('p', null, 'Host contact fields'),
}))
vi.mock('@/components/hosting/HostDestinationSearch', () => ({ HostDestinationSearch: () => null }))
vi.mock('@/components/hosting/CoHostSection', () => ({ CoHostSection: () => null }))
import { HostServiceListingTabs } from './HostServiceListingTabs'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', window.localStorage ?? window.sessionStorage)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('staff creating a rental for a host', () => {
  it('uses the host form with contact fields, shared map picker and rental units', () => {
    render(createElement(HostServiceListingTabs, { mode: 'create', staffCreate: true, type: 'rentals', destinations: [], userId: 'staff-id' }))
    expect(screen.getByText('Host contact fields')).toBeTruthy()
    expect(screen.getByText('Exact location *')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Find on map' })).toBeTruthy()
    cleanup()
    render(createElement(HostServiceListingTabs, { mode: 'create', staffCreate: true, type: 'rentals', destinations: [], userId: 'staff-id', initialTab: 1 }))
    const options = [...document.querySelectorAll('option')].map(o => o.textContent)
    expect(options).toEqual(expect.arrayContaining(['Per hour', 'Per day', 'Per week', 'Per month']))
  })

  it('blocks publishing until a host contact is entered and never saves a staff draft', async () => {
    render(createElement(HostServiceListingTabs, { mode: 'create', staffCreate: true, type: 'rentals', destinations: [], userId: 'staff-id' }))
    fireEvent.click(screen.getByRole('button', { name: /Review/ }))
    expect(await screen.findByText(/Host email or phone/)).toBeTruthy()
    expect(mocks.staffCreate).not.toHaveBeenCalled()
    expect(mocks.saveDraft).not.toHaveBeenCalled()
  })
})
