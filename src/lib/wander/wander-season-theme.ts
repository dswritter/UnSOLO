import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { WanderShellSeasonId, WanderThemeMode } from './wander-season-shared'
import {
  getIndianRituSeasonIdForDate,
  normalizeManualWanderSeason,
  normalizeWanderThemeMode,
} from './wander-season-shared'

export type { WanderShellSeasonId, WanderThemeMode } from './wander-season-shared'

const SETTING_MODE = 'wander_theme_mode'
const SETTING_MANUAL = 'wander_theme_season_manual'

/**
 * Resolves the active wander shell season from `platform_settings` (cached per request).
 */
export const getResolvedWanderShellSeason = cache(async (): Promise<WanderShellSeasonId> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('platform_settings')
    .select('key,value')
    .in('key', [SETTING_MODE, SETTING_MANUAL])

  const map: Record<string, string> = {}
  for (const row of data ?? []) {
    map[row.key] = row.value
  }

  const mode = normalizeWanderThemeMode(map[SETTING_MODE])
  if (mode === 'default') return 'default'

  if (mode === 'manual') {
    const picked = normalizeManualWanderSeason(map[SETTING_MANUAL])
    return picked ?? 'default'
  }

  return getIndianRituSeasonIdForDate(new Date())
})

export async function fetchWanderThemePlatformSettings(): Promise<{
  mode: WanderThemeMode
  manual: Exclude<WanderShellSeasonId, 'default'> | null
}> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('platform_settings')
    .select('key,value')
    .in('key', [SETTING_MODE, SETTING_MANUAL])

  const map: Record<string, string> = {}
  for (const row of data ?? []) {
    map[row.key] = row.value
  }

  return {
    mode: normalizeWanderThemeMode(map[SETTING_MODE]),
    manual: normalizeManualWanderSeason(map[SETTING_MANUAL]),
  }
}
