import type { ReactNode } from 'react'

/**
 * Wraps all `/host/*` pages: theme follows `html` / `.dark` (no forced dark).
 * Background uses a subtle primary wash so host feels distinct but stays readable
 * in light and dark (see `globals.css` `.host-app`).
 */
export function HostAppShell({ children }: { children: ReactNode }) {
  return <div className="host-app">{children}</div>
}
