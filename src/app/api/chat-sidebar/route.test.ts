import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'

const load = vi.hoisted(() => vi.fn())
vi.mock('@/actions/chat-sidebar', () => ({ loadMoreSidebarRooms: load }))

beforeEach(() => vi.resetAllMocks())
const request = (query: string) => new NextRequest(`http://localhost/api/chat-sidebar${query}`)

describe('sidebar read endpoint', () => {
  it('returns only the signed-in viewer page without shared caching', async () => {
    load.mockResolvedValue({ rooms: [], total: 0, pinnedRoomIds: [] })
    const response = await GET(request('?offset=8&type=trip'))
    expect(load).toHaveBeenCalledWith(8, 'trip')
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('returns an explicit authentication error', async () => {
    load.mockResolvedValue({ rooms: [], total: 0, pinnedRoomIds: [], error: 'Not authenticated' })
    expect((await GET(request(''))).status).toBe(401)
  })

  it.each(['?offset=-1', '?offset=1.5', '?offset=bad', '?type=private'])('rejects invalid filters: %s', async query => {
    expect((await GET(request(query))).status).toBe(400)
    expect(load).not.toHaveBeenCalled()
  })
})
