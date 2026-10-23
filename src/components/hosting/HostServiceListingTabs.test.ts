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
  HostListingContactFields: ({ onChange }: { onChange: (v: { email: string }) => void }) =>
    createElement('button', { type: 'button', onClick: () => onChange({ email: 'host@example.com' }) }, 'Pick host'),
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
  const props = { mode: 'create' as const, staffCreate: true, type: 'rentals' as const, destinations: [], userId: 'staff-id' }

  it('asks for the host first, then reveals the shared location picker and steps', () => {
    render(createElement(HostServiceListingTabs, props))
    expect(screen.queryByText('Exact location *')).toBeNull()
    expect(screen.queryByRole('button', { name: /Items/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Pick host' }))
    expect(screen.getByText('Exact location *')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Find on map' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Items/ })).toBeTruthy()
    expect(mocks.saveDraft).not.toHaveBeenCalled()
  })

  it('offers hourly, daily, weekly and monthly rental units', () => {
    render(createElement(HostServiceListingTabs, { ...props, initialTab: 1 }))
    const options = [...document.querySelectorAll('option')].map(o => o.textContent)
    expect(options).toEqual(expect.arrayContaining(['Per hour', 'Per day', 'Per week', 'Per month']))
    expect(mocks.staffCreate).not.toHaveBeenCalled()
  })
})
