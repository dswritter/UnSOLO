// @vitest-environment happy-dom
import { createElement, useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
function open() {
  fireEvent.click(screen.getByRole('button', { name: 'Choose or search an existing host' }))
}

describe('staff reusable host contact picker', () => {
  it('does not search before opening and keeps manual entry available', () => {
    const changed = mount()
    expect(searchHosts).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Host email'), { target: { value: 'new@example.com' } })
    expect(changed).toHaveBeenLastCalledWith({ email: 'new@example.com' })
  })
  it.each(['service', 'trip'] as const)('loads global suggestions with %s authorization', async kind => {
    mount(kind)
    open()
    expect(screen.getByRole('combobox', { name: 'Search hosts' })).toBe(document.activeElement)
    await screen.findByRole('option', { name: /Asha Sharma/ })
    expect(searchHosts).toHaveBeenLastCalledWith(kind, '')
    expect(screen.getByText('Registered host')).toBeDefined()
    expect(screen.getByText('Previous listing contact')).toBeDefined()
  })
  it('fills the contact fields, normalizes the phone and does not submit a listing', async () => {
    const changed = mount()
    open()
    fireEvent.click(await screen.findByRole('option', { name: /Asha Sharma/ }))
    expect(changed).toHaveBeenLastCalledWith({ email: 'asha@example.com', phone: '9876543210', countryCode: '+91' })
    expect((screen.getByLabelText('Host email') as HTMLInputElement).value).toBe('asha@example.com')
    expect((screen.getByLabelText('Host phone') as HTMLInputElement).value).toBe('9876543210')
    expect(screen.queryByRole('combobox', { name: 'Search hosts' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Asha Sharma' })).toBe(document.activeElement)
  })
  it('reuses a previous trip contact in a new service listing without pretending it is verified', async () => {
    const changed = mount('service', { email: 'other@example.com', phone: '9876543210', countryCode: '+91' })
    open()
    fireEvent.click(await screen.findByRole('option', { name: /Mountain trip/ }))
    expect(changed).toHaveBeenLastCalledWith({ email: 'future@example.com', phone: '', countryCode: '+91' })
    expect((screen.getByLabelText('Host phone') as HTMLInputElement).value).toBe('')
  })
  it('selects the correct supported country for an international host', async () => {
    searchHosts.mockResolvedValue([{ ...host, phone: '+9779812345678' }])
    const changed = mount()
    open()
    fireEvent.click(await screen.findByRole('option', { name: /Asha Sharma/ }))
    expect(changed).toHaveBeenLastCalledWith({ email: 'asha@example.com', phone: '9812345678', countryCode: '+977' })
    expect((screen.getByLabelText('Host phone country code') as HTMLSelectElement).value).toBe('+977')
  })
  it('keeps a usable email without copying an unsupported phone', async () => {
    searchHosts.mockResolvedValue([{ ...host, phone: '+14155552671' }])
    const changed = mount()
    open()
    fireEvent.click(await screen.findByRole('option', { name: /Asha Sharma/ }))
    expect(changed).toHaveBeenLastCalledWith({ email: 'asha@example.com', phone: '', countryCode: '+91' })
  })
  it('does not select a phone-only contact that the existing form cannot validate', async () => {
    searchHosts.mockResolvedValue([{ ...host, email: null, phone: '+14155552671' }])
    const changed = mount()
    open()
    const option = await screen.findByRole('option', { name: /Asha Sharma/ }) as HTMLButtonElement
    expect(option.disabled).toBe(true)
    fireEvent.click(option)
    expect(changed).not.toHaveBeenCalled()
  })
  it('supports keyboard selection and Escape without submitting the parent form', async () => {
    const changed = mount()
    open()
    await screen.findByRole('option', { name: /Asha Sharma/ })
    const input = screen.getByRole('combobox', { name: 'Search hosts' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(screen.getByRole('option', { name: /Asha Sharma/ }).getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(changed).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Asha Sharma' }))
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Search hosts' }), { key: 'Escape' })
    expect(screen.queryByRole('combobox', { name: 'Search hosts' })).toBeNull()
  })
  it('debounces searches and only sends the final query', async () => {
    mount()
    open()
    await screen.findByRole('option', { name: /Asha Sharma/ })
    const input = screen.getByRole('combobox', { name: 'Search hosts' })
    fireEvent.change(input, { target: { value: 'ash' } })
    fireEvent.change(input, { target: { value: 'asha@example.com' } })
    await waitFor(() => expect(searchHosts).toHaveBeenLastCalledWith('service', 'asha@example.com'))
    expect(searchHosts.mock.calls.some(call => call[1] === 'ash')).toBe(false)
  })
  it('ignores stale results after a later query has completed', async () => {
    let resolveOld: (options: HostListingContactOption[]) => void = () => {}
    searchHosts.mockImplementation((_kind: string, query: string) => query === 'old'
      ? new Promise<HostListingContactOption[]>(resolve => { resolveOld = resolve })
      : Promise.resolve(query === 'new' ? [prior] : [host]))
    mount()
    open()
    await screen.findByRole('option', { name: /Asha Sharma/ })
    const input = screen.getByRole('combobox', { name: 'Search hosts' })
    fireEvent.change(input, { target: { value: 'old' } })
    await waitFor(() => expect(searchHosts).toHaveBeenLastCalledWith('service', 'old'))
    fireEvent.change(input, { target: { value: 'new' } })
    await screen.findByRole('option', { name: /Mountain trip/ })
    await act(async () => resolveOld([host]))
    expect(screen.queryByRole('option', { name: /Asha Sharma/ })).toBeNull()
    expect(screen.getByRole('option', { name: /Mountain trip/ })).toBeDefined()
  })
  it('retains manual contacts on lookup failure and offers a retry', async () => {
    searchHosts.mockRejectedValueOnce(new Error('Unable to search host contacts'))
    mount('service', { email: 'keep@example.com' })
    open()
    expect((await screen.findByRole('alert')).textContent).toContain('Unable to search host contacts')
    expect((screen.getByLabelText('Host email') as HTMLInputElement).value).toBe('keep@example.com')
    fireEvent.click(screen.getByRole('button', { name: 'Retry host search' }))
    await screen.findByRole('option', { name: /Asha Sharma/ })
  })
  it('provides an empty state and explicit new-host entry', async () => {
    searchHosts.mockResolvedValue([])
    const changed = mount('service', { email: 'old@example.com' })
    open()
    await screen.findByText('No matching hosts. Enter a new host’s email or phone below.')
    fireEvent.click(screen.getByRole('button', { name: 'Enter a new host manually' }))
    expect(changed).toHaveBeenLastCalledWith({ email: '', phone: '', countryCode: '+91' })
    expect(screen.queryByRole('combobox', { name: 'Search hosts' })).toBeNull()
  })
  it('clears the selected-host label when contact details are manually changed', async () => {
    mount()
    open()
    fireEvent.click(await screen.findByRole('option', { name: /Asha Sharma/ }))
    fireEvent.change(screen.getByLabelText('Host email'), { target: { value: 'different@example.com' } })
    expect(screen.getByRole('button', { name: 'Choose or search an existing host' })).toBeDefined()
  })
  it('disables the picker while saving without requesting private contacts', () => {
    mount('service', {}, true)
    const button = screen.getByRole('button', { name: 'Choose or search an existing host' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    expect(searchHosts).not.toHaveBeenCalled()
  })
})