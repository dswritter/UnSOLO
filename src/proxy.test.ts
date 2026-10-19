import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ createServerClient: vi.fn() }))
vi.mock('@supabase/ssr', () => ({ createServerClient: mocks.createServerClient }))
import { proxy } from './proxy'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('public host profile routes', () => {
  it.each([
    '/profile/strangers%20tribe',
    '/hosts/trip/12345678-1234-1234-1234-123456789abc',
    '/hosts/service/12345678-1234-1234-1234-123456789abc',
  ])('allows signed-out access to %s without auth refresh', async pathname => {
    const response = await proxy(new NextRequest(`http://localhost:3127${pathname}`))
    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.get('x-middleware-next')).toBe('1')
    expect(mocks.createServerClient).not.toHaveBeenCalled()
  })
})
