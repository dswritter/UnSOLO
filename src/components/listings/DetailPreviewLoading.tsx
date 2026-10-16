'use client'

import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useSyncExternalStore } from 'react'
import { MapPin } from 'lucide-react'
import { readDetailPreview } from '@/lib/detail-preview'

const noopSubscribe = () => () => {}

function Bar({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-secondary ${className}`} />
}

/**
 * Route loading state for trip/listing details: paints the title, image and price
 * the user just clicked on, while the full page streams in.
 */
export function DetailPreviewLoading({ label }: { label: string }) {
  const pathname = usePathname()
  const preview = useSyncExternalStore(noopSubscribe, () => readDetailPreview(pathname), () => null)

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:py-10" aria-busy="true" aria-label={`Loading ${label}`}>
      <div className="flex flex-col-reverse gap-8 lg:grid lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-secondary">
            <div aria-hidden="true" className="absolute inset-0 animate-pulse bg-foreground/[0.06]" />
            {preview?.image ? (
              <Image src={preview.image} alt="" fill priority sizes={preview.imageSizes} className="object-cover" />
            ) : null}
          </div>
          {preview ? (
            <div>
              {preview.location ? (
                <p className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4 text-primary" aria-hidden="true" />
                  {preview.location}
                </p>
              ) : null}
              <h1 className="text-lg font-bold leading-tight text-foreground sm:text-xl md:text-2xl">{preview.title}</h1>
              {preview.meta.length ? (
                <p className="mt-2 text-sm capitalize text-muted-foreground">{preview.meta.join(' · ')}</p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              <Bar className="h-4 w-40" />
              <Bar className="h-8 w-full max-w-xl" />
            </div>
          )}
          <div className="space-y-3">
            <Bar className="h-4 w-full" />
            <Bar className="h-4 w-full" />
            <Bar className="h-4 w-[90%]" />
            <Bar className="mt-4 h-32 w-full rounded-xl" />
          </div>
        </div>
        <div className="h-fit space-y-4 rounded-xl border border-border bg-card p-5">
          {preview?.price ? (
            <p className="text-sm text-muted-foreground">
              {preview.priceFrom ? 'From ' : null}
              <span className="text-2xl font-black text-primary">{preview.price}</span>
              {preview.priceSuffix ? ` / ${preview.priceSuffix}` : null}
            </p>
          ) : (
            <Bar className="h-8 w-40" />
          )}
          <Bar className="h-10 w-full rounded-lg" />
          <Bar className="h-10 w-full rounded-lg" />
          <Bar className="h-11 w-full rounded-lg" />
        </div>
      </div>
    </div>
  )
}
