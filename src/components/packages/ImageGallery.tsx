'use client'

import { useState } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, X, Mountain } from 'lucide-react'

interface ImageGalleryProps {
  images: string[]
  title: string
}

export function ImageGallery({ images, title }: ImageGalleryProps) {
  const [current, setCurrent] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)
  const [loaded, setLoaded] = useState<Record<number, boolean>>({})

  if (!images || images.length === 0) {
    return (
      <div className="relative aspect-video rounded-2xl overflow-hidden bg-secondary flex items-center justify-center">
        <Mountain className="h-20 w-20 text-primary/30" />
      </div>
    )
  }

  function next() {
    setCurrent(c => (c + 1) % images.length)
  }

  function prev() {
    setCurrent(c => (c - 1 + images.length) % images.length)
  }

  return (
    <>
      {/* Main image */}
      <div className="relative aspect-video rounded-2xl overflow-hidden bg-secondary group cursor-pointer" onClick={() => setFullscreen(true)}>
        <Image
          src={images[current]}
          alt={`${title} - ${current + 1}`}
          fill
          className={`object-cover transition-all duration-500 group-hover:scale-105 ${loaded[current] ? 'opacity-100 blur-0' : 'opacity-0 blur-md scale-105'}`}
          sizes="(max-width: 768px) 100vw, 66vw"
          priority={current === 0}
          onLoad={() => setLoaded(prev => ({ ...prev, [current]: true }))}
        />
        {!loaded[current] && (
          <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-secondary via-muted/50 to-secondary" />
        )}

        {/* Nav arrows */}
        {images.length > 1 && (
          <>
            <button
              onClick={e => { e.stopPropagation(); prev() }}
              className="absolute left-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={e => { e.stopPropagation(); next() }}
              className="absolute right-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}

        {/* Dots indicator */}
        {images.length > 1 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={e => { e.stopPropagation(); setCurrent(i) }}
                className={`h-2 rounded-full transition-all ${
                  i === current ? 'w-6 bg-primary' : 'w-2 bg-white/50 hover:bg-white/80'
                }`}
              />
            ))}
          </div>
        )}

        {/* Counter */}
        {images.length > 1 && (
          <span className="absolute top-3 right-3 bg-black/60 text-white text-xs px-2.5 py-1 rounded-full">
            {current + 1} / {images.length}
          </span>
        )}
      </div>

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`relative h-16 w-20 flex-shrink-0 rounded-lg overflow-hidden transition-all ${
                i === current ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : 'opacity-60 hover:opacity-100'
              }`}
            >
              <Image src={img} alt={`${title} thumb ${i + 1}`} fill className="object-cover" sizes="80px" />
            </button>
          ))}
        </div>
      )}

      {/* Fullscreen lightbox */}
      {fullscreen && (
        <div className="fixed inset-0 z-[70] bg-black/95 flex items-center justify-center" onClick={() => setFullscreen(false)}>
          <button className="absolute top-4 right-4 z-10 h-10 w-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20">
            <X className="h-5 w-5" />
          </button>

          <div className="relative w-full h-full max-w-5xl max-h-[85vh] m-8" onClick={e => e.stopPropagation()}>
            <Image
              src={images[current]}
              alt={`${title} - ${current + 1}`}
              fill
              className="object-contain"
              sizes="100vw"
            />
          </div>

          {images.length > 1 && (
            <>
              <button
                onClick={e => { e.stopPropagation(); prev() }}
                className="absolute left-4 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                onClick={e => { e.stopPropagation(); next() }}
                className="absolute right-4 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={e => { e.stopPropagation(); setCurrent(i) }}
                className={`h-2.5 rounded-full transition-all ${
                  i === current ? 'w-8 bg-primary' : 'w-2.5 bg-white/40 hover:bg-white/70'
                }`}
              />
            ))}
          </div>
        </div>
      )}
    </>
  )
}
