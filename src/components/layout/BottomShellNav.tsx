'use client'

import { useEffect, useState } from 'react'
import { MobileBottomNav } from './MobileBottomNav'
import { AndroidNavBadge } from './AndroidNavBadge'

/**
 * Picks the right bottom-of-shell chrome based on the client (the static shell
 * can't read the user-agent server-side). On the Android webview shell we drive
 * the native tab badge; everywhere else we render the web bottom nav. Both read
 * auth from AuthProvider internally.
 *
 * Starts as the web nav so the server-rendered static shell and first client
 * render match; flips to the Android badge after mount when the UA token is present.
 */
export function BottomShellNav() {
  const [isAndroidShell, setIsAndroidShell] = useState(false)
  useEffect(() => {
    if (navigator.userAgent.includes('UnsoloAndroid')) setIsAndroidShell(true)
  }, [])

  return isAndroidShell ? <AndroidNavBadge /> : <MobileBottomNav />
}
