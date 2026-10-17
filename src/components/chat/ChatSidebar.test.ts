// @vitest-environment happy-dom
import { createElement } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatSidebar, type SidebarRoom } from './ChatSidebar'

const mocks = vi.hoisted(() => ({ load: vi.fn(), active: vi.fn(), router: { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } }))
vi.mock('@/actions/chat-sidebar', () => ({ loadActiveSidebarRoom: mocks.active, toggleChatSidebarPin: vi.fn() }))
vi.mock('@/lib/chat/fetchSidebarRooms', () => ({ fetchSidebarRoomPage: mocks.load }))
vi.mock('@/actions/profile', () => ({ startDirectMessage: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router, usePathname: () => '/community' }))
vi.mock('@/lib/chat/prefetchRoomMessages', () => ({ prefetchRoomMessages: vi.fn() }))
vi.mock('@/lib/notifications/soundController', () => ({ preloadSound: vi.fn(), playNotificationSound: vi.fn(), sendSystemNotification: vi.fn() }))
vi.mock('./SoundSettings', () => ({ SoundSettingsButton: () => null }))
vi.mock('./NotificationPrompt', () => ({ NotificationPrompt: () => null }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => {
    const channel = { on: () => channel, subscribe: () => channel }
    const query = { select: () => query, eq: () => query, gte: () => Promise.resolve({ data: [] }) }
    return { channel: () => channel, removeChannel: vi.fn(), from: () => query }
  },
}))

const trip: SidebarRoom = { id: 'trip-1', name: 'Valley of Flowers', type: 'trip' }
const general: SidebarRoom = { id: 'general-1', name: 'Budget Travel India', type: 'general' }
const page = (rooms: SidebarRoom[], total = rooms.length) => ({ rooms, total, pinnedRoomIds: [] })
let client: QueryClient

function mount(rooms: SidebarRoom[] = [], totalRoomCount = rooms.length) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(createElement(QueryClientProvider, { client },
    createElement(ChatSidebar, { rooms, totalRoomCount, viewerUserId: 'viewer' }),
  ))
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => { cleanup(); client?.clear() })

describe('progressive community sidebar', () => {
  it('shows usable tabs before the first conversations resolve and fetches Trips independently', async () => {
    mocks.load.mockImplementation((_offset, type) => type === 'trip' ? Promise.resolve(page([trip])) : new Promise(() => {}))
    mount()
    expect(screen.getByRole('button', { name: 'All' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'DMs' })).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('Loading')
    fireEvent.click(screen.getByRole('button', { name: 'Trips' }))
    await waitFor(() => expect(mocks.load).toHaveBeenCalledWith(0, 'trip'))
    await waitFor(() => expect(screen.getByText(trip.name)).toBeTruthy())
    expect(screen.queryByText('No conversations found')).toBeNull()
  })

  it('immediately reuses All matches, merges category results, and paginates that category', async () => {
    let finish: (value: ReturnType<typeof page>) => void = () => {}
    mocks.load.mockImplementation((offset, type) => {
      if (type === 'trip' && offset === 0) return new Promise(resolve => { finish = resolve })
      return Promise.resolve(page([{ id: 'trip-3', name: 'Third trek', type: 'trip' }], 3))
    })
    mount([general, trip], 20)
    fireEvent.click(screen.getByRole('button', { name: 'Trips' }))
    expect(screen.getByText(trip.name)).toBeTruthy()
    expect(screen.queryByText(general.name)).toBeNull()
    await act(async () => finish(page([trip, { id: 'trip-2', name: 'Second trek', type: 'trip' }], 3)))
    await waitFor(() => expect(screen.getByText('Second trek')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Load more conversations' }))
    await waitFor(() => expect(mocks.load).toHaveBeenCalledWith(2, 'trip'))
    await waitFor(() => expect(screen.getByText('Third trek')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(screen.getByText('Third trek')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Load more conversations' }))
    await waitFor(() => expect(mocks.load).toHaveBeenCalledWith(2, undefined))
  })

  it('reports category load errors without discarding cached matches', async () => {
    mocks.load.mockRejectedValue(new Error('Offline'))
    mount([trip])
    fireEvent.click(screen.getByRole('button', { name: 'Trips' }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByText(trip.name)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
  })
})
