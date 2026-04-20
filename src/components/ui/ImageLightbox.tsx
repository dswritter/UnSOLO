'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { X, ZoomIn } from 'lucide-react'

interface ImageLightboxProps {
  src: string
  alt: string
  /** CSS classes applied to the trigger wrapper */
  className?: string
  children: React.ReactNode
}

/**
 * Wraps any image trigger with a click-to-expand lightbox.
 * The full image is shown in a fixed black overlay with ESC / click-outside / ✕ to close.
 */
export function ImageLightbox({ src, alt, className, children }: ImageLightboxProps) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // Prevent body scroll while lightbox is open
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <>
      {/* Trigger */}
      <div
        className={`relative cursor-zoom-in group/lb ${className ?? ''}`}
        onClick={() => setOpen(true)}
        role="button"
        aria-label={`View full image: ${alt}`}
      >
        {children}
        {/* Subtle zoom hint on hover */}
        <div className="pointer-events-none absolute inset-0 flex items-end justify-end p-2 opacity-0 group-hover/lb:opacity-100 transition-opacity">
          <div className="rounded-full bg-black/60 p-1.5">
            <ZoomIn className="h-3.5 w-3.5 text-white" />
          </div>
        </div>
      </div>

      {/* Lightbox overlay */}
      {open && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={alt}
        >
          {/* Close button */}
          <button
            type="button"
            className="absolute top-4 right-4 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
            onClick={() => setOpen(false)}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Full image — stop propagation so clicking image doesn't close */}
          <div
            className="relative max-h-[90dvh] max-w-[90dvw] w-full h-full flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt}
              className="max-h-[90dvh] max-w-[90dvw] w-auto h-auto object-contain rounded-lg shadow-2xl"
            />
          </div>

          <p className="absolute bottom-4 left-0 right-0 text-center text-xs text-white/40 pointer-events-none">
            {alt} · Click outside or press ESC to close
          </p>
        </div>
      )}
    </>
  )
}
