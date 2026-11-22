'use client'

import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'
import type * as Leaflet from 'leaflet'
import { safeInternalPath } from '@/lib/api/v1-client'

export type MapPin = {
  id: string
  lat: number
  lng: number
  title: string
  /** Second line in the popup (date, price, "updated 2 min ago"). */
  subtitle?: string | null
  /** Small grey line (place). */
  meta?: string | null
  image?: string | null
  /** Same-site link opened from the popup. */
  href?: string | null
  linkLabel?: string
  /** Pin colour (CSS colour). */
  color?: string
  /** Letter or initials drawn in the pin. */
  glyph?: string
}

type Props = {
  pins: MapPin[]
  /** Fit the view to the pins when they change (default true for the first set only). */
  fitOnChange?: boolean
  className?: string
  style?: React.CSSProperties
  /** Used when there are no pins. Default: India. */
  center?: [number, number]
  zoom?: number
  ariaLabel?: string
}

const INDIA: [number, number] = [22.5, 79]

function popupNode(p: MapPin): HTMLElement {
  // Built with DOM APIs (textContent) so titles from users never become markup.
  const root = document.createElement('div')
  root.className = 'unsolo-map-popup'
  root.style.width = '200px'
  if (p.image && /^https:\/\//.test(p.image)) {
    const img = document.createElement('img')
    img.src = p.image
    img.alt = ''
    img.loading = 'lazy'
    img.style.cssText = 'width:100%;height:110px;object-fit:cover;border-radius:10px;display:block;margin-bottom:8px;background:#eee'
    root.appendChild(img)
  }
  const title = document.createElement('div')
  title.textContent = p.title
  title.style.cssText = 'font-weight:700;font-size:14px;line-height:1.25;color:#111'
  root.appendChild(title)
  if (p.meta) {
    const meta = document.createElement('div')
    meta.textContent = p.meta
    meta.style.cssText = 'font-size:12px;color:#666;margin-top:2px'
    root.appendChild(meta)
  }
  if (p.subtitle) {
    const sub = document.createElement('div')
    sub.textContent = p.subtitle
    sub.style.cssText = 'font-size:13px;color:#222;margin-top:4px;font-weight:600'
    root.appendChild(sub)
  }
  const href = safeInternalPath(p.href)
  if (href) {
    const a = document.createElement('a')
    a.href = href
    a.textContent = p.linkLabel ?? 'Open'
    a.style.cssText = 'display:inline-block;margin-top:8px;font-size:13px;font-weight:700;color:#0f5132;text-decoration:underline'
    root.appendChild(a)
  }
  return root
}

function pinIcon(L: typeof Leaflet, p: MapPin) {
  const color = /^#[0-9a-f]{3,8}$/i.test(p.color ?? '') ? p.color! : '#0f5132'
  const glyph = (p.glyph ?? '').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase()
  return L.divIcon({
    className: '',
    iconSize: [30, 30],
    iconAnchor: [15, 28],
    popupAnchor: [0, -26],
    html: `<span style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)"><span style="transform:rotate(45deg);color:#fff;font:700 11px/1 system-ui,sans-serif">${glyph}</span></span>`,
  })
}

/**
 * Leaflet + OpenStreetMap tiles. Client only: import it through next/dynamic with `ssr: false`
 * (see LazyPinMap), Leaflet needs `window`.
 */
export default function PinMap({ pins, fitOnChange = false, className, style, center = INDIA, zoom = 5, ariaLabel = 'Map' }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<Leaflet.Map | null>(null)
  const layer = useRef<Leaflet.LayerGroup | null>(null)
  const lib = useRef<typeof Leaflet | null>(null)
  const fitted = useRef(false)
  const latestPins = useRef(pins)

  const draw = () => {
    const L = lib.current, m = map.current, g = layer.current
    if (!L || !m || !g) return
    g.clearLayers()
    const list = latestPins.current.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
    for (const p of list) L.marker([p.lat, p.lng], { icon: pinIcon(L, p), title: p.title, keyboard: true }).bindPopup(() => popupNode(p), { maxWidth: 240 }).addTo(g)
    if (list.length && (!fitted.current || fitOnChange)) {
      fitted.current = true
      if (list.length === 1) m.setView([list[0].lat, list[0].lng], 12)
      else m.fitBounds(L.latLngBounds(list.map((p) => [p.lat, p.lng] as [number, number])), { padding: [30, 30], maxZoom: 13 })
    }
  }

  useEffect(() => {
    let cancelled = false
    void import('leaflet').then((mod) => {
      const L = ((mod as unknown as { default?: typeof Leaflet }).default ?? mod) as typeof Leaflet
      if (cancelled || !box.current || map.current) return
      lib.current = L
      const m = L.map(box.current, { center, zoom, zoomControl: true, attributionControl: true })
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
      }).addTo(m)
      m.attributionControl.setPrefix(false)
      map.current = m
      layer.current = L.layerGroup().addTo(m)
      draw()
    })
    return () => {
      cancelled = true
      map.current?.remove()
      map.current = null
      layer.current = null
      fitted.current = false
    }
    // Created once; pins are drawn by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { latestPins.current = pins; draw() }, [pins])

  return <div ref={box} role="region" aria-label={ariaLabel} className={className} style={{ height: 420, width: '100%', zIndex: 0, ...style }} />
}
