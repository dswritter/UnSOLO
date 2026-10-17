import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { getSidebarRooms } from './getSidebarRooms'

function fixtureClient() {
  return createClient('http://supabase.test', 'test-key', {
    auth: { persistSession: false },
    global: {
      fetch: async input => {
        const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
        const resource = url.pathname.split('/').at(-1)
        const data = resource === 'chat_room_members'
          ? [1, 2, 3].map(i => ({ room: { id: `trip-${i}`, name: `Trip ${i}`, type: 'trip', is_active: true } }))
          : resource === 'chat_rooms'
            ? [{ id: 'general', name: 'Most recent community', type: 'general', is_active: true }]
            : resource === 'last_message_preview_for_rooms'
              ? [
                { room_id: 'general', last_content: 'new', last_at: '2026-10-17T00:00:00Z', last_message_type: 'text' },
                ...[1, 2, 3].map(i => ({ room_id: `trip-${i}`, last_content: 'trip', last_at: `2026-10-${16 - i}T00:00:00Z`, last_message_type: 'text' })),
              ]
              : []
        return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })
      },
    },
  })
}

describe('sidebar server category pages', () => {
  it('filters before paginating so Trips does not wait for All to reach older trips', async () => {
    const client = fixtureClient()
    const firstAll = await getSidebarRooms(client, 'viewer', { limit: 1, offset: 0 })
    expect(firstAll.rooms.map(room => room.id)).toEqual(['general'])
    const firstTrips = await getSidebarRooms(client, 'viewer', { limit: 2, offset: 0, type: 'trip' })
    expect(firstTrips.total).toBe(3)
    expect(firstTrips.rooms.map(room => room.id)).toEqual(['trip-1', 'trip-2'])
    const nextTrips = await getSidebarRooms(client, 'viewer', { limit: 2, offset: 2, type: 'trip' })
    expect(nextTrips.rooms.map(room => room.id)).toEqual(['trip-3'])
  })

  it('resolves only an accessible active room without hydrating unrelated conversations', async () => {
    const client = fixtureClient()
    const active = await getSidebarRooms(client, 'viewer', { limit: 1, offset: 0, roomId: 'trip-3' })
    expect(active.rooms.map(room => room.id)).toEqual(['trip-3'])
    const inaccessible = await getSidebarRooms(client, 'viewer', { limit: 1, offset: 0, roomId: 'private' })
    expect(inaccessible.rooms).toEqual([])
  })
})
