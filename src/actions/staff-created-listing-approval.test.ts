import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), rpc: vi.fn(), userFrom: vi.fn(), staffFrom: vi.fn(), reviewFrom: vi.fn(),
  serviceClient: vi.fn(), reviewClient: vi.fn(), insert: vi.fn(), update: vi.fn(),
  profile: { role: 'user', is_host: true, full_name: 'Ordinary Host', username: 'host' },
  membership: null as null | { role: string; is_active: boolean; custom_permissions: string[] },
  itemsError: null as null | { message: string }, remove: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock('@/lib/auth/action-auth', () => ({ getActionAuth: mocks.auth }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(), createServiceRoleClient: mocks.serviceClient,
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.reviewClient }))

import { createHostedTrip, createHostDestination } from './hosting'
import { createServiceListing, createServiceListingForHost } from './admin-service-listings'

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
      : table === 'destinations' ? columns === 'id, name, state'
        ? { id: 'destination-id', name: 'Manali', state: 'Himachal Pradesh' }
        : [{ id: 'destination-id' }]
      : inserted && ['packages', 'service_listings'].includes(table) ? { id: 'listing-id', slug: 'created-slug' }
      : null,
    error: table === 'service_listing_items' ? mocks.itemsError : null,
  })
  const chain = {
    delete: vi.fn(() => { mocks.remove(scope, table); return chain }),
    select: vi.fn((value: string) => { columns = value; return chain }),
    eq: vi.fn(() => chain), in: vi.fn(() => chain), ilike: vi.fn(() => chain),
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
    mocks.itemsError = null
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
  it('persists an exact meeting point for staff-created trips', async () => {
    mocks.profile.role = 'admin'
    const metadata = { meeting_address: 'Manali bus station', meeting_point: { lat: 32.25, lon: 77.2, label: 'Bus station' } }
    await createHostedTrip({ ...tripInput, metadata, host_contact: { email: 'host@example.com' } })
    expect(mocks.rpc).toHaveBeenCalledWith('create_delegated_host_listing', expect.objectContaining({
      p_listing: expect.objectContaining({ metadata }),
    }))
  })
  it('allows service-only staff to use destination search without granting trip permissions', async () => {
    mocks.profile.role = 'custom'
    mocks.profile.is_host = false
    mocks.membership = { role: 'custom', is_active: true, custom_permissions: ['service_listings'] }
    expect(await createHostDestination('Manali', 'Himachal Pradesh')).toEqual({
      success: true, id: 'destination-id', name: 'Manali', state: 'Himachal Pradesh',
    })
    await expect(createHostedTrip({ ...tripInput, host_contact: { email: 'host@example.com' } }))
      .rejects.toThrow('Host verification required')
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

  describe('host-form service creation by staff', () => {
    const rentalInput: Parameters<typeof createServiceListingForHost>[0] = {
      title: 'Leh Bike Hub', description: null, short_description: null, type: 'rentals', unit: 'per_day',
      destination_ids: ['destination-id'], location: 'Main Bazaar', latitude: 34.16, longitude: 77.58,
      amenities: ['ignored'], tags: [], metadata: null, host_contact: { email: 'Host@Example.com' },
      items: [
        { name: 'Scooter', description: null, price_paise: 50000, quantity_available: 1, max_per_booking: 2, images: ['a.jpg'], unit: 'per_hour', amenities: ['Helmet'] },
        { name: 'Bike (monthly)', description: null, price_paise: 2500000, quantity_available: 1, max_per_booking: 1, images: [], unit: 'per_month', amenities: [] },
      ],
    }

    it('publishes rentals with per-item hourly and monthly units for the host contact', async () => {
      mocks.profile.role = 'host_onboarding_staff'
      expect(await createServiceListingForHost(rentalInput)).toEqual({ success: true, id: 'listing-id' })
      expect(mocks.rpc).toHaveBeenCalledWith('create_delegated_host_listing', {
        p_kind: 'service', p_staff_id: 'actor-id', p_contact: { email: 'host@example.com', phone: null, name: null },
        p_listing: expect.objectContaining({
          type: 'rentals', price_paise: 50000, unit: 'per_hour', amenities: null, images: ['a.jpg'],
          latitude: 34.16, longitude: 77.58, destination_id: 'destination-id',
        }),
      })
      expect(mocks.insert).toHaveBeenCalledWith('staff', 'service_listing_items', [
        expect.objectContaining({ service_listing_id: 'listing-id', name: 'Scooter', unit: 'per_hour', amenities: ['Helmet'], position_order: 0 }),
        expect.objectContaining({ name: 'Bike (monthly)', unit: 'per_month', position_order: 1 }),
      ])
    })

    it('stores optional 24-hour, daytime and deposit pricing only for items that add them', async () => {
      mocks.profile.role = 'admin'
      const withExtras = { ...rentalInput, items: [
        { ...rentalInput.items[0], rental_extras: { fullDayPricePaise: 160000, securityDepositPaise: 200000 } },
        rentalInput.items[1],
      ] }
      await createServiceListingForHost(withExtras)
      const rows = mocks.insert.mock.calls.find(call => call[1] === 'service_listing_items')![2] as Record<string, unknown>[]
      expect(rows[0]).toMatchObject({ full_day_price_paise: 160000, security_deposit_paise: 200000 })
      expect(rows[0]).not.toHaveProperty('daytime_price_paise')
      expect(rows[1]).not.toHaveProperty('security_deposit_paise')
      const badDaytime = { ...rentalInput, items: [{ ...rentalInput.items[0], rental_extras: { daytimePricePaise: 75000, daytimeStart: '21:00', daytimeEnd: '08:00' } }] }
      expect(await createServiceListingForHost(badDaytime)).toEqual({ error: '"Scooter": Daytime end must be after the start time' })
    })

    it('rejects items without a pricing unit and requires a host contact', async () => {
      mocks.profile.role = 'admin'
      const noUnit = { ...rentalInput, items: [{ ...rentalInput.items[0], unit: null }] }
      expect(await createServiceListingForHost(noUnit)).toEqual({ error: '"Scooter": please pick a pricing unit' })
      expect('error' in await createServiceListingForHost({ ...rentalInput, host_contact: {} })).toBe(true)
      expect(mocks.rpc).not.toHaveBeenCalled()
    })

    it('rolls back the listing when items fail and refuses staff without service permission', async () => {
      mocks.profile.role = 'admin'
      mocks.itemsError = { message: 'boom' }
      expect(await createServiceListingForHost(rentalInput)).toEqual({ error: 'Failed to save items: boom' })
      expect(mocks.remove).toHaveBeenCalledWith('staff', 'service_listings')

      mocks.profile.role = 'chat_responder'
      expect('error' in await createServiceListingForHost(rentalInput)).toBe(true)
    })
  })
})
