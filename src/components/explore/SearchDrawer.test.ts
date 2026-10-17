// @vitest-environment happy-dom
import { createElement } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { router } = vi.hoisted(() => ({ router: { push: vi.fn() } }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))
vi.mock('@/hooks/useFocusTrap', () => ({ useFocusTrap: vi.fn() }))
import { SearchDrawer } from './SearchDrawer'

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  window.history.replaceState(null, '', '/?search=1&tab=trips&page=3')
})
afterEach(() => { cleanup(); vi.useRealTimers() })

function mount(isOpen: boolean, initialValue = '') {
  return render(createElement(SearchDrawer, {
    isOpen, onClose: vi.fn(), initialValue, basePath: '/', preserveWanderSearch: true, activeTab: 'trips',
  }))
}

describe('mobile bottom search', () => {
  it('never navigates from a closed drawer', () => {
    mount(false)
    act(() => { vi.advanceTimersByTime(1000) })
    expect(router.push).not.toHaveBeenCalled()
  })

  it('does not reload unchanged results when opened', () => {
    mount(true)
    act(() => { vi.advanceTimersByTime(1000) })
    expect(router.push).not.toHaveBeenCalled()
  })

  it('keeps category filters but resets pagination when searching', () => {
    mount(true)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Manali' } })
    act(() => { vi.advanceTimersByTime(350) })
    expect(router.push).toHaveBeenCalledTimes(1)
    const url = new URL(router.push.mock.calls[0][0], 'http://localhost')
    expect(url.searchParams.get('q')).toBe('Manali')
    expect(url.searchParams.get('tab')).toBe('trips')
    expect(url.searchParams.get('search')).toBe('1')
    expect(url.searchParams.has('page')).toBe(false)
  })
})
