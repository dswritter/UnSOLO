import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ orderCreate: vi.fn(), inserts: [] as Record<string, unknown>[], extrasError: null as unknown }))
vi.mock('razorpay', () => ({ default: class { orders = { create: mocks.orderCreate } } }))
vi.mock('@/lib/service-item-unavailability', () => ({ itemHasDateBlock: vi.fn(async () => false) }))
vi.mock('@/lib/platform-settings', () => ({ getPlatformFeePercentByCategory: vi.fn() }))
vi.mock('@/lib/resend/emails', () => ({ sendServiceBookingConfirmedEmail: vi.fn() }))
vi.mock('@/lib/checkout-promos', () => ({ incrementPromoOfferUsed: vi.fn(), validateScopedPromoCode: vi.fn() }))

const bike = {
  id: 'bike', price_paise: 130000, unit: 'per_day', quantity_available: 5, max_per_booking: 2,
  is_active: true, is_out_of_stock: false, service_listing_id: 'listing',
}
const extras = { id: 'bike', full_day_price_paise: 160000, daytime_price_paise: 75000, daytime_start: '08:00', daytime_end: '21:00', security_deposit_paise: 200000 }

function chain(table: string) {
  let inQuery = false
  const c: Record<string, unknown> = {}
  Object.assign(c, {
    select: () => c, eq: () => c,
    in: () => { inQuery = true; return c },
    single: async () => table === 'service_listings'
      ? { data: { id: 'listing', type: 'rentals', price_paise: 130000, host_id: 'host', title: 'Bikes' } }
      : table === 'bookings' ? { data: { id: `b${mocks.inserts.length}` } } : { data: bike },
    insert: (row: Record<string, unknown>) => { mocks.inserts.push(row); return c },
    then: (resolve: (v: unknown) => unknown) => resolve(inQuery
      ? { data: mocks.extrasError ? null : [extras], error: mocks.extrasError } : { data: null }),
  })
  return c
}
vi.mock('@/lib/auth/action-auth', () => ({
  getActionAuth: async () => ({ user: { id: 'u1', email: 'u@example.com' }, supabase: { from: chain } }),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { createRentalCartOrder } from './service-listing-booking'

beforeEach(() => {
  mocks.inserts.length = 0
  mocks.extrasError = null
  mocks.orderCreate.mockReset().mockResolvedValue({ id: 'order_1' })
})

const dates = { check_in_date: '2099-01-01', rental_days: 2, applyCredits: false }

describe('rental cart pricing', () => {
  it('charges the chosen 24-hour rate plus the refundable deposit', async () => {
    const res = await createRentalCartOrder('listing', [{ itemId: 'bike', quantity: 1, rate: 'full_day' }], dates)
    expect(res).toMatchObject({ amount: 160000 * 2 + 200000 })
    expect(mocks.orderCreate).toHaveBeenCalledWith(expect.objectContaining({ amount: 520000 }))
    expect(mocks.inserts[0]).toMatchObject({
      gross_paise: 320000, amount_paise: 320000, rental_rate_option: 'full_day',
      security_deposit_paise: 200000, security_deposit_status: 'held',
    })
  })

  it('records the daytime window on the booking', async () => {
    await createRentalCartOrder('listing', [{ itemId: 'bike', quantity: 2, rate: 'daytime' }], dates)
    expect(mocks.inserts[0]).toMatchObject({
      gross_paise: 75000 * 2 * 2, security_deposit_paise: 400000, booking_slot_start: '08:00', booking_slot_end: '21:00',
    })
  })

  it('keeps standard rentals unchanged and omits new columns when unused', async () => {
    mocks.extrasError = { message: 'column does not exist' }
    const res = await createRentalCartOrder('listing', [{ itemId: 'bike', quantity: 1 }], dates)
    expect(res).toMatchObject({ amount: 260000 })
    expect(mocks.inserts[0]).not.toHaveProperty('security_deposit_paise')
    expect(mocks.inserts[0]).not.toHaveProperty('rental_rate_option')
  })

  it('rejects a rate the item does not offer', async () => {
    mocks.extrasError = { message: 'column does not exist' }
    expect(await createRentalCartOrder('listing', [{ itemId: 'bike', quantity: 1, rate: 'daytime' }], dates))
      .toEqual({ error: 'This rate is not offered for the selected item' })
    expect(mocks.orderCreate).not.toHaveBeenCalled()
  })
})
