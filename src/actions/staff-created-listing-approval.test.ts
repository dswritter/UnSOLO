import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), rpc: vi.fn(), userFrom: vi.fn(), staffFrom: vi.fn(), reviewFrom: vi.fn(),
  serviceClient: vi.fn(), reviewClient: vi.fn(), insert: vi.fn(), update: vi.fn(),
  profile: { role: 'user', is_host: true, full_name: 'Ordinary Host', username: 'host' },
  membership: null as null | { role: string; is_active: boolean; custom_permissions: string[] },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock('@/lib/auth/action-auth', () => ({ getActionAuth: mocks.auth }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(), createServiceRoleClient: mocks.serviceClient,
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.reviewClient }))

import { createHostedTrip } from './hosting'
import { createServiceListing } from './admin-service-listings'

const tripInput: Parameters<typeof createHostedTrip>[0] = {
  title: 'Community trip', destination_id: 'destination-id', description: 'A trip',
  price_paise: 10000, duration_days: 2, trip_days: 2, trip_nights: 1,
  exclude_first_day_travel: false, departure_time: 'morning', return_time: 'evening',
  departure_dates: ['2026-12-01'], return_dates: ['2026-12-02'], max_group_size: 8,
  difficulty: 'easy', includes: [], images: ['https://example.com/trip.jpg'], join_preferences: {},
}
const serviceInput: Parameters<typeof createServiceListing>[0] = {
  title: 'Staff listing', slug: 'staff-listing', description: 'A listing', short_description: null,
  type: 'stays', price_paise: 10000, unit: 'per_night', destination_ids: ['destination-id'],
  location: 'Location', images: ['https://example.com/stay.jpg'], amenities: [], tags: [], metadata: null,
}

// Fluent query mock keeps user, authorized staff, and review clients observable separately.
function query(table: string, scope: 'user' | 'staff' | 'review') {
  let columns = ''
  let inserted = false
  const result = () => ({
    data: table === 'profiles' ? (scope === 'review' ? [{ id: 'admin-id' }] : mocks.profile)
      : table === 'team_members' ? mocks.membership
      : table === 'destinations' ? [{ id: 'destination-id' }]
      : inserted && ['packages', 'service_listings'].includes(table) ? { id: 'listing-id', slug: 'created-slug' }
      : null,
    error: null,
  })
  const chain = {
    select: vi.fn((value: string) => { columns = value; return chain }),
    eq: vi.fn(() => chain), in: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result()),
    single: vi.fn(async () => result()),
    insert: vi.fn((payload: unknown) => { inserted = true; mocks.insert(scope, table, payload); return chain }),
    update: vi.fn((payload: unknown) => { mocks.update(scope, table, payload); return chain }),
    then: (resolve: (value: ReturnType<typeof result>) => unknown) => {
      // Verify the staff path never performs the ordinary host name query.
      if (table === 'profiles' && scope === 'staff' && columns === 'full_name, username') {
        throw new Error('Staff creation must not query a host name for review')
      }
      return Promise.resolve(resolve(result()))
    },
  }
  return chain
}

