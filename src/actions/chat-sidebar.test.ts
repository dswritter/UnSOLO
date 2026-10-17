import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), sidebar: vi.fn() }))
vi.mock('@/lib/auth/action-auth', () => ({ getActionAuth: mocks.auth }))
vi.mock('@/lib/chat/getSidebarRooms', () => ({ getSidebarRooms: mocks.sidebar }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { loadActiveSidebarRoom, loadMoreSidebarRooms } from './chat-sidebar'

describe('load active sidebar room', () => {
  beforeEach(() => vi.resetAllMocks())

  it('requires authentication', async () => {
    mocks.auth.mockResolvedValue({ user: null })
    expect(await loadActiveSidebarRoom('room')).toEqual({ room: null, error: 'Not authenticated' })
    expect(mocks.sidebar).not.toHaveBeenCalled()
  })

  it('finds older rooms using only the authenticated viewer sidebar', async () => {
    const supabase = {}
    mocks.auth.mockResolvedValue({ user: { id: 'viewer' }, supabase })
    mocks.sidebar.mockResolvedValue({ rooms: [{ id: 'recent' }, { id: 'older' }] })
    expect(await loadActiveSidebarRoom('older')).toEqual({ room: { id: 'older' } })
    expect(mocks.sidebar).toHaveBeenCalledWith(supabase, 'viewer', { limit: 1, offset: 0, roomId: 'older' })
  })

  describe('sidebar category pagination', () => {
    beforeEach(() => vi.resetAllMocks())

    it('fetches a category independently of the All page', async () => {
      const supabase = {}
      mocks.auth.mockResolvedValue({ user: { id: 'viewer' }, supabase })
      mocks.sidebar.mockResolvedValue({ rooms: [{ id: 'trip' }], total: 12, pinnedRoomIds: [], roomNameIndex: [] })
      const result = await loadMoreSidebarRooms(0, 'trip')
      expect(result.rooms).toEqual([{ id: 'trip' }])
      expect(mocks.sidebar).toHaveBeenCalledWith(supabase, 'viewer', { limit: 8, offset: 0, type: 'trip' })
      await loadMoreSidebarRooms(8, 'trip')
      expect(mocks.sidebar).toHaveBeenLastCalledWith(supabase, 'viewer', { limit: 8, offset: 8, type: 'trip' })
    })

    it('keeps All unfiltered and clamps negative offsets', async () => {
      mocks.auth.mockResolvedValue({ user: { id: 'viewer' }, supabase: {} })
      mocks.sidebar.mockResolvedValue({ rooms: [], total: 0, pinnedRoomIds: [] })
      await loadMoreSidebarRooms(-4)
      expect(mocks.sidebar).toHaveBeenCalledWith({}, 'viewer', { limit: 8, offset: 0 })
    })
  })

  it('does not reveal rooms outside the viewer sidebar', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'viewer' }, supabase: {} })
    mocks.sidebar.mockResolvedValue({ rooms: [{ id: 'allowed' }] })
    expect(await loadActiveSidebarRoom('private-room')).toEqual({ room: null })
  })
})
