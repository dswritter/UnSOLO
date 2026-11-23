/**
 * Every bell notification should reach the phone at once, not at the next cron sweep. Rather than
 * remembering to call the dispatcher at each of the ~90 places that insert into `notifications`
 * (bookings, payments, refunds, hosting, claims…), the server Supabase clients are wrapped so an
 * insert into `notifications` schedules a push for those users right after the response.
 * Rows made by DB triggers, or outside a request, are picked up by /api/cron/push.
 */
import { after } from 'next/server'

type Row = Record<string, unknown>

/** Push pending notifications for [userIds] once this request has finished. No-op outside a request. */
export function pushSoon(userIds?: string[]) {
  // Big fan-outs (promotions) sweep without a user filter rather than a huge `in (...)` list.
  const uniq = userIds?.length ? [...new Set(userIds)] : undefined
  const ids = uniq && uniq.length <= 50 ? uniq : undefined
  try {
    after(async () => {
      try {
        const { dispatchPendingPushes } = await import('./dispatch')
        await dispatchPendingPushes({ userIds: ids, limit: 100 })
      } catch (e) {
        console.warn('[push] inline dispatch failed', (e as Error).message)
      }
    })
  } catch {
    /* not inside a request (scripts, tests): the sweep sends it */
  }
}

function userIdsOf(values: unknown): string[] {
  const rows = (Array.isArray(values) ? values : [values]) as Row[]
  return rows.map((r) => (r && typeof r.user_id === 'string' ? r.user_id : '')).filter(Boolean)
}

/** Wraps `client.from('notifications').insert(...)` so it also calls [pushSoon]. */
export function withNotificationPush<T>(client: T): T {
  const c = client as unknown as { from: (table: string) => unknown; __pushWrapped?: boolean }
  if (!c || typeof c.from !== 'function' || c.__pushWrapped) return client
  const from = c.from.bind(c)
  c.from = (table: string) => {
    const qb = from(table) as { insert?: (...a: unknown[]) => unknown }
    if (table !== 'notifications' || !qb || typeof qb.insert !== 'function') return qb
    const insert = qb.insert.bind(qb)
    qb.insert = (...args: unknown[]) => {
      const ids = userIdsOf(args[0])
      if (ids.length) pushSoon(ids)
      return insert(...args)
    }
    return qb
  }
  c.__pushWrapped = true
  return client
}
