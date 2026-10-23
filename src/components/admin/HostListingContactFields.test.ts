// @vitest-environment happy-dom
import { createElement, useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HostListingContactInput } from '@/lib/host-listing-contact'
import type { HostListingContactOption } from '@/lib/host-listing-search'

const { searchHosts } = vi.hoisted(() => ({ searchHosts: vi.fn() }))
vi.mock('@/actions/host-listing-search', () => ({ searchHostListingContacts: searchHosts }))
vi.mock('@/actions/host-listing-assignments', () => ({ updateHostListingContact: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
import { HostListingContactFields } from './HostListingContactFields'

const host: HostListingContactOption = {
  id: 'registered:host-1', label: 'Asha Sharma', email: 'asha@example.com', phone: '+919876543210', source: 'registered', verified: true,
}
const prior: HostListingContactOption = {
  id: 'previous-listing:trip-1', label: 'Mountain trip', email: 'future@example.com', phone: null,
  source: 'previous-listing', verified: false, subtitle: 'trip: Mountain trip',
}

beforeEach(() => { searchHosts.mockReset(); searchHosts.mockResolvedValue([host, prior]) })
afterEach(cleanup)

function mount(kind: 'service' | 'trip' = 'service', initial: HostListingContactInput = {}, disabled = false) {
  const changed = vi.fn()
  function Harness() {
    const [value, setValue] = useState(initial)
    return createElement(HostListingContactFields, {
      listingKind: kind, value, disabled,
      onChange: (next: HostListingContactInput) => { changed(next); setValue(next) },
    })
  }
  render(createElement(Harness))
  return changed
}
const search = () => screen.getByRole('combobox', { name: 'Search hosts' })
function open() { fireEvent.focus(search()) }

describe('progressive host contact step', () => {
  it('starts with search only, preloads hosts once and shows them on focus', async () => {
    mount()
    expect(screen.queryByLabelText('Host email')).toBeNull()
    expect(screen.queryByLabelText('Host display name')).toBeNull()
    await waitFor(() => expect(searchHosts).toHaveBeenCalledWith('service', ''))
    open()
    expect(await screen.findByRole('option', { name: /Asha Sharma/ })).toBeDefined()
    expect(searchHosts).toHaveBeenCalledTimes(1)
  })

  it.each(['service', 'trip'] as const)('searches with %s authorization', async kind => {
    mount(kind)
    await waitFor(() => expect(searchHosts).toHaveBeenLastCalledWith(kind, ''))
  })

  it('selecting a registered host shows a compact card without display name or contact inputs', async () => {
    const changed = mount()
    open()
    fireEvent.click(await screen.findByRole('option', { name: /Asha Sharma/ }))
    expect(changed).toHaveBeenLastCalledWith({ email: 'asha@example.com', phone: '9876543210', countryCode: '+91' })
    expect(screen.getByText('Asha Sharma')).toBeDefined()
    expect(screen.queryByLabelText('Host display name')).toBeNull()
    expect(screen.queryByLabelText('Host email')).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'Search hosts' })).toBeNull()
  })

  it('asks for a display name only for an unregistered previous contact', async () => {
    const changed = mount()
    open()
    fireEvent.click(await screen.findByRole('option', { name: /Mountain trip/ }))
    expect(changed).toHaveBeenLastCalledWith({ email: 'future@example.com', phone: '', countryCode: '+91' })
    expect(screen.getByLabelText('Host display name')).toBeDefined()
    expect(screen.queryByLabelText('Host email')).toBeNull()
  })

  it('Change returns to search and clears the contact', async () => {
    const changed = mount()
    open()
    fireEvent.click(await screen.findByRole('option', { name: /Asha Sharma/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    expect(changed).toHaveBeenLastCalledWith({ email: '', phone: '', countryCode: '+91' })
    expect(search()).toBeDefined()
  })

  it('selects the correct supported country for an international host', async () => {
    searchHosts.mockResolvedValue([{ ...host, phone: '+9779812345678' }])
    const changed = mount()
    open()
    fireEvent.click(await screen.findByRole('option', { name: /Asha Sharma/ }))
    expect(changed).toHaveBeenLastCalledWith({ email: 'asha@example.com', phone: '9812345678', countryCode: '+977' })
  })

  it('keeps a usable email without copying an unsupported phone, and disables unusable contacts', async () => {
    searchHosts.mockResolvedValue([{ ...host, phone: '+14155552671' }, { ...prior, email: null, phone: '+14155552671' }])
    const changed = mount()
    open()
    fireEvent.click(await screen.findByRole('option', { name: /Asha Sharma/ }))
    expect(changed).toHaveBeenLastCalledWith({ email: 'asha@example.com', phone: '', countryCode: '+91' })
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    open()
    expect((await screen.findByRole('option', { name: /Mountain trip/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('filters already-loaded hosts instantly while typing and debounces the server search', async () => {
    mount()
    await waitFor(() => expect(searchHosts).toHaveBeenCalledTimes(1))
    fireEvent.change(search(), { target: { value: 'mount' } })
    expect(screen.getByRole('option', { name: /Mountain trip/ })).toBeDefined()
    expect(screen.queryByRole('option', { name: /Asha Sharma/ })).toBeNull()
    fireEvent.change(search(), { target: { value: 'asha@example.com' } })
    expect(screen.getByRole('option', { name: /Asha Sharma/ })).toBeDefined()
    await waitFor(() => expect(searchHosts).toHaveBeenLastCalledWith('service', 'asha@example.com'))
    expect(searchHosts.mock.calls.some(call => call[1] === 'mount')).toBe(false)
  })

  it('supports keyboard selection and Escape', async () => {
    const changed = mount()
    open()
    await screen.findByRole('option', { name: /Asha Sharma/ })
    fireEvent.keyDown(search(), { key: 'ArrowDown' })
    expect(screen.getByRole('option', { name: /Asha Sharma/ }).getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(search(), { key: 'Enter' })
    expect(changed).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    open()
    fireEvent.keyDown(search(), { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('shows a retry on lookup failure', async () => {
    searchHosts.mockRejectedValueOnce(new Error('Unable to search host contacts'))
    mount()
    expect((await screen.findByRole('alert')).textContent).toContain('Unable to search host contacts')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    open()
    await screen.findByRole('option', { name: /Asha Sharma/ })
  })

  it('New host reveals name, email and phone fields', async () => {
    const changed = mount()
    fireEvent.click(screen.getByRole('button', { name: 'New host' }))
    fireEvent.change(screen.getByLabelText('Host email'), { target: { value: 'new@example.com' } })
    expect(changed).toHaveBeenLastCalledWith({ email: 'new@example.com', phone: '', countryCode: '+91' })
    expect(screen.getByLabelText('Host display name')).toBeDefined()
    expect(screen.getByLabelText('Host phone')).toBeDefined()
  })

  it('opens directly on contact fields when a contact already exists', () => {
    mount('service', { email: 'keep@example.com' })
    expect((screen.getByLabelText('Host email') as HTMLInputElement).value).toBe('keep@example.com')
  })

  it('does not request private contacts while disabled', () => {
    mount('service', {}, true)
    expect((search() as HTMLInputElement).disabled).toBe(true)
    expect(searchHosts).not.toHaveBeenCalled()
  })
})
