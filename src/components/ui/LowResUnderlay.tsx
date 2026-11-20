import { lowResImageUrl } from '@/lib/images/storageThumbUrl'
import { cn } from '@/lib/utils'

/**
 * Paints the small version of a photo (our 320px `_thumb.webp`) under the full image, so a picture
 * shows almost at once and the full-resolution one simply covers it when it arrives. Put it first
 * inside the positioned photo box, before the full <img>/<Image>. No JavaScript; renders nothing
 * when there is no low-res version. Lazy like the image above it unless `eager`.
 */
export function LowResUnderlay({ src, low: lowIn, eager, blur, className }: {
  src: string | null | undefined
  /** Known small version (e.g. an API `thumbUrl`); otherwise derived from `src`. */
  low?: string | null
  eager?: boolean
  blur?: boolean
  className?: string
}) {
  const low = lowIn && lowIn !== src ? lowIn : lowResImageUrl(src)
  if (!low) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={low} alt="" aria-hidden loading={eager ? 'eager' : 'lazy'} decoding="async" fetchPriority={eager ? 'high' : 'auto'}
      className={cn('pointer-events-none absolute inset-0 h-full w-full object-cover', blur && 'scale-105 blur-md', className)} />
  )
}
