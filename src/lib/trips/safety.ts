import type { SupabaseClient } from '@supabase/supabase-js'
import { getResend } from '@/lib/resend/client'

type Row = Record<string, unknown>

/** Everyone on the UnSOLO team (staff roles and active team members). */
export async function staffIds(svc: SupabaseClient): Promise<string[]> {
  const [{ data: p }, { data: t }] = await Promise.all([
    svc.from('profiles').select('id').neq('role', 'user').limit(50),
    svc.from('team_members').select('user_id').eq('is_active', true).limit(50),
  ])
  return [...new Set([...((p ?? []) as Row[]).map((r) => String(r.id)), ...((t ?? []) as Row[]).map((r) => String(r.user_id))])]
}

export async function notify(svc: SupabaseClient, userIds: string[], n: { type: string; title: string; body?: string | null; link?: string | null; metadata?: Record<string, unknown> }) {
  await Promise.all([...new Set(userIds)].map((id) => svc.rpc('create_notification', {
    p_user_id: id, p_type: n.type, p_title: n.title, p_body: n.body ?? null, p_link: n.link ?? null, p_metadata: n.metadata ?? {},
  })))
}

/**
 * A transactional SMS through 2factor. Indian DLT rules need an approved template, so this only
 * sends once TWOFACTOR_SOS_TEMPLATE (with VAR1 name, VAR2 trip, VAR3 map link) and
 * TWOFACTOR_SENDER_ID are set.
 */
export async function sendSosSms(phone: string, vars: [string, string, string]): Promise<'sent' | 'not_configured' | 'failed'> {
  const key = process.env.TWOFACTOR_API_KEY, template = process.env.TWOFACTOR_SOS_TEMPLATE, sender = process.env.TWOFACTOR_SENDER_ID
  if (!key || !template || !sender) return 'not_configured'
  const to = phone.replace(/\D/g, '').replace(/^0+/, '')
  if (to.length < 10) return 'failed'
  try {
    const body = new URLSearchParams({ module: 'TRANS_SMS', apikey: key, to: to.length === 10 ? `91${to}` : to, from: sender, templatename: template,
      var1: vars[0].slice(0, 30), var2: vars[1].slice(0, 30), var3: vars[2] })
    const r = await fetch('https://2factor.in/API/R1/', { method: 'POST', body })
    const j = (await r.json().catch(() => ({}))) as { Status?: string }
    return j.Status === 'Success' ? 'sent' : 'failed'
  } catch { return 'failed' }
}

export function mapLink(lat: number | null | undefined, lng: number | null | undefined): string | null {
  return lat != null && lng != null ? `https://maps.google.com/?q=${lat.toFixed(5)},${lng.toFixed(5)}` : null
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)

/** The SOS email to the team inbox. */
export async function emailSos(a: { name: string; username: string; phone: string | null; trip: string | null; map: string | null; note: string | null; at: string }) {
  const to = process.env.SOS_ALERT_EMAIL || 'hello@unsolo.in'
  const from = process.env.RESEND_FROM_EMAIL ?? (process.env.NODE_ENV === 'production' ? 'hello@unsolo.in' : 'onboarding@resend.dev')
  const rows = [
    ['Traveller', `${esc(a.name)} (@${esc(a.username)})`], ['Phone', esc(a.phone ?? '—')], ['Trip', esc(a.trip ?? '—')],
    ['Location', a.map ? `<a href="${esc(a.map)}">${esc(a.map)}</a>` : 'Not shared'], ['Note', esc(a.note ?? '—')], ['Time', esc(a.at)],
  ].map(([k, v]) => `<tr><td style="padding:6px 10px;font-weight:bold">${k}</td><td style="padding:6px 10px">${v}</td></tr>`).join('')
  await getResend().emails.send({
    from: `UnSOLO SOS <${from}>`, to, subject: `SOS: ${a.name}${a.trip ? ` on ${a.trip}` : ''}`,
    html: `<div style="font-family:sans-serif"><h2 style="color:#c62828">SOS from a traveller</h2><table>${rows}</table><p>Call them first, then the host.</p></div>`,
  })
}
