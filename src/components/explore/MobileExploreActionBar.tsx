'use client'

import { ChevronLeft, MapPinned, Search, SlidersHorizontal } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import type { ServiceListingType } from '@/types'

interface MobileExploreActionBarProps {
  activeTab: 'trips' | ServiceListingType
  onSearchClick: () => void
  onFilterClick: () => void
  onNearMe?: (coords: { lat: number; lon: number }) => void
}

export function MobileExploreActionBar({
  activeTab: _activeTab,
  onSearchClick,
  onFilterClick,
  onNearMe,
}: MobileExploreActionBarProps) {
  const router = useRouter()
  const [locating, setLocating] = useState(false)

  function handleNearMe() {
    if (locating) return
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      toast.error('Location is not available on this device')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        const coords = { lat: pos.coords.latitude, lon: pos.coords.longitude }
        if (onNearMe) {
          onNearMe(coords)
        } else {
          // Fallback: drop coords on the URL so the existing filter pipeline can pick them up.
          const url = new URL(window.location.href)
          url.searchParams.set('near', `${coords.lat.toFixed(5)},${coords.lon.toFixed(5)}`)
          window.history.replaceState({}, '', url.toString())
          router.refresh()
        }
        toast.success('Showing places near you')
      },
      (err) => {
        setLocating(false)
        const msg =
          err.code === err.PERMISSION_DENIED
            ? 'Allow location access to see places near you'
            : 'Could not get your location'
        toast.error(msg)
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 },
    )
  }

  return (
    <div className="fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 px-4 md:hidden">
      <div className="flex items-center overflow-hidden rounded-2xl border border-white/12 bg-zinc-950/94 shadow-[0_16px_40px_rgba(0,0,0,0.28)] backdrop-blur-xl">
        {/* Back: anchored on the left next to the thumb */}
        <button
          onClick={() => router.back()}
          className="flex h-12 w-12 shrink-0 items-center justify-center text-white"
          aria-label="Back"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="h-8 w-px bg-white/12" />

        <button
          onClick={onFilterClick}
          className="flex flex-1 items-center justify-center gap-2 px-3 py-3 text-sm font-semibold text-white"
          aria-label="Open filters"
        >
          <SlidersHorizontal className="h-4.5 w-4.5" />
          <span>Filters</span>
        </button>

        <div className="h-8 w-px bg-white/12" />
        <button
          onClick={onSearchClick}
          className="flex flex-1 items-center justify-center gap-2 px-3 py-3 text-sm font-semibold text-white"
          aria-label="Open search"
        >
          <Search className="h-4.5 w-4.5" />
          <span>Search</span>
        </button>

        <div className="h-8 w-px bg-white/12" />
        <button
          onClick={handleNearMe}
          disabled={locating}
          className="flex flex-1 items-center justify-center gap-2 px-3 py-3 text-sm font-semibold text-white disabled:opacity-60"
          aria-label="Find places near me"
        >
          <MapPinned className="h-4.5 w-4.5" />
          <span>{locating ? 'Locating…' : 'Near me'}</span>
        </button>
      </div>
    </div>
  )
}
