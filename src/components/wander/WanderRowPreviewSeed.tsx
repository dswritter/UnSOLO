'use client'

import { useEffect } from 'react'
import {
  writeListingPreview,
  type ServicePreview,
  type TripsPreview,
} from '@/lib/explore/listing-preview-cache'

type Props =
  | { kind: 'trips'; data: TripsPreview }
  | { kind: 'stays' | 'activities' | 'rentals'; data: ServicePreview }

/** Remembers a painted home row so "View all" and revisits can render it instantly. */
export function WanderRowPreviewSeed(props: Props) {
  useEffect(() => {
    if (props.kind === 'trips') writeListingPreview('trips', props.data)
    else writeListingPreview(props.kind, props.data)
  }, [props.kind, props.data])
  return null
}
