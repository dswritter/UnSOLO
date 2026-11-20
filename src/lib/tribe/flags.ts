import type { SupabaseClient } from '@supabase/supabase-js'

export type Flags = { tribeEnabled: boolean; tribePostingEnabled: boolean; hostOffersEnabled: boolean; pushEnabled: boolean; tribeRolloutPercent: number }

export async function readFlags(db: SupabaseClient): Promise<Flags> {
  const { data } = await db.from('platform_settings').select('key, value')
    .in('key', ['tribe_enabled', 'tribe_posting_enabled', 'host_offers_enabled', 'push_enabled', 'tribe_rollout_percent'])
  const s = new Map((data ?? []).map((r) => [r.key as string, String(r.value)]))
  const f = (k: string) => s.get(k) !== 'false'
  return {
    tribeEnabled: f('tribe_enabled'),
    tribePostingEnabled: f('tribe_posting_enabled'),
    hostOffersEnabled: f('host_offers_enabled'),
    pushEnabled: f('push_enabled'),
    tribeRolloutPercent: Number(s.get('tribe_rollout_percent') ?? 100),
  }
}

/** Stable per-user bucket for percentage rollouts (0–99). */
export function rolloutBucket(userId: string): number {
  let h = 0
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0
  return h % 100
}
