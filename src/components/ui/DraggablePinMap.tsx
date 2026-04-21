'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  lat: number
  lon: number
  /** Called when the user drags the pin to a new position */
  onChange?: (lat: number, lon: number, displayName: string) => void
}

/**
 * Interactive Leaflet map with a draggable pin.
 * Loaded client-side only (no SSR) because Leaflet needs `window`.
 */
export function DraggablePinMap({ lat, lon, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<import('leaflet').Map | null>(null)
  const markerRef = useRef<import('leaflet').Marker | null>(null)
  const [reverseGeocoding, setReverseGeocoding] = useState(false)

  useEffect(() => {
    if (!containerRef.current) return
    // Leaflet mutates the container — bail if already initialised.
    if (mapRef.current) return

    // Dynamic import so Next.js doesn't try to SSR leaflet.
    import('leaflet').then((L) => {
      // Leaflet's default icon images break under webpack — fix with CDN paths.
      delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      const map = L.map(containerRef.current!, {
        center: [lat, lon],
        zoom: 15,
        zoomControl: true,
        attributionControl: false, // hide attribution bar
      })

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map)

      const marker = L.marker([lat, lon], { draggable: true }).addTo(map)
      marker.bindTooltip('Drag to adjust pin', { permanent: false })

      marker.on('dragend', async () => {
        const pos = marker.getLatLng()
        setReverseGeocoding(true)
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${pos.lat}&lon=${pos.lng}&format=json`,
            { headers: { 'Accept-Language': 'en' } },
          )
          const data: { display_name?: string } = await res.json()
          onChange?.(pos.lat, pos.lng, data.display_name || `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`)
        } catch {
          onChange?.(pos.lat, pos.lng, `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`)
        } finally {
          setReverseGeocoding(false)
        }
      })

      mapRef.current = map
      markerRef.current = marker
    })

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
      markerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // If parent passes updated coords (e.g. new geocode result), re-center.
  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return
    const ll = { lat, lng: lon }
    markerRef.current.setLatLng(ll)
    mapRef.current.setView(ll, mapRef.current.getZoom())
  }, [lat, lon])

  return (
    <div className="relative">
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      />
      <div ref={containerRef} style={{ height: 300, width: '100%' }} className="rounded-lg overflow-hidden" />
      {reverseGeocoding && (
        <div className="absolute bottom-2 left-2 bg-background/90 text-xs px-2 py-1 rounded shadow">
          Updating address…
        </div>
      )}
    </div>
  )
}
