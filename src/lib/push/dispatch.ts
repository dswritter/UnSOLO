/**
 * Push fan-out from `notifications` rows (pushed_at IS NULL) to every registered device,
 * honouring per-category preferences + quiet hours and the `push_enabled` kill switch.
 * Called inline via `after()` from API routes, and swept by /api/cron/push.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { rowToPreferences, isQuietNow } from '@/lib/tribe/preferences'
import { toNotification } from '@/lib/tribe/models'
import { sendFcm, fcmConfigured } from './fcm'
import { sendApns, apnsConfigured } from './apns'
import { sendWebPush, webPushConfigured, type WebPushSubscription } from './webpush'
import { isInternalLink } from '@/lib/links'

type Row = Record<string, unknown>

export type DirectPush = { title: string; body?: string | null; link?: string | null; category: string; type: string; notificationId?: string }

export async function pushEnabled(svc: SupabaseClient) {
  const { data } = await svc.from('platform_settings').select('value').eq('key', 'push_enabled').maybeSingle()
  return data?.value !== 'false'
}

async function deliver(svc: SupabaseClient, devices: Row[], n: DirectPush) {
  const gone: string[] = []
  await Promise.all(devices.map(async (d) => {
    const token = String(d.token)
    let r: 'ok' | 'gone' | 'error' = 'error'
    try {
      if (d.platform === 'android' && fcmConfigured()) {
        r = await sendFcm(token, {
          type: n.type, title: n.title, body: n.body ?? '', link: n.link ?? '', category: n.category,
          notificationId: n.notificationId ?? '',
        })
      } else if (d.platform === 'ios' && apnsConfigured()) {
        r = await sendApns(token, n)
      } else if (d.platform === 'web' && webPushConfigured()) {
        r = await sendWebPush(JSON.parse(token) as WebPushSubscription, { title: n.title, body: n.body, link: n.link, tag: n.category })
      }
    } catch (e) {
      console.warn('[push] send failed', d.platform, (e as Error).message)
    }
    if (r === 'gone') gone.push(String(d.id))
  }))
  if (gone.length) await svc.from('device_tokens').delete().in('id', gone)
}

/** Push to specific users without a bell notification (e.g. chat messages). */
export async function pushToUsers(userIds: string[], n: DirectPush) {
  if (userIds.length === 0) return
  const svc = createServiceRoleClient()
  if (!(await pushEnabled(svc))) return
  const [{ data: devices }, { data: prefs }] = await Promise.all([
    svc.from('device_tokens').select('id, user_id, platform, token').in('user_id', userIds),
    svc.from('user_preferences').select('*').in('user_id', userIds),
  ])
  const prefBy = new Map(((prefs ?? []) as Row[]).map((p) => [String(p.user_id), rowToPreferences(p)]))
  const allowed = ((devices ?? []) as Row[]).filter((d) => {
    const pref = prefBy.get(String(d.user_id)) ?? rowToPreferences(null)
    const cat = n.category as keyof typeof pref.notify.push
    return pref.notify.push[cat] !== false && !isQuietNow(pref, n.category)
  })
  await deliver(svc, allowed, n)
}

/** Pushes one notification row to all of its user's devices now, ignoring their category settings (admin test sends). */
export async function pushNotificationNow(notificationId: string) {
  const svc = createServiceRoleClient()
  const { data: r } = await svc.from('notifications').select('id, user_id, type, title, body, link, metadata, is_read, created_at')
    .eq('id', notificationId).maybeSingle()
  if (!r) return
  const n = toNotification(r as Row)
  const { data: devices } = await svc.from('device_tokens').select('id, user_id, platform, token').eq('user_id', String(r.user_id))
  await deliver(svc, (devices ?? []) as Row[], { title: n.title, body: n.body, link: n.link, category: n.category, type: n.type, notificationId: n.id })
  return (devices ?? []).length
}

/** Sends pending notifications (optionally only for some users). Marks them pushed either way. */
export async function dispatchPendingPushes(opts: { userIds?: string[]; limit?: number } = {}) {
  const svc = createServiceRoleClient()
  let q = svc.from('notifications').select('id, user_id, type, title, body, link, metadata, is_read, created_at')
    .is('pushed_at', null).gte('created_at', new Date(Date.now() - 6 * 3600_000).toISOString())
    .order('created_at', { ascending: true }).limit(opts.limit ?? 200)
  if (opts.userIds?.length) q = q.in('user_id', opts.userIds)
  const { data: rows, error } = await q
  if (error || !rows?.length) return { sent: 0, claimed: 0 }
  const ids = rows.map((r) => r.id as string)
  // Claim first so concurrent sweeps don't double-send; deliver only what this sweep claimed.
  const { data: claimedRows } = await svc.from('notifications').update({ pushed_at: new Date().toISOString() })
    .in('id', ids).is('pushed_at', null).select('id')
  const claimed = new Set((claimedRows ?? []).map((r) => r.id as string))
  if (claimed.size === 0 || !(await pushEnabled(svc))) return { sent: 0, claimed: claimed.size }

  const userIds = [...new Set(rows.map((r) => String(r.user_id)))]
  const [{ data: devices }, { data: prefs }] = await Promise.all([
    svc.from('device_tokens').select('id, user_id, platform, token').in('user_id', userIds),
    svc.from('user_preferences').select('*').in('user_id', userIds),
  ])
  const prefBy = new Map(((prefs ?? []) as Row[]).map((p) => [String(p.user_id), rowToPreferences(p)]))
  let sent = 0
  for (const r of (rows as Row[]).filter((x) => claimed.has(String(x.id)))) {
    const n = toNotification(r)
    if (n.link && !isInternalLink(n.link)) n.link = '/activity'
    const pref = prefBy.get(String(r.user_id)) ?? rowToPreferences(null)
    const pushCat = (n.category === 'system' ? 'trips' : n.category) as keyof typeof pref.notify.push
    if (pref.notify.push[pushCat] === false || isQuietNow(pref, n.category)) continue
    const mine = ((devices ?? []) as Row[]).filter((d) => d.user_id === r.user_id)
    if (mine.length === 0) continue
    await deliver(svc, mine, { title: n.title, body: n.body, link: n.link, category: n.category, type: n.type, notificationId: n.id })
    sent++
  }
  return { sent, claimed: claimed.size }
}
