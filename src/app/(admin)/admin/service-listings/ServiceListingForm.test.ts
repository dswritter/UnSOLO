// @vitest-environment happy-dom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ListingPin } from '@/lib/listing-location'

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ back: vi.fn() }) }))
vi.mock('@/actions/admin-service-listings', () => ({ createServiceListing: mocks.create, updateServiceListing: mocks.update }))
vi.mock('@/components/admin/HostListingContactFields', () => ({ HostListingContactFields: () => null, HostListingAssignmentPanel: () => null }))
vi.mock('@/components/admin/ListingPhotoUpload', () => ({ ListingPhotoUpload: () => null }))
vi.mock('@/components/hosting/HostDestinationSearch', () => ({
  HostDestinationSearch: ({ onPick }: { onPick: (value: { id: string; name: string; state: string }) => void }) =>
    createElement('div', null, ...['Manali', 'Kasol'].map(name => createElement('button', {
      key: name, type: 'button', onClick: () => onPick({ id: name.toLowerCase(), name, state: 'Himachal Pradesh' }),
    }, `Add ${name}`))),
}))
vi.mock('@/components/hosting/ListingLocationPicker', () => ({
  ListingLocationPicker: ({ onPinChange }: { onPinChange: (pin: ListingPin) => void }) =>
    createElement('button', { type: 'button', onClick: () => onPinChange({ lat: 32.25, lon: 77.2, label: 'Rental shop' }) }, 'Set exact pin'),
}))
import { ServiceListingForm } from './ServiceListingForm'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('admin service location parity', () => {
  it('saves multiple destinations and the exact confirmed map coordinates', async () => {
    mocks.create.mockResolvedValue(undefined)
    vi.spyOn(window.location, 'assign').mockImplementation(() => {})
    const view = render(createElement(ServiceListingForm, { destinations: [] }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Manali' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Kasol' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Manali' }))
    fireEvent.click(screen.getByRole('button', { name: 'Set exact pin' }))
    fireEvent.submit(view.container.querySelector('form')!)
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      destination_ids: ['manali', 'kasol'], latitude: 32.25, longitude: 77.2, location: 'Rental shop',
    })))
  })
})
