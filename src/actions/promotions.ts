'use server'

import { randomUUID } from 'node:crypto'
import { after } from 'next/server'
import { getActionAuth } from '@/lib/auth/action-auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { isInternalLink } from '@/lib/links'
import { dispatchPendingPushes, pushNotificationNow } from '@/lib/push/dispatch'

/**
 * Promotions: a push + an Activity item to people who turned on "Offers and news"
 * (`preferences.notify.push.marketing`, off by default). Only admins can send.
 */
export type PromoAudience = 'all' | 'booked' | 'not_booked'
export type PromoDraft = { title: string; body: string; link: string; audience: PromoAudience }
export type PromoSent = { campaign: string; title: string; body: string | null; link: string | null; audience: string; sentAt: string; recipients: number; opened: number }

const TYPE = 'promotion'

async function requireAdmin() {
  const { user } = await getActionAuth()
  if (!user) throw new Error('Not signed in')
  const svc = createServiceRoleClient()
  const { data: profile } = await svc.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') throw new Error('Only admins can send promotions')
  return { svc, userId: user.id }
}

function clean(d: PromoDraft) {
  const title = d.title.trim().slice(0, 80)
  const body = d.body.trim().slice(0, 240)
  const link = d.link.trim() || '/offers'
  if (title.length < 3) throw new Error('Add a title (at least 3 characters)')
  if (!isInternalLink(link)) throw new Error('The link must be a page on UnSOLO, like /offers or /packages/<slug>')
  if (!['all', 'booked', 'not_booked'].includes(d.audience)) throw new Error('Pick who gets it')
  return { title, body: body || null, link, audience: d.audience }
}

/** Everyone who opted in to offers, narrowed by [audience]. */
async function audienceIds(svc: ReturnType<typeof createServiceRoleClient>, audience: PromoAudience): Promise<string[]> {
  const ids: string[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await svc.from('user_preferences').select('user_id')
      .eq('notify->push->>marketing', 'true').order('user_id').range(from, from + 999)
    if (error) throw new Error(error.message)
    ids.push(...(data ?? []).map((r) => String(r.user_id)))
    if (!data || data.length < 1000) break
  }
  if (audience === 'all' || ids.length === 0) return ids
  const booked = new Set<string>()
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await svc.from('bookings').select('user_id')
      .in('user_id', ids.slice(i, i + 300)).in('status', ['confirmed', 'completed'])
    for (const r of data ?? []) booked.add(String(r.user_id))
  }
  return ids.filter((id) => (audience === 'booked' ? booked.has(id) : !booked.has(id)))
}

export async function countPromotionAudience(audience: PromoAudience): Promise<number> {
  const { svc } = await requireAdmin()
  return (await audienceIds(svc, audience)).length
}

/** Sends it to you only, whatever your own settings, so you can see how it looks. */
export async function sendTestPromotion(draft: PromoDraft): Promise<{ ok: true }> {
  const { svc, userId } = await requireAdmin()
  const d = clean(draft)
  const { data, error } = await svc.from('notifications').insert({
    user_id: userId, type: TYPE, title: d.title, body: d.body, link: d.link,
    metadata: { category: 'marketing', campaign: 'test', audience: 'test' }, pushed_at: new Date().toISOString(),
  }).select('id').single()
  if (error) throw new Error(error.message)
  await pushNotificationNow(String(data.id))
  return { ok: true }
}

export async function sendPromotion(draft: PromoDraft): Promise<{ recipients: number }> {
  const { svc, userId } = await requireAdmin()
  const d = clean(draft)
  const ids = await audienceIds(svc, d.audience)
  if (ids.length === 0) return { recipients: 0 }
  const campaign = randomUUID()
  const metadata = { category: 'marketing', campaign, audience: d.audience, sent_by: userId }
  for (let i = 0; i < ids.length; i += 500) {
    const rows = ids.slice(i, i + 500).map((user_id) => ({ user_id, type: TYPE, title: d.title, body: d.body, link: d.link, metadata }))
    const { error } = await svc.from('notifications').insert(rows)
    if (error) throw new Error(error.message)
  }
  // Pushes go out after the response; anything left is swept by /api/cron/push within minutes.
  after(async () => {
    for (let i = 0; i < 20; i++) {
      const r = await dispatchPendingPushes({ limit: 500 })
      if (r.claimed < 500) break
    }
  })
  return { recipients: ids.length }
}

/** The last sends, newest first, with how many people opened each from Activity or the push. */
export async function listPromotions(): Promise<PromoSent[]> {
  const { svc } = await requireAdmin()
  const { data } = await svc.from('notifications').select('title, body, link, metadata, is_read, created_at')
    .eq('type', TYPE).order('created_at', { ascending: false }).limit(5000)
  const by = new Map<string, PromoSent>()
  for (const r of data ?? []) {
    const m = (r.metadata ?? {}) as Record<string, unknown>
    const campaign = String(m.campaign ?? '')
    if (!campaign || campaign === 'test') continue
    const cur = by.get(campaign) ?? {
      campaign, title: String(r.title), body: (r.body as string | null) ?? null, link: (r.link as string | null) ?? null,
      audience: String(m.audience ?? 'all'), sentAt: String(r.created_at), recipients: 0, opened: 0,
    }
    cur.recipients++
    if (r.is_read) cur.opened++
    by.set(campaign, cur)
  }
  return [...by.values()].slice(0, 20)
}
