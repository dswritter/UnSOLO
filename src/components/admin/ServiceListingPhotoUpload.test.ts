// @vitest-environment happy-dom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ServiceListing } from '@/types'

const { createListing, updateListing } = vi.hoisted(() => ({ createListing: vi.fn(), updateListing: vi.fn() }))
vi.mock('@/actions/admin-service-listings', () => ({ createServiceListing: createListing, updateServiceListing: updateListing }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/admin/HostListingContactFields', () => ({ HostListingContactFields: () => null, HostListingAssignmentPanel: () => null }))
import { ServiceListingForm } from '@/app/(admin)/admin/service-listings/ServiceListingForm'

const upload = vi.fn()
beforeEach(() => { upload.mockReset(); createListing.mockReset(); updateListing.mockReset(); vi.stubGlobal('fetch', upload) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('admin service form batch photos', () => {
  it('exposes a multiple-file picker alongside the existing URL input', () => {
    render(createElement(ServiceListingForm, { destinations: [] }))
    expect((screen.getByLabelText('Select listing photos') as HTMLInputElement).multiple).toBe(true)
    expect(screen.getByLabelText('Listing photo URLs')).toBeDefined()
  })
  it('appends every uploaded photo without replacing the existing cover or gallery', async () => {
    upload.mockResolvedValueOnce({ ok: true, json: async () => ({ url: 'https://images.example.com/new-one.webp' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ url: 'https://images.example.com/new-two.webp' }) })
    const listing = { id: 'stay-1', title: 'Existing stay', type: 'stays', images: ['https://images.example.com/cover.webp'] } as ServiceListing
    render(createElement(ServiceListingForm, { destinations: [], listing }))
    fireEvent.change(screen.getByLabelText('Select listing photos'), { target: { files: [
      new File(['one'], 'one.jpg', { type: 'image/jpeg' }), new File(['two'], 'two.png', { type: 'image/png' }),
    ] } })
    await screen.findByText('2 photos added.')
    expect((screen.getByLabelText('Listing photo URLs') as HTMLTextAreaElement).value).toBe([
      'https://images.example.com/cover.webp', 'https://images.example.com/new-one.webp', 'https://images.example.com/new-two.webp',
    ].join('\n'))
    expect(createListing).not.toHaveBeenCalled()
    expect(updateListing).not.toHaveBeenCalled()
  })
  it('blocks both submit clicks and form submission until uploads finish or are cancelled', async () => {
    upload.mockImplementation((_url, request) => new Promise((_resolve, reject) => {
      request.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))
    const { container } = render(createElement(ServiceListingForm, { destinations: [] }))
    fireEvent.change(screen.getByLabelText('Select listing photos'), { target: { files: [new File(['one'], 'one.jpg', { type: 'image/jpeg' })] } })
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1))
    const submit = screen.getByRole('button', { name: 'Create listing', exact: true }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    expect((screen.getByLabelText('Listing photo URLs') as HTMLTextAreaElement).disabled).toBe(true)
    fireEvent.submit(container.querySelector('form')!)
    expect(createListing).not.toHaveBeenCalled()
    expect(updateListing).not.toHaveBeenCalled()
    expect(screen.getByText('Wait for the photo uploads to finish, or cancel them, before saving the listing.')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel photo uploads' }))
    await waitFor(() => expect(submit.disabled).toBe(false))
  })
})