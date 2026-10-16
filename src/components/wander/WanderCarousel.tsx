'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/** Scroll-snap row with desktop prev/next buttons; touch devices just swipe. */
export function WanderCarousel({ children, label }: { children: ReactNode; label: string }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: true, end: false })

  const sync = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 })
  }, [])

  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(el)
    return () => observer.disconnect()
  }, [sync])

  const scrollBy = (dir: 1 | -1) => {
    const el = trackRef.current
    if (!el) return
    el.scrollBy({ left: dir * Math.max(el.clientWidth * 0.85, 240), behavior: 'smooth' })
  }

  const buttonClass = 'absolute top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-foreground/12 bg-background/90 text-foreground shadow-lg backdrop-blur transition hover:border-primary/50 hover:text-primary disabled:pointer-events-none disabled:opacity-0 md:flex'

  return (
    <div className="relative" role="region" aria-roledescription="carousel" aria-label={label}>
      <button type="button" aria-label="Scroll back" className={`${buttonClass} -left-4`} disabled={edges.start} onClick={() => scrollBy(-1)}>
        <ChevronLeft className="h-5 w-5" />
      </button>
      <div
        ref={trackRef}
        onScroll={sync}
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-4 pb-3 sm:-mx-6 sm:px-6 md:mx-0 md:gap-4 md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      <button type="button" aria-label="Scroll forward" className={`${buttonClass} -right-4`} disabled={edges.end} onClick={() => scrollBy(1)}>
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  )
}
