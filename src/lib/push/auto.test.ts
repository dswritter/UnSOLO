import { describe, expect, it, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({ after: vi.fn(), dispatch: vi.fn(async () => ({ sent: 0, claimed: 0 })) }))
vi.mock('next/server', () => ({ after: m.after }))
vi.mock('./dispatch', () => ({ dispatchPendingPushes: m.dispatch }))

import { withNotificationPush } from './auto'

function fakeClient() {
  const insert = vi.fn(() => 'inserted')
  return { insert, client: { from: (t: string) => ({ table: t, insert, select: () => 'selected' }) } }
}

beforeEach(() => { m.after.mockReset(); m.dispatch.mockClear() })

describe('withNotificationPush', () => {
  it('schedules a push for the users of a notifications insert', async () => {
    const { client, insert } = fakeClient()
    const c = withNotificationPush(client)
    expect(c.from('notifications').insert([{ user_id: 'a' }, { user_id: 'b' }, { user_id: 'a' }])).toBe('inserted')
    expect(insert).toHaveBeenCalledOnce()
    expect(m.after).toHaveBeenCalledOnce()
    await (m.after.mock.calls[0][0] as () => Promise<void>)()
    expect(m.dispatch).toHaveBeenCalledWith({ userIds: ['a', 'b'], limit: 100 })
  })

  it('leaves other tables alone', () => {
    const { client } = fakeClient()
    withNotificationPush(client).from('bookings').insert({ user_id: 'a' })
    expect(m.after).not.toHaveBeenCalled()
  })

  it('sweeps without a user filter for big fan-outs, and survives being outside a request', async () => {
    const { client } = fakeClient()
    withNotificationPush(client).from('notifications').insert(Array.from({ length: 60 }, (_, i) => ({ user_id: `u${i}` })))
    await (m.after.mock.calls[0][0] as () => Promise<void>)()
    expect(m.dispatch).toHaveBeenCalledWith({ userIds: undefined, limit: 100 })
    m.after.mockImplementation(() => { throw new Error('outside request') })
    expect(() => withNotificationPush(fakeClient().client).from('notifications').insert({ user_id: 'x' })).not.toThrow()
  })
})
