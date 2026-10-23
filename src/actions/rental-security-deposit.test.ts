import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>
const state = vi.hoisted(() => ({
  booking: null as Row | null, earnings: [] as Row[], siblings: [] as Row[], listingHost: 'host' as string | null,
  updates: [] as Array<{ table: string; values: Row }>, role: 'admin', refund: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/refunds/razorpay', () => ({ refundAcrossPayments: state.refund }))

function query(table: string) {
  const filters: Record<string, unknown> = {}
  let pendingUpdate: Row | null = null
  let inIds: string[] | null = null
  const result = () => {
    if (table === 'profiles') return { data: { role: state.role } }
    if (table === 'team_members') return { data: null }
    if (table === 'service_listings') return { data: { host_id: state.listingHost } }
    if (table === 'host_earnings') {
      const row = inIds ? state.earnings.find(e => inIds!.includes(e.booking_id as string))
        : filters.id ? state.earnings.find(e => e.id === filters.id) : state.earnings.find(e => e.booking_id === filters.booking_id)
      return { data: row ?? null }
    }
    if (table === 'bookings') {
      if (filters.razorpay_order_id) return { data: state.siblings }
      if (pendingUpdate) {
        if (filters.security_deposit_status === 'held' && state.booking!.security_deposit_status !== 'held') return { data: null }
        Object.assign(state.booking!, pendingUpdate)
        return { data: { id: state.booking!.id } }
      }
      return { data: state.booking }
    }
    return { data: null }
  }
  const c: Record<string, unknown> = {}
  Object.assign(c, {
    select: () => c, limit: () => c,
    eq: (k: string, v: unknown) => { filters[k] = v; return c },
    in: (_k: string, v: string[]) => { inIds = v; return c },
    update: (values: Row) => { pendingUpdate = values; state.updates.push({ table, values }); return c },
    insert: () => c,
    maybeSingle: async () => result(),
    then: (resolve: (v: unknown) => unknown) => resolve(result()),
  })
  return c
}
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'staff' } }, error: null }) } }),
  createServiceRoleClient: () => ({ from: query }),
}))

import { settleRentalSecurityDeposit } from './rental-security-deposit'

beforeEach(() => {
  state.booking = {
    id: 'b2', user_id: 'u', status: 'confirmed', service_listing_id: 'l', razorpay_order_id: 'order',
    razorpay_payment_id: 'pay_1', security_deposit_paise: 200000, security_deposit_status: 'held',
  }
  state.earnings = [{ id: 'e1', booking_id: 'b1', host_paise: 500000 }]
  state.siblings = [{ id: 'b1' }, { id: 'b2' }]
  state.listingHost = 'host'
  state.updates = []
  state.role = 'admin'
  state.refund.mockReset().mockResolvedValue({ ok: true, refundIds: ['rf'] })
})

describe('settle rental security deposit', () => {
  it('refunds the full deposit against the booking payment', async () => {
    expect(await settleRentalSecurityDeposit('b2', 0)).toEqual({ success: true, refundPaise: 200000 })
    expect(state.refund).toHaveBeenCalledWith([{ id: 'pay_1', amount: 200000 }], 200000, expect.any(Object))
    expect(state.booking!.security_deposit_status).toBe('refunded')
  })

  it('credits a kept amount to the shared cart earnings row', async () => {
    expect(await settleRentalSecurityDeposit('b2', 50000, 'Late return')).toEqual({ success: true, refundPaise: 150000 })
    expect(state.updates).toContainEqual({ table: 'host_earnings', values: { host_paise: 550000 } })
  })

  it('refuses to keep money when the host earnings row cannot be found, before refunding', async () => {
    state.earnings = []
    expect(await settleRentalSecurityDeposit('b2', 50000, 'Damage')).toMatchObject({ error: expect.stringContaining('not found') })
    expect(state.refund).not.toHaveBeenCalled()
    expect(state.booking!.security_deposit_status).toBe('held')
  })

  it('cannot settle twice and restores the hold if Razorpay fails', async () => {
    state.refund.mockResolvedValue({ ok: false, error: 'Gateway down', refundIds: [] })
    expect(await settleRentalSecurityDeposit('b2', 0)).toEqual({ error: 'Gateway down' })
    expect(state.booking!.security_deposit_status).toBe('held')
    state.refund.mockResolvedValue({ ok: true, refundIds: ['rf'] })
    await settleRentalSecurityDeposit('b2', 0)
    expect(await settleRentalSecurityDeposit('b2', 0)).toEqual({ error: 'This deposit has already been settled' })
  })

  it('requires the bookings permission', async () => {
    state.role = 'host_onboarding_staff'
    expect(await settleRentalSecurityDeposit('b2', 0)).toEqual({ error: 'Unauthorized' })
    expect(state.refund).not.toHaveBeenCalled()
  })
})
