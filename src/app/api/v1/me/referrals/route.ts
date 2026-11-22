import { getApiContext, requireUser } from '@/lib/api/context'
import { ok, route } from '@/lib/api/http'

type Row = Record<string, unknown>
const APP = process.env.NEXT_PUBLIC_APP_URL || 'https://unsolo.in'

/** GET /me/referrals: your invite code and link, credits earned, and who joined with it. */
export const GET = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const [{ data: p }, { data: refs }] = await Promise.all([
    ctx.db.from('profiles').select('referral_code, referral_credits_paise').eq('id', user.id).single(),
    ctx.db.from('referrals').select('status, created_at, referred:profiles!referrals_referred_id_fkey(username, full_name, avatar_url)')
      .eq('referrer_id', user.id).order('created_at', { ascending: false }).limit(100),
  ])
  const rows = (refs ?? []) as Row[]
  const code = (p?.referral_code as string | null) ?? null
  return ok({
    code,
    link: code ? `${APP}/signup?ref=${encodeURIComponent(code)}` : null,
    creditsPaise: Number(p?.referral_credits_paise ?? 0),
    total: rows.length,
    pending: rows.filter((r) => r.status === 'pending').length,
    credited: rows.filter((r) => r.status === 'credited').length,
    people: rows.map((r) => {
      const u = (r.referred ?? {}) as Row
      return { username: String(u.username ?? ''), name: String(u.full_name || u.username || 'Traveller'), avatarUrl: (u.avatar_url as string | null) ?? null, status: String(r.status) }
    }),
  }, { cache: 'private', req })
})
