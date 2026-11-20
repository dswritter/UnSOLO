'use client'

import { useState } from 'react'
import type { Media } from '@/lib/tribe/models'
import { cn } from '@/lib/utils'

/**
 * Low-res first, then high: paints the LQIP (or the 320px thumb) immediately, blurred, then fades
 * the full image in once decoded. In data-saver mode only the thumb is fetched.
 */
export function ProgressiveImage({ media, alt, className, sizes, dataSaver, priority }: {
  media: Media
  alt: string
  className?: string
  sizes?: string
  dataSaver?: boolean
  priority?: boolean
}) {
  const [loaded, setLoaded] = useState(false)
  const low = media.lqip ?? media.thumbUrl
  const high = dataSaver ? media.thumbUrl ?? media.url : media.url
  return (
    <div className={cn('pc-img', className)} style={media.width && media.height ? { aspectRatio: `${media.width} / ${media.height}` } : undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {low && low !== high && <img className="pc-img-low" src={low} alt="" aria-hidden decoding="async" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={cn('pc-img-high', (loaded || !low) && 'is-loaded')}
        src={high}
        alt={alt}
        sizes={sizes}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
        onLoad={() => setLoaded(true)}
      />
    </div>
  )
}
