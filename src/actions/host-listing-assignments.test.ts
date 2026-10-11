import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), rpc: vi.fn(), profile: { role: 'user' }, membership: null as null | {
    role: string; is_active: boolean; custom_permissions: string[]
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock('@/lib/auth/action-auth', () => ({ getActionAuth: mocks.auth }))
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    rpc: mocks.rpc,
    from: (table: string) => ({ select: () => ({ eq: () => ({
      maybeSingle: async () => ({ data: table === 'profiles' ? mocks.profile : mocks.membership }),
    }) }) }),
  }),
}))
import { updateHostListingContact } from './host-listing-assignments'

describe('staff host contact permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.mockResolvedValue({ user: { id: 'staff-id' } })
    mocks.rpc.mockResolvedValue({ error: null })
    mocks.profile = { role: 'user' }
    mocks.membership = null
  })
  it.each(['admin', 'host_onboarding_staff'])('allows %s for both listing types', async (role) => {
    mocks.profile.role = role
    await updateHostListingContact('service', 'listing-id', { email: ' HOST@Example.com ' })
    await updateHostListingContact('trip', 'trip-id', { phone: '9876543210' })
    expect(mocks.rpc).toHaveBeenCalledWith('update_host_listing_contact', {
      p_kind: 'service', p_listing_id: 'listing-id', p_contact: { email: 'host@example.com', phone: null }, p_staff_id: 'staff-id',
    })
  })
  it('allows active onboarding membership when the profile role has not synced', async () => {
    mocks.membership = { role: 'host_onboarding_staff', is_active: true, custom_permissions: [] }
    await updateHostListingContact('service', 'listing-id', { email: 'host@example.com' })
    expect(mocks.rpc).toHaveBeenCalledOnce()
  })
  it.each(['user', 'social_media_manager', 'field_person', 'chat_responder'])('denies %s without listing permissions', async (role) => {
    mocks.profile.role = role
    await expect(updateHostListingContact('service', 'listing-id', { email: 'host@example.com' })).rejects.toThrow('Unauthorized')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('limits a custom role to its assigned permission', async () => {
    mocks.profile.role = 'custom'
    mocks.membership = { role: 'custom', is_active: true, custom_permissions: ['service_listings'] }
    await updateHostListingContact('service', 'listing-id', { email: 'host@example.com' })
    await expect(updateHostListingContact('trip', 'trip-id', { email: 'host@example.com' })).rejects.toThrow('Unauthorized')
  })
  it('denies inactive memberships', async () => {
    mocks.membership = { role: 'host_onboarding_staff', is_active: false, custom_permissions: [] }
    await expect(updateHostListingContact('service', 'listing-id', { email: 'host@example.com' })).rejects.toThrow('Unauthorized')
  })
  it('denies unauthenticated requests before database access', async () => {
    mocks.auth.mockResolvedValue({ user: null })
    await expect(updateHostListingContact('service', 'listing-id', { email: 'host@example.com' })).rejects.toThrow('Not authenticated')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('surfaces database rejections without reporting success', async () => {
    mocks.profile.role = 'admin'
    mocks.rpc.mockResolvedValue({ error: { message: 'This listing already has a host' } })
    await expect(updateHostListingContact('service', 'listing-id', { email: 'host@example.com' })).rejects.toThrow('already has a host')
  })
})