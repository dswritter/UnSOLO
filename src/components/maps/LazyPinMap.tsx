'use client'

import dynamic from 'next/dynamic'

export type { MapPin } from './PinMap'

/** Leaflet map loaded in the browser only (no SSR). */
export const LazyPinMap = dynamic(() => import('./PinMap'), {
  ssr: false,
  loading: () => <div className="flex h-[420px] w-full items-center justify-center rounded-2xl bg-secondary text-sm text-muted-foreground">Loading map…</div>,
})
