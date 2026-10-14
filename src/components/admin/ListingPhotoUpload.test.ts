// @vitest-environment happy-dom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UPLOAD_MAX_IMAGE_BYTES } from '@/lib/constants'
import { ListingPhotoUpload } from './ListingPhotoUpload'

const upload = vi.fn()
beforeEach(() => { upload.mockReset(); vi.stubGlobal('fetch', upload) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function response(url = 'https://images.example.com/photo.webp') {
  return { ok: true, json: async () => ({ url }) }
}
const photo = (name = 'photo.jpg', type = 'image/jpeg') => new File(['image'], name, { type })
function mount(disabled = false) {
  const onUploaded = vi.fn()
  const onBusyChange = vi.fn()
  const view = render(createElement(ListingPhotoUpload, { onUploaded, onBusyChange, disabled }))
  const input = screen.getByLabelText('Select listing photos') as HTMLInputElement
  return { ...view, input, onUploaded, onBusyChange }
}
function select(input: HTMLInputElement, files: File[]) {
  fireEvent.change(input, { target: { files } })
}

describe('multiple listing photo uploads', () => {
  it('allows selecting multiple supported image formats in one picker', () => {
    const { input } = mount()
    expect(input.multiple).toBe(true)
    expect(input.accept).toBe('image/jpeg,image/png,image/webp,image/avif')
    expect(screen.getByText(/Select multiple photos at once/)).toBeDefined()
  })
  it('uploads every selected file in order using service listing permissions', async () => {
    upload.mockResolvedValueOnce(response('https://images.example.com/one.webp'))
      .mockResolvedValueOnce(response('https://images.example.com/two.webp'))
      .mockResolvedValueOnce(response('https://images.example.com/three.webp'))
    const { input, onUploaded, onBusyChange } = mount()
    select(input, [photo('one.jpg'), photo('two.png', 'image/png'), photo('three.avif', 'image/avif')])
    expect(onBusyChange).toHaveBeenCalledWith(true)
    expect(input.disabled).toBe(true)
    await screen.findByText('3 photos added.')
    expect(onUploaded.mock.calls).toEqual([
      [['https://images.example.com/one.webp']], [['https://images.example.com/two.webp']], [['https://images.example.com/three.webp']],
    ])
    expect(upload.mock.calls.map(([, request]) => request.body.get('file').name)).toEqual(['one.jpg', 'two.png', 'three.avif'])
    for (const [url, request] of upload.mock.calls) {
      expect(url).toBe('/api/upload')
      expect(request.body.get('purpose')).toBe('service_listing')
      expect(request.method).toBe('POST')
      expect(request.signal).toBeInstanceOf(AbortSignal)
    }
    expect(onBusyChange).toHaveBeenLastCalledWith(false)
    expect(input.disabled).toBe(false)
  })
  it('skips unsupported or oversized files but uploads the valid files', async () => {
    upload.mockResolvedValue(response())
    const big = photo('too-big.jpg')
    Object.defineProperty(big, 'size', { value: UPLOAD_MAX_IMAGE_BYTES + 1 })
    const { input, onUploaded } = mount()
    select(input, [photo('not-an-image.txt', 'text/plain'), big, photo('valid.jpg')])
    await screen.findByText('1 photo added.')
    expect(upload).toHaveBeenCalledTimes(1)
    expect(onUploaded).toHaveBeenCalledTimes(1)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('not-an-image.txt')
    expect(alert.textContent).toContain('too-big.jpg')
  })
  it('accepts a photo exactly at the existing size limit', async () => {
    upload.mockResolvedValue(response())
    const file = photo()
    Object.defineProperty(file, 'size', { value: UPLOAD_MAX_IMAGE_BYTES })
    const { input } = mount()
    select(input, [file])
    await screen.findByText('1 photo added.')
    expect(upload).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).toBeNull()
  })
  it('retains successful photos and continues after an individual upload fails', async () => {
    upload.mockResolvedValueOnce(response('https://images.example.com/one.webp'))
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Storage unavailable' }) })
      .mockResolvedValueOnce(response('https://images.example.com/three.webp'))
    const { input, onUploaded } = mount()
    select(input, [photo('one.jpg'), photo('two.jpg'), photo('three.jpg')])
    await screen.findByText('2 photos added.')
    expect(onUploaded.mock.calls).toEqual([[['https://images.example.com/one.webp']], [['https://images.example.com/three.webp']]])
    expect(screen.getByRole('alert').textContent).toContain('two.jpg: Storage unavailable')
  })
  it('reports network and malformed responses without losing the rest of the batch', async () => {
    upload.mockRejectedValueOnce(new Error('Network unavailable'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce(response())
    const { input, onUploaded } = mount()
    select(input, [photo('offline.jpg'), photo('no-url.jpg'), photo('valid.jpg')])
    await screen.findByText('1 photo added.')
    expect(onUploaded).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert').textContent).toContain('Network unavailable')
    expect(screen.getByRole('alert').textContent).toContain('did not return a photo URL')
  })
  it('cancels the batch, retaining finished uploads and skipping remaining files', async () => {
    upload.mockResolvedValueOnce(response('https://images.example.com/finished.webp'))
      .mockImplementationOnce((_url, request) => new Promise((_resolve, reject) => {
        request.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      }))
    const { input, onUploaded, onBusyChange } = mount()
    select(input, [photo('finished.jpg'), photo('cancelled.jpg'), photo('not-started.jpg')])
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel photo uploads' }))
    await screen.findByText('1 photo added. Upload cancelled; completed photos are kept.')
    expect(onUploaded).toHaveBeenCalledTimes(1)
    expect(onUploaded).toHaveBeenCalledWith(['https://images.example.com/finished.webp'])
    expect(upload).toHaveBeenCalledTimes(2)
    expect(onBusyChange).toHaveBeenLastCalledWith(false)
    expect(screen.queryByRole('alert')).toBeNull()
  })
  it('can retry the same file in another selection', async () => {
    upload.mockResolvedValue({ ok: false, json: async () => ({ error: 'Please retry' }) })
    const { input, onUploaded } = mount()
    const file = photo('retry.jpg')
    select(input, [file])
    await screen.findByText('0 photos added.')
    expect(input.value).toBe('')
    upload.mockResolvedValue(response())
    select(input, [file])
    await screen.findByText('1 photo added.')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(onUploaded).toHaveBeenCalledTimes(1)
  })
  it('does nothing when file selection is cancelled or the form is disabled', () => {
    const { input, onBusyChange } = mount(true)
    select(input, [])
    select(input, [photo()])
    expect(upload).not.toHaveBeenCalled()
    expect(onBusyChange).not.toHaveBeenCalled()
  })
  it('aborts unfinished uploads when leaving the form', async () => {
    upload.mockImplementation((_url, request) => new Promise((_resolve, reject) => {
      request.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))
    const { input, unmount, onUploaded } = mount()
    select(input, [photo()])
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1))
    const signal = upload.mock.calls[0][1].signal
    unmount()
    expect(signal.aborted).toBe(true)
    expect(onUploaded).not.toHaveBeenCalled()
  })
})