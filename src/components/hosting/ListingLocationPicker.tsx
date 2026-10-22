'use client'

import { useEffect, useId, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { readListingPin, type ListingPin } from '@/lib/listing-location'

const DraggablePinMap = dynamic(() => import('@/components/ui/DraggablePinMap').then(m => m.DraggablePinMap), {
  ssr: false,
  loading: () => <div className="h-[300px] animate-pulse rounded-lg bg-secondary" />,
})

export function ListingLocationPicker({ address, onAddressChange, pin, onPinChange }: {
  address: string
  onAddressChange: (address: string) => void
  pin: ListingPin | null
  onPinChange: (pin: ListingPin | null) => void
}) {
  const id = useId()
  const [preview, setPreview] = useState<ListingPin | null>(null)
  const [mapsUrl, setMapsUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const previewOpen = preview !== null

  useEffect(() => {
    if (!previewOpen) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    cancelRef.current?.focus()
    return () => previous?.focus()
  }, [previewOpen])

  async function findAddress() {
    if (!address.trim()) { toast.error('Enter an address first'); return }
    setBusy(true)
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address.trim())}&format=json&limit=1`, {
        headers: { 'Accept-Language': 'en' },
      })
      if (!response.ok) throw new Error('Address search is unavailable. Try a Google Maps link instead.')
      const rows: Array<{ lat: string; lon: string; display_name: string }> = await response.json()
      const result = rows[0]
      const next = result && readListingPin({ lat: Number(result.lat), lon: Number(result.lon), label: result.display_name })
      if (!next) throw new Error('Address not found. Paste a Google Maps link or use your current location.')
      setPreview(next)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not search this address')
    } finally {
      setBusy(false)
    }
  }

  async function resolveLink() {
    if (!mapsUrl.trim()) { toast.error('Paste a Google Maps link first'); return }
    setBusy(true)
    try {
      const response = await fetch(`/api/resolve-maps-url?url=${encodeURIComponent(mapsUrl.trim())}`)
      const result: { lat?: number; lon?: number; error?: string } = await response.json()
      const next = readListingPin({ lat: result.lat, lon: result.lon, label: address.trim() || 'Map pin' })
      if (!response.ok || !next) throw new Error(result.error || 'No map pin found in this link')
      setPreview(next)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not process this link')
    } finally {
      setBusy(false)
    }
  }

  function locate() {
    if (!navigator.geolocation) { toast.error('Your browser does not support geolocation'); return }
    setBusy(true)
    navigator.geolocation.getCurrentPosition(position => {
      setPreview({ lat: position.coords.latitude, lon: position.coords.longitude, label: address.trim() || 'Current location' })
      setBusy(false)
    }, error => {
      toast.error(`Could not get your location: ${error.message}`)
      setBusy(false)
    }, { timeout: 10000, enableHighAccuracy: true })
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label htmlFor={`${id}-address`} className="text-sm font-medium">Address details</label>
        <Input id={`${id}-address`} value={address} onChange={event => onAddressChange(event.target.value)}
          placeholder="Building / floor / landmark (optional)" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void findAddress()}>Find on map</Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={locate}>Use current location</Button>
        {pin && <Button type="button" size="sm" variant="outline" onClick={() => setPreview(pin)}>Adjust map pin</Button>}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <label htmlFor={`${id}-maps`} className="text-xs text-muted-foreground">Or paste a Google Maps link</label>
          <Input id={`${id}-maps`} type="url" value={mapsUrl} onChange={event => setMapsUrl(event.target.value)}
            placeholder="https://maps.app.goo.gl/..." />
        </div>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void resolveLink()}>Locate pin</Button>
      </div>
      {busy && <p role="status" className="text-xs text-muted-foreground">Finding location...</p>}
      {pin && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm">
          <a href={`https://www.google.com/maps/search/?api=1&query=${pin.lat},${pin.lon}`} target="_blank" rel="noopener noreferrer"
            className="text-primary hover:underline">{pin.label} ({pin.lat.toFixed(5)}, {pin.lon.toFixed(5)})</a>
          <Button type="button" size="sm" variant="ghost" onClick={() => onPinChange(null)}>Remove map pin</Button>
        </div>
      )}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true"
          aria-labelledby={`${id}-map-title`} onKeyDown={event => {
            if (event.key === 'Escape') setPreview(null)
            if (event.key !== 'Tab') return
            const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]')
            if (!focusable?.length) return
            const first = focusable[0]
            const last = focusable[focusable.length - 1]
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
            if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
          }}>
          <div ref={dialogRef} className="max-h-[90dvh] w-full max-w-lg space-y-3 overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-xl">
            <h3 id={`${id}-map-title`} className="font-semibold">Adjust pin location</h3>
            <p className="text-xs text-muted-foreground">Drag the pin to the exact spot. Changes are saved only when you confirm.</p>
            <DraggablePinMap lat={preview.lat} lon={preview.lon}
              onChange={(lat, lon, label) => setPreview({ lat, lon, label })} />
            <div className="flex justify-end gap-2">
              <Button ref={cancelRef} type="button" variant="outline" onClick={() => setPreview(null)}>Cancel</Button>
              <Button type="button" onClick={() => { onPinChange(preview); setPreview(null) }}>Use this pin</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
