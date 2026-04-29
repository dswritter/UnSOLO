/** Client-safe wander season types & validation (no server / Supabase imports). */

export type WanderShellSeasonId =
  | 'default'
  | 'spring'
  | 'summer'
  | 'monsoon'
  | 'autumn'
  | 'prewinter'
  | 'winter'

export type WanderThemeMode = 'default' | 'auto' | 'manual'

const SEASON_IDS_NO_DEFAULT: Exclude<WanderShellSeasonId, 'default'>[] = [
  'spring',
  'summer',
  'monsoon',
  'autumn',
  'prewinter',
  'winter',
]

function calendarInTimeZone(date: Date, timeZone: string): { month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const month = Number(parts.find((p) => p.type === 'month')?.value ?? '1')
  const day = Number(parts.find((p) => p.type === 'day')?.value ?? '1')
  return { month, day }
}

/**
 * Northern Indian six seasons (Ritu), calendar dates in Asia/Kolkata.
 * Hemanta ≈ pre-winter; Shishira ≈ winter.
 */
export function getIndianRituSeasonIdForDate(date: Date): Exclude<WanderShellSeasonId, 'default'> {
  const { month: m, day: d } = calendarInTimeZone(date, 'Asia/Kolkata')

  if ((m === 11 && d >= 15) || m === 12 || (m === 1 && d <= 14)) return 'prewinter'
  if ((m === 1 && d >= 15) || m === 2 || (m === 3 && d <= 14)) return 'winter'
  if ((m === 3 && d >= 15) || m === 4 || (m === 5 && d <= 14)) return 'spring'
  if ((m === 5 && d >= 15) || m === 6 || (m === 7 && d <= 14)) return 'summer'
  if ((m === 7 && d >= 15) || m === 8 || (m === 9 && d <= 14)) return 'monsoon'
  return 'autumn'
}

export function normalizeWanderThemeMode(raw: string | undefined | null): WanderThemeMode {
  const v = (raw ?? 'default').trim().toLowerCase()
  if (v === 'auto' || v === 'manual') return v
  return 'default'
}

export function normalizeManualWanderSeason(
  raw: string | undefined | null,
): Exclude<WanderShellSeasonId, 'default'> | null {
  const v = (raw ?? '').trim().toLowerCase()
  if (SEASON_IDS_NO_DEFAULT.includes(v as Exclude<WanderShellSeasonId, 'default'>)) {
    return v as Exclude<WanderShellSeasonId, 'default'>
  }
  return null
}

export function isValidWanderThemeModeValue(v: string): v is WanderThemeMode {
  return v === 'default' || v === 'auto' || v === 'manual'
}

export function isValidManualSeasonValue(v: string): v is Exclude<WanderShellSeasonId, 'default'> {
  return SEASON_IDS_NO_DEFAULT.includes(v as Exclude<WanderShellSeasonId, 'default'>)
}
