'use server'

import { refresh } from 'next/cache'

/** Call after updating `platform_settings` so open pages pick up changes immediately. */
export async function revalidatePlatformSettingsCache(): Promise<void> {
  refresh()
}
