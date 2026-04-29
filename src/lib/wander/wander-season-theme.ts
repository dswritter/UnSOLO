import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'

import type { WanderShellSeasonId, WanderThemeMode } from './wander-season-shared'
import {
  getIndianRituSeasonIdForDate,
  normalizeManualWanderSeason,
  normalizeWanderThemeMode,
} from './wander-season-shared'

export type { WanderShellSeasonId, WanderThemeMode } from './wander-season-shared'

const SETTING_MODE = 'wander_theme_mode'
const SETTING_MANUAL = 'wander_theme_season_manual'

/** Cookie-less read for ISR cache + `revalidateTag` (public SELECT on platform_settings). */
const getWanderThemeSettingsCached = unstable_cache(
  async (): Promise<{ mode: WanderThemeMode; manual: Exclude<WanderShellSeasonId, 'default'> | null }> => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
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
  },
  ['platform-wander-theme-settings-row'],
  { tags: ['wander-shell-theme'] },
)

/**
 * Resolved shell season: settings are cached; **auto** mode still uses the current date each request.
 */
export async function getResolvedWanderShellSeason(): Promise<WanderShellSeasonId> {
  const { mode, manual } = await getWanderThemeSettingsCached()
  if (mode === 'default') return 'default'
  if (mode === 'manual') return manual ?? 'default'
  return getIndianRituSeasonIdForDate(new Date())
}

export async function fetchWanderThemePlatformSettings(): Promise<{
  mode: WanderThemeMode
  manual: Exclude<WanderShellSeasonId, 'default'> | null
}> {
  return getWanderThemeSettingsCached()
}
