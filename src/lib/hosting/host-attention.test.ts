import { describe, expect, it } from 'vitest'
import { hostAttentionItems, hostUpcomingDepartures, type HostAttentionTrip } from './host-attention'

const trip = (over: Partial<HostAttentionTrip>): HostAttentionTrip => ({
  id: 't1', title: 'Kuari Pass', moderation_status: 'approved', pending_requests: 0, departure_dates: [], ...over,
})

describe('hostAttentionItems', () => {
  it('lists payout, join requests and rejected listings', () => {
    const items = hostAttentionItems({
      trips: [trip({ pending_requests: 2 }), trip({ id: 't2', title: 'Chopta', moderation_status: 'rejected' })],
      serviceListings: [{ id: 's1', title: 'Riverside stay', status: 'rejected' }],
      payoutConfigured: false,
    })
    expect(items.map((i) => i.id)).toEqual(['payout', 'req-t1', 'rej-t2', 'svc-s1'])
    expect(items[1].text).toBe('2 join requests waiting on Kuari Pass')
  })

  it('is empty when nothing needs the host', () => {
    expect(hostAttentionItems({ trips: [trip({})], serviceListings: [], payoutConfigured: true })).toEqual([])
  })
})

describe('hostUpcomingDepartures', () => {
  it('returns open future dates across trips, soonest first', () => {
    const out = hostUpcomingDepartures([
      trip({ departure_dates: ['2026-11-06', '2026-10-01', '2026-10-23'], departure_dates_closed: ['2026-11-06'] }),
      trip({ id: 't2', title: 'Chopta', departure_dates: ['2026-10-30'] }),
    ], '2026-10-16')
    expect(out.map((d) => `${d.tripId}:${d.date}`)).toEqual(['t1:2026-10-23', 't2:2026-10-30'])
  })
})
