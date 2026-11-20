import { createPublicClient } from '@/lib/supabase/public-client'
import { ok, route } from '@/lib/api/http'
import { UPLOAD_CLIENT_MAX_BYTES, UPLOAD_CLIENT_MAX_EDGE } from '@/lib/images/limits'

const KEYS = ['tribe_enabled', 'tribe_rollout_percent', 'tribe_posting_enabled', 'host_offers_enabled', 'push_enabled',
  'min_app_version_android', 'min_app_version_ios', 'support_whatsapp_number'] as const

/** Feature flags + client bootstrap. Apps call this on launch and every 15 minutes. */
export const GET = route(async (req: Request) => {
  const db = createPublicClient()
  const { data } = await db.from('platform_settings').select('key, value').in('key', [...KEYS])
  const s = new Map((data ?? []).map((r) => [r.key as string, String(r.value)]))
  const flag = (k: string, d = true) => (s.has(k) ? s.get(k) === 'true' : d)
  return ok({
    flags: {
      tribeEnabled: flag('tribe_enabled'),
      tribeRolloutPercent: Number(s.get('tribe_rollout_percent') ?? 100),
      tribePostingEnabled: flag('tribe_posting_enabled'),
      hostOffersEnabled: flag('host_offers_enabled'),
      pushEnabled: flag('push_enabled'),
    },
    minAppVersion: {
      android: Number(s.get('min_app_version_android') ?? 1),
      ios: Number(s.get('min_app_version_ios') ?? 1),
    },
    supabase: { url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '' },
    upload: { maxBytes: UPLOAD_CLIENT_MAX_BYTES, maxEdge: UPLOAD_CLIENT_MAX_EDGE },
    webPushPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
    support: { whatsapp: s.get('support_whatsapp_number') ?? null, email: process.env.SUPPORT_EMAIL ?? null },
  }, { cache: 'public', req })
})
