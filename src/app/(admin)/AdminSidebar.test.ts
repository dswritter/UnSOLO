// @vitest-environment happy-dom
import { createElement } from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  path: '/admin', refresh: vi.fn(), counts: vi.fn(), handlers: [] as Array<() => void>,
}))
vi.mock('next/navigation', () => ({
  usePathname: () => mocks.path,
  useRouter: () => ({ refresh: mocks.refresh }),
}))
vi.mock('@/actions/admin', () => ({ getAdminSidebarCounts: mocks.counts }))
vi.mock('@/components/admin/ui/AdminCommandPalette', () => ({ AdminCommandPalette: () => null }))
vi.mock('@/components/layout/ColorModeToggle', () => ({ ColorModeToggle: () => null }))
vi.mock('@/components/layout/NotificationBell', () => ({ NOTIFICATIONS_CHANGED_EVENT: 'notifications-changed' }))
vi.mock('./AdminNotificationBell', () => ({ AdminNotificationBell: () => null }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    channel: () => {
      const channel = {
        on: (_event: string, _filter: unknown, handler: () => void) => { mocks.handlers.push(handler); return channel },
        subscribe: () => channel,
      }
      return channel
    },
    removeChannel: vi.fn(),
  }),
}))
import { AdminSidebar } from './AdminSidebar'

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  mocks.path = '/admin'
  mocks.handlers = []
  mocks.counts.mockResolvedValue({ bookings: 0, requests: 0, serviceListings: 0, communityTrips: 0, notificationsResolved: 0 })
})
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('admin history caching', () => {
  it('does not invalidate history when opening or revisiting admin routes', async () => {
    const props = { role: 'admin' as const, name: 'Admin', userId: 'admin-1' }
    const view = render(createElement(AdminSidebar, props))
    for (const path of ['/admin/community-trips', '/admin/community-trips/create', '/admin/community-trips', '/admin']) {
      mocks.path = path
      await act(async () => { await vi.advanceTimersByTimeAsync(21000) })
      view.rerender(createElement(AdminSidebar, props))
    }
    expect(mocks.refresh).not.toHaveBeenCalled()
    expect(mocks.counts).toHaveBeenCalled()
  })
  it('still refreshes the relevant review queue after realtime changes', async () => {
    mocks.path = '/admin/community-trips'
    render(createElement(AdminSidebar, { role: 'admin', name: 'Admin', userId: 'admin-1' }))
    await act(async () => {
      mocks.handlers[1]()
      await vi.advanceTimersByTimeAsync(800)
    })
    expect(mocks.refresh).toHaveBeenCalledOnce()
  })
})
