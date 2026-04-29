'use client'

import { useEffect, useRef } from 'react'

const MAIN_SCROLL = '[data-wander-main-scroll]'

/**
 * Full-page seasonal atmosphere for package detail: scrolls with `main`, parallax layers,
 * center-soft mask (stronger décor in gutters). Season styles: `trip-detail-season-decor.css`.
 */
export function TripDetailSeasonBackdrop() {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const main = document.querySelector<HTMLElement>(MAIN_SCROLL)
    if (!main) return

    const mq =
      typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
    let reduceMotion = !!mq?.matches

    const apply = () => {
      const t = reduceMotion ? 0 : main.scrollTop
      /* Deeper layers move less with scroll (parallax). */
      root.style.setProperty('--td-par-back', `${t * 0.08}px`)
      root.style.setProperty('--td-par-mid', `${t * 0.19}px`)
      root.style.setProperty('--td-par-front', `${t * 0.36}px`)
    }

    const onMq = () => {
      reduceMotion = !!mq?.matches
      apply()
    }

    apply()
    main.addEventListener('scroll', apply, { passive: true })
    mq?.addEventListener('change', onMq)
    return () => {
      main.removeEventListener('scroll', apply)
      mq?.removeEventListener('change', onMq)
    }
  }, [])

  return (
    <div ref={rootRef} className="trip-detail-season-backdrop" aria-hidden>
      <div className="trip-detail-season-backdrop__layer trip-detail-season-backdrop__layer--back">
        <div className="trip-detail-season-backdrop__layer-inner trip-detail-season-backdrop__layer-inner--back" />
      </div>
      <div className="trip-detail-season-backdrop__layer trip-detail-season-backdrop__layer--mid">
        <div className="trip-detail-season-backdrop__layer-inner trip-detail-season-backdrop__layer-inner--mid" />
      </div>
      <div className="trip-detail-season-backdrop__layer trip-detail-season-backdrop__layer--front">
        <div className="trip-detail-season-backdrop__layer-inner trip-detail-season-backdrop__layer-inner--front" />
      </div>
    </div>
  )
}
