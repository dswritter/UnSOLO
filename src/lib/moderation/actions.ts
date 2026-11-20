import type { SupabaseClient } from '@supabase/supabase-js'

export const MODERATION_ACTIONS = ['hide', 'remove', 'restore', 'warn', 'mute', 'suspend', 'ban', 'dismiss'] as const
export type ModerationAction = (typeof MODERATION_ACTIONS)[number]

const SANCTION_DAYS: Partial<Record<ModerationAction, number | null>> = { warn: null, mute: 7, suspend: 30, ban: null }

const REASON_COPY: Record<string, string> = {
  spam: 'spam', scam_money: 'asking for money outside UnSOLO', harassment: 'harassment', unsafe_meetup: 'an unsafe meetup',
  fake_profile: 'a fake profile', hate: 'hate speech', sexual: 'sexual content', other: 'our community rules',
}

/**
 * Applies one staff decision to a report: changes the content/user, records the action, resolves
 * every open report on the same target, and tells the affected user why + how to appeal.
 */
export async function applyModerationAction(
  svc: SupabaseClient,
  a: { reportId: string; actorId: string; actorRole: string; action: ModerationAction; note: string },
): Promise<{ state: 'actioned' | 'dismissed' }> {
  const { data: report, error } = await svc.from('reports').select('*').eq('id', a.reportId).single()
  if (error || !report) throw new Error('report not found')
  if (a.action === 'ban' && a.actorRole !== 'admin') throw Object.assign(new Error('Only admins can ban'), { code: '42501' })

  const t = report.target_type as 'post' | 'comment' | 'user' | 'message'
  const targetId = report.target_id as string
  const targetUser = report.target_user_id as string | null

  if (a.action === 'hide' || a.action === 'remove' || a.action === 'restore') {
    const status = a.action === 'hide' ? 'hidden' : a.action === 'remove' ? 'removed' : 'live'
    if (t === 'post') await svc.from('posts').update({ status }).eq('id', targetId)
    else if (t === 'comment') await svc.from('post_comments').update({ status }).eq('id', targetId)
    else if (t === 'message' && a.action !== 'restore') await svc.from('messages').delete().eq('id', targetId)
  }
  if (targetUser && a.action in SANCTION_DAYS) {
    const days = SANCTION_DAYS[a.action]
    await svc.from('user_sanctions').insert({
      user_id: targetUser, kind: a.action, reason: a.note, created_by: a.actorId,
      until: days ? new Date(Date.now() + days * 86400_000).toISOString() : null,
    })
  }

  const state = a.action === 'dismiss' ? 'dismissed' : 'actioned'
  const now = new Date().toISOString()
  await Promise.all([
    svc.from('moderation_actions').insert({ report_id: a.reportId, actor_id: a.actorId, target_type: t, target_id: targetId, action: a.action, note: a.note }),
    svc.from('reports').update({ state, resolution: a.note, resolved_at: now, assigned_to: a.actorId })
      .eq('target_type', t).eq('target_id', targetId).in('state', ['open', 'in_review']),
    svc.from('audit_logs').insert({ admin_id: a.actorId, action: `moderation.${a.action}`, target_type: t, target_id: targetId, details: { report_id: a.reportId, note: a.note } }),
  ])

  if (targetUser && a.action !== 'dismiss' && a.action !== 'restore') {
    const what = t === 'user' ? 'your account' : `your ${t}`
    const outcome: Record<string, string> = {
      hide: `We hid ${what} while we review it`, remove: `We removed ${what}`, warn: 'A warning on your account',
      mute: 'You can’t post or comment for 7 days', suspend: 'Your account is suspended for 30 days', ban: 'Your account has been closed',
    }
    await svc.from('notifications').insert({
      user_id: targetUser, type: 'moderation', title: outcome[a.action] ?? 'A moderation decision',
      body: `Reason: ${REASON_COPY[String(report.reason)] ?? 'our community rules'}. Think this is wrong? Reply from Help → Appeal within 15 days.`,
      link: '/profile', metadata: { category: 'system', report_id: a.reportId, action: a.action },
    })
  }
  return { state }
}
