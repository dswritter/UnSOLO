// @vitest-environment happy-dom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ListingPin } from '@/lib/listing-location'
import { readListingPin } from '@/lib/listing-location'

vi.mock('next/dynamic', () => ({
  default: () => ({ onChange }: { onChange: (lat: number, lon: number, label: string) => void }) =>
    createElement('button', { type: 'button', onClick: () => onChange(32.25, 77.2, 'Adjusted pin') }, 'Drag pin'),
}))
import { ListingLocationPicker } from './ListingLocationPicker'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('shared listing map picker', () => {
  it('resolves a link, allows adjustment, and only commits a confirmed pin', async () => {
    const onPinChange = vi.fn()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ lat: 32.2, lon: 77.1 }),
    }))
    render(createElement(ListingLocationPicker, { address: 'Manali shop', pin: null, onAddressChange: vi.fn(), onPinChange }))
    fireEvent.change(screen.getByLabelText('Or paste a Google Maps link'), { target: { value: 'https://maps.app.goo.gl/example' } })
    fireEvent.click(screen.getByRole('button', { name: 'Locate pin' }))
    await screen.findByRole('dialog')
    expect(onPinChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Drag pin' }))
    fireEvent.click(screen.getByRole('button', { name: 'Use this pin' }))
    expect(onPinChange).toHaveBeenCalledWith({ lat: 32.25, lon: 77.2, label: 'Adjusted pin' })
  })
  it('cancels an adjusted pin without changing the saved location', () => {
    const onPinChange = vi.fn()
    const pin: ListingPin = { lat: 0, lon: 0, label: 'Existing location' }
    render(createElement(ListingLocationPicker, { address: '', pin, onAddressChange: vi.fn(), onPinChange }))
    fireEvent.click(screen.getByRole('button', { name: 'Adjust map pin' }))
    fireEvent.click(screen.getByRole('button', { name: 'Drag pin' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onPinChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('accepts zero coordinates and rejects invalid persisted pins', () => {
    expect(readListingPin({ lat: 0, lon: 0, label: 'Origin' })).toEqual({ lat: 0, lon: 0, label: 'Origin' })
    for (const value of [null, { lat: 91, lon: 0, label: '' }, { lat: 0, lon: NaN, label: '' }, { lat: '32', lon: 77, label: '' }]) {
      expect(readListingPin(value)).toBeNull()
    }
  })
})