describe('staff-created listing approval actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.profile = { role: 'user', is_host: true, full_name: 'Ordinary Host', username: 'host' }
    mocks.membership = null
    mocks.auth.mockResolvedValue({ user: { id: 'actor-id' }, supabase: { from: mocks.userFrom } })
    mocks.userFrom.mockImplementation(table => query(table, 'user'))
    mocks.staffFrom.mockImplementation(table => query(table, 'staff'))
    mocks.reviewFrom.mockImplementation(table => query(table, 'review'))
    mocks.serviceClient.mockReturnValue({ from: mocks.staffFrom, rpc: mocks.rpc })
    mocks.reviewClient.mockReturnValue({ from: mocks.reviewFrom })
    mocks.rpc.mockResolvedValue({ data: { id: 'listing-id', slug: 'created-slug' }, error: null })
  })

  it.each(['admin', 'host_onboarding_staff'])('%s trip creation is pre-approved and skips all review code and phone publication', async role => {
    mocks.profile.role = role
    mocks.profile.is_host = false
    expect(await createHostedTrip({ ...tripInput, host_contact: { email: ' HOST@Example.com ' } }))
      .toEqual({ success: true, slug: 'created-slug' })
    expect(mocks.rpc).toHaveBeenCalledWith('create_delegated_host_listing', {
      p_kind: 'trip', p_staff_id: 'actor-id', p_contact: { email: 'host@example.com', phone: null, name: null },
      p_listing: expect.objectContaining({ moderation_status: 'approved', is_active: true }),
    })
    expect(mocks.userFrom).not.toHaveBeenCalled()
    expect(mocks.staffFrom.mock.calls.map(([table]) => table)).toEqual(['profiles', 'team_members'])
    expect(mocks.reviewClient).not.toHaveBeenCalled()
    expect(mocks.reviewFrom).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('ordinary host creation remains pending/inactive, notifies admins, and publishes profile phone', async () => {
    const result = await createHostedTrip({ ...tripInput, ...{ moderation_status: 'approved', is_active: true } })
    expect(result).toEqual({ success: true, slug: 'created-slug' })
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.insert).toHaveBeenCalledWith('user', 'packages', expect.objectContaining({
      host_id: 'actor-id', moderation_status: 'pending', is_active: false,
    }))
    expect(mocks.reviewClient).toHaveBeenCalledOnce()
    expect(mocks.insert).toHaveBeenCalledWith('review', 'notifications', {
      user_id: 'admin-id', type: 'booking', title: 'New Community Trip for Review',
      body: 'Ordinary Host submitted "Community trip" for moderation.', link: '/admin/community-trips',
    })
    expect(mocks.update).toHaveBeenCalledWith('user', 'profiles', { phone_public: true })
  })

  it.each(['stays', 'activities', 'rentals', 'getting_around'] as const)('staff %s contact creation overrides frontend status/activity flags', async type => {
    mocks.profile.role = 'host_onboarding_staff'
    await createServiceListing({
      ...serviceInput, type, status: 'rejected', is_active: true, host_contact: { phone: '9876543210' },
    })
    expect(mocks.rpc).toHaveBeenCalledWith('create_delegated_host_listing', {
      p_kind: 'service', p_staff_id: 'actor-id', p_contact: { email: null, phone: '+919876543210', name: null },
      p_listing: expect.objectContaining({ type, status: 'approved', is_active: true }),
    })
    expect(mocks.insert).toHaveBeenCalledWith('staff', 'audit_logs', expect.objectContaining({
      admin_id: 'actor-id', action: 'CREATE_SERVICE_LISTING', target_id: 'listing-id',
    }))
    expect(mocks.reviewClient).not.toHaveBeenCalled()
  })

  it('non-contact admin service creation preserves the existing direct-host payload', async () => {
    mocks.profile.role = 'admin'
    await createServiceListing({ ...serviceInput, host_id: 'chosen-host', status: 'pending', is_active: false })
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.insert).toHaveBeenCalledWith('staff', 'service_listings', expect.objectContaining({
      host_id: 'chosen-host', status: 'pending', is_active: false,
    }))
  })

  it('allows active onboarding membership when profile role is not synced', async () => {
    mocks.profile.is_host = false
    mocks.membership = { role: 'host_onboarding_staff', is_active: true, custom_permissions: [] }
    await createHostedTrip({ ...tripInput, host_contact: { email: 'host@example.com' } })
    await createServiceListing({ ...serviceInput, host_contact: { email: 'host@example.com' } })
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
  })

  it('requires community_trips permission for custom-role delegated trips', async () => {
    mocks.profile.role = 'custom'
    mocks.profile.is_host = false
    mocks.membership = { role: 'custom', is_active: true, custom_permissions: ['community_trips'] }
    await createHostedTrip({ ...tripInput, host_contact: { email: 'host@example.com' } })
    await expect(createServiceListing({ ...serviceInput, host_contact: { email: 'host@example.com' } }))
      .rejects.toThrow('does not have service_listings permission')
    expect(mocks.rpc).toHaveBeenCalledOnce()
  })

  it('service-only custom permission cannot create delegated trips', async () => {
    mocks.profile.role = 'custom'
    mocks.profile.is_host = false
    mocks.membership = { role: 'custom', is_active: true, custom_permissions: ['service_listings'] }
    await createServiceListing({ ...serviceInput, host_contact: { email: 'host@example.com' } })
    await expect(createHostedTrip({ ...tripInput, host_contact: { email: 'host@example.com' } }))
      .rejects.toThrow('Host verification required')
    expect(mocks.rpc).toHaveBeenCalledOnce()
  })

  it.each(['user', 'social_media_manager', 'field_person', 'chat_responder'])('denies %s delegated creation without listing permissions', async role => {
    mocks.profile.role = role
    expect(await createHostedTrip({ ...tripInput, host_contact: { email: 'host@example.com' } }))
      .toEqual({ error: 'Only authorized staff can create on behalf of a host' })
    await expect(createServiceListing({ ...serviceInput, host_contact: { email: 'host@example.com' } }))
      .rejects.toThrow('Unauthorized')
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.reviewClient).not.toHaveBeenCalled()
  })

  it('inactive onboarding membership does not authorize delegated creation', async () => {
    mocks.profile.is_host = false
    mocks.membership = { role: 'host_onboarding_staff', is_active: false, custom_permissions: [] }
    await expect(createHostedTrip({ ...tripInput, host_contact: { email: 'host@example.com' } })).rejects.toThrow('Host verification required')
    await expect(createServiceListing({ ...serviceInput, host_contact: { email: 'host@example.com' } })).rejects.toThrow('Unauthorized')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('unauthenticated requests stop before service-role database access', async () => {
    mocks.auth.mockResolvedValue({ user: null })
    await expect(createHostedTrip({ ...tripInput, host_contact: { email: 'host@example.com' } })).rejects.toThrow('Not authenticated')
    await expect(createServiceListing({ ...serviceInput, host_contact: { email: 'host@example.com' } })).rejects.toThrow('Not authenticated')
    expect(mocks.serviceClient).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('invalid contacts never reach the RPC', async () => {
    mocks.profile.role = 'admin'
    expect(await createHostedTrip({ ...tripInput, host_contact: {} })).toEqual({ error: 'Enter the host’s email or phone number' })
    await expect(createServiceListing({ ...serviceInput, host_contact: {} })).rejects.toThrow('Enter the host’s email or phone number')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('surfaces delegated RPC errors without review notifications, phone changes, or success audits', async () => {
    mocks.profile.role = 'admin'
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Database rejected listing' } })
    expect(await createHostedTrip({ ...tripInput, host_contact: { email: 'host@example.com' } }))
      .toEqual({ error: 'Database rejected listing' })
    await expect(createServiceListing({ ...serviceInput, host_contact: { email: 'host@example.com' } }))
      .rejects.toThrow('Database rejected listing')
    expect(mocks.reviewClient).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })
})