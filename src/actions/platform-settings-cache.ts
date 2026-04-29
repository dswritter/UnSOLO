'use server'

import { refresh, updateTag } from 'next/cache'

/** Call after updating `platform_settings` so wander shell theme picks up immediately (no manual refresh). */
export async function revalidatePlatformSettingsCache(): Promise<void> {
  updateTag('wander-shell-theme')
  refresh()
}
