'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'

const DraggablePinMap = dynamic(
  () => import('@/components/ui/DraggablePinMap').then(m => ({ default: m.DraggablePinMap })),
  { ssr: false, loading: () => <div className="h-[300px] rounded-lg bg-secondary animate-pulse" /> },
)
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Building2, Package, Eye, ChevronLeft, ChevronRight, X, Star, ExternalLink, Save, MapPin, Loader2, Link as LinkIcon, ChevronDown, LocateFixed } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { HostSubmittingOverlay } from '@/components/host/HostSubmittingOverlay'
import { HostDestinationSearch } from '@/components/hosting/HostDestinationSearch'
import { CoHostSection } from '@/components/hosting/CoHostSection'
import { TripDescriptionMarkdownToolbar } from '@/components/ui/TripDescriptionMarkdownToolbar'
import { TripDescriptionDisplay } from '@/components/ui/TripDescriptionDisplay'
import {
  createHostServiceListing,
  updateHostServiceListing,
  type HostServiceItemDraft,
} from '@/actions/host-service-listings'
import {
  createServiceListingItem,
  updateServiceListingItem,
  deleteServiceListingItem,
} from '@/actions/host-service-listing-items'
import {
  SERVICE_LISTING_PREVIEW_HANDOFF_KEY,
  type HostServiceListingPreviewPayload,
} from '@/lib/host-service-listing-preview-session'
import type {
  Destination,
  ServiceListing,
  ServiceListingItem,
  ServiceListingMetadata,
  ServiceListingType,
} from '@/types'
import { UPLOAD_MAX_IMAGE_BYTES } from '@/lib/constants'
import { formatFileSize } from '@/lib/utils'

type Unit = 'per_night' | 'per_person' | 'per_day' | 'per_hour' | 'per_week' | 'per_month'

interface BaseProps {
  type: ServiceListingType
  destinations: Destination[]
  userId: string
  initialTab?: number
}

interface CreateProps extends BaseProps {
  mode: 'create'
}

interface EditProps extends BaseProps {
  mode: 'edit'
  listing: ServiceListing & { destination_ids?: string[] | null }
  initialItems: ServiceListingItem[]
  /** Non-cancelled service bookings per item id (server-provided). */
  bookingCountByItemId?: Record<string, number>
  /** Total non-cancelled service bookings for this listing. */
  listingBookingCount?: number
}

type Props = CreateProps | EditProps

const STEPS = [
  { label: 'Business', icon: Building2 },
  { label: 'Items', icon: Package },
  { label: 'Review', icon: Eye },
]

const TYPE_CONFIG: Record<ServiceListingType, {
  heading: string
  titleLabel: string
  titleHint: string
  titlePlaceholder: string
  itemNamePlaceholder: string
  defaultUnit: Unit
  suggestedAmenities: string[]
  unitOptions: { value: Unit; label: string }[]
}> = {
  stays: {
    heading: 'Stay',
    titleLabel: 'Business / property name',
    titleHint: 'The name of your stay or property — travelers see this first.',
    titlePlaceholder: 'e.g., Mountain View Homestay, Riverbank Cottages',
    itemNamePlaceholder: 'e.g., Deluxe Room / 1BHK Suite / MudHouse / Penthouse',
    defaultUnit: 'per_night',
    suggestedAmenities: ['WiFi', 'Kitchen', 'Bathroom', 'AC', 'Parking'],
    unitOptions: [
      { value: 'per_night', label: 'Per night' },
      { value: 'per_day', label: 'Per day' },
      { value: 'per_week', label: 'Per week' },
      { value: 'per_month', label: 'Per month' },
    ],
  },
  activities: {
    heading: 'Activity',
    titleLabel: 'Business / experience name',
    titleHint: 'Your company or offering name. Individual activities go in as items below.',
    titlePlaceholder: 'e.g., Himalayan Adventures, Spiti Photography Tours',
    itemNamePlaceholder: 'e.g., Sunset Trek / Paragliding / Photography Walk',
    defaultUnit: 'per_person',
    suggestedAmenities: ['Guide included', 'Equipment provided', 'Snacks', 'Photos included'],
    unitOptions: [
      { value: 'per_person', label: 'Per person' },
      { value: 'per_hour', label: 'Per hour' },
      { value: 'per_day', label: 'Per day' },
    ],
  },
  rentals: {
    heading: 'Rental',
    titleLabel: 'Shop / business name',
    titleHint: 'Your rental business name — not a single vehicle. Individual cars/bikes go in as items below.',
    titlePlaceholder: 'e.g., Manali Car Rentals, Leh Bike Hub',
    itemNamePlaceholder: 'e.g., Maruti Alto (white) / Royal Enfield Classic 350',
    defaultUnit: 'per_day',
    suggestedAmenities: ['Insurance', 'Fuel', 'Free mileage', 'GPS'],
    unitOptions: [
      { value: 'per_day', label: 'Per day' },
      { value: 'per_hour', label: 'Per hour' },
      { value: 'per_week', label: 'Per week' },
      { value: 'per_month', label: 'Per month' },
    ],
  },
  getting_around: {
    heading: 'Transport Service',
    titleLabel: 'Service / agency name',
    titleHint: 'Your transport agency name. Individual routes or vehicles go in as items below.',
    titlePlaceholder: 'e.g., Spiti Cab Service, Himachal Tempo Travellers',
    itemNamePlaceholder: 'e.g., Airport pickup / Manali → Kasol drop',
    defaultUnit: 'per_day',
    suggestedAmenities: ['Airport service', 'On-time pickup', 'AC vehicle'],
    unitOptions: [
      { value: 'per_day', label: 'Per trip / per day' },
      { value: 'per_hour', label: 'Per hour' },
      { value: 'per_person', label: 'Per person' },
    ],
  },
}

type DraftItem = {
  /** For edit-mode items loaded from DB. Absent for new drafts added in-memory. */
  dbId?: string
  /** Client-local key for render + tracking. */
  localKey: string
  name: string
  description: string
  /** Null = blank / unentered. Host must enter a value before the item is valid. */
  priceRupees: number | null
  quantity: number
  maxPerBooking: number
  images: string[]
  /** Rentals & stays: per-item. Other types inherit master unit (or activities: per-item unit only). */
  unit?: Unit
  /** Rentals & stays: per-item. */
  amenities?: string[]
}

function emptyDraft(type: ServiceListingType): DraftItem {
  const base: DraftItem = {
    localKey: typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `new-${Math.random().toString(36).slice(2)}`,
    name: '',
    description: '',
    priceRupees: null,
    quantity: 1,
    maxPerBooking: 10,
    images: [],
  }
  if (type === 'rentals') {
    base.unit = TYPE_CONFIG.rentals.defaultUnit
    base.amenities = []
  } else if (type === 'activities') {
    base.unit = TYPE_CONFIG.activities.defaultUnit
  } else if (type === 'stays') {
    base.unit = TYPE_CONFIG.stays.defaultUnit
    base.amenities = []
  }
  return base
}

function itemFromRow(
  row: ServiceListingItem,
  type: ServiceListingType,
  /** Legacy stay listings: copy master unit/amenities into items when rows are empty. */
  stayLegacy?: { unit: Unit; amenities: string[] },
): DraftItem {
  const draft: DraftItem = {
    dbId: row.id,
    localKey: row.id,
    name: row.name,
    description: row.description || '',
    priceRupees: row.price_paise / 100,
    quantity: row.max_per_booking,
    maxPerBooking: row.quantity_available,
    images: row.images,
  }
  if (type === 'rentals') {
    draft.unit = (row.unit as Unit) || TYPE_CONFIG.rentals.defaultUnit
    draft.amenities = row.amenities || []
  } else if (type === 'activities') {
    draft.unit = (row.unit as Unit) || TYPE_CONFIG.activities.defaultUnit
  } else if (type === 'stays') {
    draft.unit = (row.unit as Unit) || stayLegacy?.unit || TYPE_CONFIG.stays.defaultUnit
    const rowAm = row.amenities
    draft.amenities =
      rowAm && rowAm.length > 0
        ? [...rowAm]
        : stayLegacy?.amenities?.length
          ? [...stayLegacy.amenities]
          : []
  }
  return draft
}

// XHR-based upload so we can stream progress into the photo placeholder.
function uploadImage(file: File, onProgress?: (percent: number) => void): Promise<string | null> {
  return new Promise((resolve) => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('purpose', 'host_trip')
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/upload')
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const { url } = JSON.parse(xhr.responseText)
          resolve(url as string)
        } catch {
          toast.error('Upload failed')
          resolve(null)
        }
      } else {
        let msg = 'Upload failed'
        try { msg = JSON.parse(xhr.responseText).error || msg } catch {}
        toast.error(msg)
        resolve(null)
      }
    }
    xhr.onerror = () => { toast.error('Upload failed'); resolve(null) }
    xhr.send(fd)
  })
}

export function HostServiceListingTabs(props: Props) {
  const { type, destinations, userId, mode } = props
  const router = useRouter()
  const config = TYPE_CONFIG[type]

  const initialListing = mode === 'edit' ? props.listing : null
  const initialItems = mode === 'edit' ? props.initialItems : []
  const bookingCountByItemId = mode === 'edit' ? props.bookingCountByItemId : undefined
  const listingBookingCount = mode === 'edit' ? props.listingBookingCount : undefined
  const stayLegacyForItems =
    mode === 'edit' && type === 'stays' && initialListing
      ? {
          unit: (initialListing.unit as Unit) || TYPE_CONFIG.stays.defaultUnit,
          amenities: [...(initialListing.amenities || [])],
        }
      : undefined

  const [step, setStep] = useState(() => {
    const t = props.initialTab
    if (typeof t === 'number' && t >= 0 && t < STEPS.length) return t
    return 0
  })
  const [saving, setSaving] = useState(false)
  const [createSubmitOverlayOpen, setCreateSubmitOverlayOpen] = useState(false)
  const createSubmitCancelledRef = useRef(false)

  // ── Validation popup ──────────────────────────────────────────────────
  type ValidationError = { label: string; fieldId: string }
  const [validationPopup, setValidationPopup] = useState<ValidationError[] | null>(null)

  // ── Address map preview ───────────────────────────────────────────────
  type GeoResult = { lat: string; lon: string; display_name: string }
  const [mapPreview, setMapPreview] = useState<{ lat: number; lon: number; displayName: string } | null>(null)
  const [geocoding, setGeocoding] = useState(false)
  const [geoSuggestions, setGeoSuggestions] = useState<GeoResult[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [mapsUrlInput, setMapsUrlInput] = useState('')
  const [showMapsUrl, setShowMapsUrl] = useState(false)
  const [mapsUrlLoading, setMapsUrlLoading] = useState(false)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  // Close suggestions dropdown on outside click
  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  function openMapAt(r: GeoResult) {
    setShowSuggestions(false)
    setGeoSuggestions([])
    setMapPreview({ lat: parseFloat(r.lat), lon: parseFloat(r.lon), displayName: r.display_name })
  }

  /** Build a readable address string from Photon's structured fields */
  function buildDisplayName(p: Record<string, string | undefined>): string {
    const parts: string[] = []
    if (p.name) parts.push(p.name)
    if (p.housenumber && p.street) parts.push(`${p.housenumber} ${p.street}`)
    else if (p.street) parts.push(p.street)
    const city = p.city || p.district || p.locality || p.town || p.village
    if (city && city !== p.name) parts.push(city)
    if (p.state && p.state !== city) parts.push(p.state)
    if (p.country) parts.push(p.country)
    return parts.join(', ')
  }

  /** Photon (Komoot) search — better fuzzy matching than Nominatim */
  async function photonSearch(q: string): Promise<GeoResult[]> {
    try {
      const res = await fetch(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5&lang=en`,
      )
      if (!res.ok) return []
      const data = await res.json() as {
        features?: Array<{
          geometry: { coordinates: [number, number] }
          properties: Record<string, string | undefined>
        }>
      }
      return (data.features || []).map(f => ({
        lat: String(f.geometry.coordinates[1]),
        lon: String(f.geometry.coordinates[0]),
        display_name: buildDisplayName(f.properties),
      })).filter(r => r.display_name)
    } catch { return [] }
  }

  /** Nominatim fallback search */
  async function nominatimSearch(q: string, indiaBias = false): Promise<GeoResult[]> {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&addressdetails=1${indiaBias ? '&countrycodes=in' : ''}`,
        { headers: { 'Accept-Language': 'en', 'User-Agent': 'UnSOLO/1.0 (https://unsolo.in)' } },
      )
      if (!res.ok) return []
      return res.json() as Promise<GeoResult[]>
    } catch { return [] }
  }

  async function previewLocationOnMap() {
    const addr = location.trim()
    if (!addr) { toast.error('Enter an address first'); return }
    setGeocoding(true)
    setGeoSuggestions([])
    setShowSuggestions(false)
    try {
      // 1. Photon with full query (best fuzzy matcher)
      let data = await photonSearch(addr)

      // 2. Photon with progressive simplification — drops the most specific
      //    token (often a POI name that isn't in OSM) and retries
      if (data.length === 0) {
        const tokens = addr.split(/[,\s]+/).filter(Boolean)
        for (let keep = tokens.length - 1; keep >= 2 && data.length === 0; keep--) {
          const simplified = tokens.slice(-keep).join(' ')
          data = await photonSearch(simplified)
        }
      }

      // 3. Nominatim fallbacks
      if (data.length === 0) data = await nominatimSearch(addr, true)
      if (data.length === 0) data = await nominatimSearch(addr, false)

      if (data.length === 0) {
        toast.error('Address not found — try pasting a Google Maps link below')
        setShowMapsUrl(true)
        return
      }
      if (data.length === 1) {
        openMapAt(data[0])
      } else {
        setGeoSuggestions(data)
        setShowSuggestions(true)
      }
    } catch {
      toast.error('Could not load map preview')
    } finally {
      setGeocoding(false)
    }
  }

  /** Extract coords from a Google Maps long URL (client-side, no fetch needed) */
  function parseGoogleMapsCoords(url: string): { lat: number; lon: number } | null {
    // Precise POI pin: !3d{lat}!4d{lon}
    const d = url.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/)
    if (d) return { lat: parseFloat(d[1]), lon: parseFloat(d[2]) }
    // Viewport center: @lat,lon
    const at = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/)
    if (at) return { lat: parseFloat(at[1]), lon: parseFloat(at[2]) }
    // ?q=lat,lon
    const q = url.match(/[?&](?:q|query|ll)=(-?\d+\.?\d*),(-?\d+\.?\d*)/)
    if (q) return { lat: parseFloat(q[1]), lon: parseFloat(q[2]) }
    return null
  }

  async function reverseGeocode(lat: number, lon: number): Promise<string> {
    try {
      const rev = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
        { headers: { 'Accept-Language': 'en', 'User-Agent': 'UnSOLO/1.0 (https://unsolo.in)' } },
      )
      const data: { display_name?: string } = await rev.json()
      return data.display_name || `${lat.toFixed(5)}, ${lon.toFixed(5)}`
    } catch {
      return `${lat.toFixed(5)}, ${lon.toFixed(5)}`
    }
  }

  async function handleMapsUrl() {
    const raw = mapsUrlInput.trim()
    if (!raw) return
    setMapsUrlLoading(true)
    try {
      let coords: { lat: number; lon: number } | null = null

      // For long URLs, parse client-side first (fast, no server call)
      if (!/maps\.app\.goo\.gl|goo\.gl\/maps/.test(raw)) {
        coords = parseGoogleMapsCoords(raw)
      }

      // For short URLs — or if the long URL had no inline coords — hit the
      // server resolver which uses a mobile UA to get the real canonical URL
      if (!coords) {
        const res = await fetch(`/api/resolve-maps-url?url=${encodeURIComponent(raw)}`)
        const json = await res.json() as { url?: string; lat?: number; lon?: number; error?: string }
        if (typeof json.lat === 'number' && typeof json.lon === 'number') {
          coords = { lat: json.lat, lon: json.lon }
        } else if (json.url) {
          coords = parseGoogleMapsCoords(json.url)
        }
        if (!coords) throw new Error(json.error || 'No coordinates found in this link')
      }

      const displayName = await reverseGeocode(coords.lat, coords.lon)
      setMapPreview({ lat: coords.lat, lon: coords.lon, displayName })
      setMapsUrlInput('')
      setShowMapsUrl(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not process that link')
    } finally {
      setMapsUrlLoading(false)
    }
  }

  /** Use device geolocation + reverse-geocode to populate the address */
  function useCurrentLocation() {
    if (!('geolocation' in navigator)) {
      toast.error('Geolocation is not supported by your browser')
      return
    }
    setGeocoding(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords
        try {
          const displayName = await reverseGeocode(latitude, longitude)
          setMapPreview({ lat: latitude, lon: longitude, displayName })
        } finally {
          setGeocoding(false)
        }
      },
      (err) => {
        setGeocoding(false)
        if (err.code === err.PERMISSION_DENIED) {
          toast.error('Location permission denied — enable it in your browser settings')
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          toast.error('Location unavailable — try again in an open area')
        } else {
          toast.error('Could not get your current location')
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }

  // ── Business tab state ────────────────────────────────────────────────
  const [knownDestinations, setKnownDestinations] = useState<Destination[]>(destinations)
  const [addingLocation, setAddingLocation] = useState(false)
  const [title, setTitle] = useState(initialListing?.title || '')
  const [destinationIds, setDestinationIds] = useState<string[]>(
    initialListing?.destination_ids || (initialListing?.destination_id ? [initialListing.destination_id] : []),
  )
  const [location, setLocation] = useState(initialListing?.location || '')
  const [pinLatLon, setPinLatLon] = useState<{ lat: number; lon: number } | null>(
    initialListing?.latitude && initialListing?.longitude
      ? { lat: initialListing.latitude as number, lon: initialListing.longitude as number }
      : null,
  )
  const [pinDisplayName, setPinDisplayName] = useState<string | null>(null)

  // For edit mode: reverse-geocode the saved pin on mount so the chip
  // below the address input shows a readable place name rather than raw coords.
  useEffect(() => {
    if (!pinLatLon || pinDisplayName) return
    let cancelled = false
    void (async () => {
      const name = await reverseGeocode(pinLatLon.lat, pinLatLon.lon)
      if (!cancelled) setPinDisplayName(name)
    })()
    return () => { cancelled = true }
    // Run once on mount — we don't want to re-fetch when pinDisplayName changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [shortDescription, setShortDescription] = useState(initialListing?.short_description || '')
  const [description, setDescription] = useState(initialListing?.description || '')
  const [unit, setUnit] = useState<Unit>((initialListing?.unit as Unit) || config.defaultUnit)
  const [amenities, setAmenities] = useState<string[]>(() => {
    if (type === 'stays') return []
    if (initialListing?.amenities && initialListing.amenities.length > 0) {
      return [...initialListing.amenities]
    }
    return [...config.suggestedAmenities]
  })
  const [tagsInput, setTagsInput] = useState((initialListing?.tags || []).join(', '))
  const [customAmenity, setCustomAmenity] = useState('')
  // Activities only: host-scheduled event schedule. Null = ongoing.
  const initialSchedule = initialListing?.event_schedule || null
  const [isDateSpecific, setIsDateSpecific] = useState<boolean>(
    Array.isArray(initialSchedule) && initialSchedule.length > 0,
  )
  const [hasSlots, setHasSlots] = useState<boolean>(
    Array.isArray(initialSchedule) && initialSchedule.some(e => e.slots && e.slots.length > 0),
  )
  const [eventSchedule, setEventSchedule] = useState<Array<{ date: string; slots: { start: string; end: string }[] }>>(
    Array.isArray(initialSchedule)
      ? initialSchedule.map(e => ({ date: e.date, slots: e.slots ? e.slots.slice() : [] }))
      : [],
  )
  const [newEventDate, setNewEventDate] = useState('')
  const descRef = useRef<HTMLTextAreaElement>(null)

  // ── Items tab state ───────────────────────────────────────────────────
  const [items, setItems] = useState<DraftItem[]>(
    initialItems.length > 0
      ? initialItems.map(row => itemFromRow(row, type, stayLegacyForItems))
      : [emptyDraft(type)],
  )
  const isRental = type === 'rentals'
  const isActivity = type === 'activities'
  const isStay = type === 'stays'
  const [uploadingLocalKey, setUploadingLocalKey] = useState<string | null>(null)
  /** Per-file upload progress while `uploadingLocalKey` is set. Length = total files in the current batch. */
  const [uploadProgress, setUploadProgress] = useState<number[]>([])
  const itemDescRefs = useRef<Record<string, HTMLTextAreaElement | null>>({})
  /** Per-item "add your own amenity" input buffer, keyed by draft.localKey. */
  const [customItemAmenity, setCustomItemAmenity] = useState<Record<string, string>>({})

  // ── Dirty tracking + unsaved-changes guard ────────────────────────────
  // Snapshot of persisted form state. `isDirty` compares the current state
  // JSON against it; cleared again after any successful save so the guard
  // stops blocking navigation once the host has actually saved.
  const serializeFormState = () => JSON.stringify({
    title: title.trim(),
    destinationIds,
    location: location.trim(),
    pinLatLon,
    shortDescription: shortDescription.trim(),
    description: description.trim(),
    unit,
    amenities,
    tagsInput: tagsInput.trim(),
    isDateSpecific,
    hasSlots,
    eventSchedule,
    items: items.map(i => ({
      dbId: i.dbId ?? null,
      name: i.name.trim(),
      description: i.description.trim(),
      priceRupees: i.priceRupees,
      quantity: i.quantity,
      maxPerBooking: i.maxPerBooking,
      images: i.images,
      unit: i.unit ?? null,
      amenities: i.amenities ?? null,
    })),
  })

  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null)

  // Stamp the initial snapshot on mount so the very first render doesn't
  // read as dirty (current === saved).
  useEffect(() => {
    setSavedSnapshot(serializeFormState())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const currentSnapshot = useMemo(
    () => serializeFormState(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [title, destinationIds, location, pinLatLon, shortDescription, description, unit, amenities, tagsInput, isDateSpecific, hasSlots, eventSchedule, items],
  )

  const isDirty = savedSnapshot !== null && savedSnapshot !== currentSnapshot

  // Build the event_schedule payload for the server. null = ongoing; otherwise
  // entries carry { date, slots? }. When "Multiple time slots" is off we drop
  // any slots the host previously entered so the API sees a clean all-day array.
  function buildEventSchedulePayload(): { date: string; slots: { start: string; end: string }[] | null }[] | null {
    if (type !== 'activities') return null
    if (!isDateSpecific) return null
    return eventSchedule
      .filter(e => /^\d{4}-\d{2}-\d{2}$/.test(e.date))
      .map(e => ({
        date: e.date,
        slots: hasSlots && e.slots.length > 0 ? e.slots : null,
      }))
  }

  // Modal state: path the host clicked on (internal), or 'external' when the
  // browser is firing beforeunload (which can't show our custom UI).
  const [pendingNav, setPendingNav] = useState<string | null>(null)

  // Browser-level guard: tab close / refresh / external URL. Can only show
  // the generic native prompt — custom buttons aren't allowed.
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  // In-app nav guard: intercept clicks on internal <a> links anywhere on
  // the page. Capture phase + stopImmediatePropagation so Next.js Link's
  // own onClick doesn't fire. External links (http, mailto, #anchors) and
  // new-tab clicks (cmd/ctrl/shift/middle) pass through untouched.
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: MouseEvent) => {
      if (e.defaultPrevented) return
      if (e.button !== 0) return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const target = (e.target as HTMLElement | null)?.closest('a') as HTMLAnchorElement | null
      if (!target) return
      if (target.target === '_blank') return
      const href = target.getAttribute('href')
      if (!href) return
      if (/^(https?:|mailto:|tel:|#)/i.test(href)) return
      e.preventDefault()
      e.stopImmediatePropagation()
      setPendingNav(href)
    }
    document.addEventListener('click', handler, true)
    return () => document.removeEventListener('click', handler, true)
  }, [isDirty])

  // ── Helpers ───────────────────────────────────────────────────────────
  const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean)
  const amenitiesAll = Array.from(new Set([...config.suggestedAmenities, ...amenities]))

  function validBusinessTab(): string | null {
    if (!title.trim()) return 'Please enter a name'
    if (destinationIds.length === 0) return 'Please add at least one location'
    // Stays and rentals need a map pin so travelers can navigate with GPS.
    // The free-text address field (building / floor / landmark) is optional
    // metadata on top — coords are what actually drive navigation.
    if ((type === 'stays' || type === 'rentals') && !pinLatLon) {
      return 'Please drop a map pin — use search, paste a Google Maps link, or tap "current location"'
    }
    return null
  }

  function validItemsTab(): string | null {
    if (items.length === 0) return 'Add at least one item'
    const needsImages = ['stays', 'activities', 'rentals'].includes(type)
    for (const i of items) {
      if (!i.name.trim()) return 'Every item needs a name'
      if (i.priceRupees == null || Number.isNaN(i.priceRupees)) return `"${i.name || 'Item'}" needs a price`
      if (i.priceRupees <= 0) return `"${i.name || 'Item'}" needs a price greater than 0`
      if (i.quantity < 0) return `"${i.name || 'Item'}" has a negative quantity`
      if (i.maxPerBooking < 1) return `"${i.name || 'Item'}" max-per-booking must be at least 1`
      if (needsImages && i.images.length === 0) return `"${i.name || 'Item'}" needs at least one photo`
      if (i.images.length > 5) return `"${i.name || 'Item'}" has more than 5 photos`
      if ((isRental || isActivity || isStay) && !i.unit) return `"${i.name || 'Item'}" needs a pricing unit`
    }
    return null
  }

  function collectBusinessErrors(): ValidationError[] {
    const errs: ValidationError[] = []
    if (!title.trim()) errs.push({ label: 'Business / property name', fieldId: 'field-title' })
    if (destinationIds.length === 0) errs.push({ label: 'Location (add at least one destination)', fieldId: 'field-location' })
    if ((type === 'stays' || type === 'rentals') && !pinLatLon)
      errs.push({ label: 'Map pin — required for stays & rentals', fieldId: 'field-address' })
    return errs
  }

  function collectItemErrors(): ValidationError[] {
    const errs: ValidationError[] = []
    const needsImages = ['stays', 'activities', 'rentals'].includes(type)
    if (items.length === 0) { errs.push({ label: 'Add at least one item', fieldId: '' }); return errs }
    for (const item of items) {
      const label = item.name.trim() || `Item ${items.indexOf(item) + 1}`
      if (!item.name.trim()) errs.push({ label: `Name for ${label}`, fieldId: `item-name-${item.localKey}` })
      if (item.priceRupees == null || item.priceRupees <= 0)
        errs.push({ label: `Price for "${label}"`, fieldId: `item-price-${item.localKey}` })
      if (needsImages && item.images.length === 0)
        errs.push({ label: `At least one photo for "${label}"`, fieldId: `item-images-${item.localKey}` })
      if ((isRental || isActivity || isStay) && !item.unit)
        errs.push({ label: `Pricing unit for "${label}"`, fieldId: `item-price-${item.localKey}` })
    }
    return errs
  }

  /**
   * Gate the "+ Add item" control: don't let hosts pile up blank cards. New
   * cards only unlock once every existing draft has the two required fields
   * (name + positive price) filled in.
   */
  function canAddAnother(): boolean {
    if (items.length >= 100) return false
    return items.every(i =>
      i.name.trim().length > 0 &&
      i.priceRupees != null &&
      !Number.isNaN(i.priceRupees) &&
      i.priceRupees > 0,
    )
  }

  function tryGoTo(next: number) {
    if (next === step) return
    if (next > step) {
      const errs = collectBusinessErrors()
      if (errs.length > 0) { setValidationPopup(errs); return }
      if (next > 1) {
        const itemErrs = collectItemErrors()
        if (itemErrs.length > 0) { setValidationPopup(itemErrs); return }
      }
    }
    setStep(next)
  }

  // ── Item editor handlers (shared create + edit) ───────────────────────
  function addDraft() {
    if (items.length >= 100) {
      toast.error('Maximum 100 items per listing')
      return
    }
    if (!canAddAnother()) {
      toast.error('Fill in name and price on your current item first')
      return
    }
    // Prepend so the freshly-added blank card shows at the top of the list —
    // users expect the thing they just clicked "+ Add" for to be immediately
    // visible rather than scrolled off the bottom.
    setItems(prev => [emptyDraft(type), ...prev])
  }

  function updateDraft(localKey: string, patch: Partial<DraftItem>) {
    setItems(prev => prev.map(i => i.localKey === localKey ? { ...i, ...patch } : i))
  }

  async function removeDraft(draft: DraftItem) {
    if (items.length === 1) {
      toast.error('Keep at least one item')
      return
    }
    if (!confirm(`Remove "${draft.name || 'this item'}"?`)) return
    // Edit mode: if this item is already in DB, delete server-side.
    if (mode === 'edit' && draft.dbId) {
      const res = await deleteServiceListingItem(draft.dbId)
      if ('error' in res && res.error) {
        toast.error(res.error)
        return
      }
      toast.success('Item removed')
    }
    setItems(prev => prev.filter(i => i.localKey !== draft.localKey))
  }

  async function handleItemImageAdd(draft: DraftItem, files: FileList | null) {
    if (!files || files.length === 0) return

    const oversized = Array.from(files).filter(f => f.size > UPLOAD_MAX_IMAGE_BYTES)
    if (oversized.length > 0) {
      const names = oversized.map(f => `"${f.name}" (${formatFileSize(f.size)})`).join(', ')
      toast.error(`${oversized.length === 1 ? 'Photo' : 'Photos'} too large — max ${formatFileSize(UPLOAD_MAX_IMAGE_BYTES)} each: ${names}`)
    }
    const sizeOk = Array.from(files).filter(f => f.size <= UPLOAD_MAX_IMAGE_BYTES)

    const remainingSlots = 5 - draft.images.length
    const toUpload = sizeOk.slice(0, remainingSlots)
    if (sizeOk.length > remainingSlots) {
      toast.error('Max 5 photos per item')
    }
    setUploadingLocalKey(draft.localKey)
    setUploadProgress(toUpload.map(() => 0))
    const uploaded: string[] = []
    for (let i = 0; i < toUpload.length; i++) {
      const url = await uploadImage(toUpload[i], (percent) => {
        setUploadProgress(prev => {
          const next = [...prev]
          next[i] = percent
          return next
        })
      })
      if (url) uploaded.push(url)
    }
    setUploadingLocalKey(null)
    setUploadProgress([])
    if (uploaded.length === 0) return
    updateDraft(draft.localKey, { images: [...draft.images, ...uploaded] })
  }

  /** Open the public-style preview in a new tab using the current in-memory
   *  form state — works in both create and edit mode, no persistence required. */
  function openPreview() {
    const primaryDest = destinations.find(d => d.id === (destinationIds[0] || ''))
    const pricedItems = items.filter(i => i.priceRupees != null && i.priceRupees > 0)
    const cheapest =
      (isRental || isStay) && pricedItems.length > 0
        ? pricedItems.reduce((a, b) => (a.priceRupees! <= b.priceRupees! ? a : b))
        : null
    const previewUnit =
      isRental || isStay ? (cheapest?.unit ?? config.defaultUnit) : unit
    const payload: HostServiceListingPreviewPayload = {
      type,
      title,
      shortDescription,
      description,
      unit: previewUnit,
      location,
      pinLat: pinLatLon?.lat ?? null,
      pinLon: pinLatLon?.lon ?? null,
      destinationId: primaryDest?.id ?? null,
      destinationName: primaryDest?.name ?? null,
      destinationState: primaryDest?.state ?? null,
      amenities: isRental || isStay ? [] : amenities,
      tags: tagsInput.split(',').map(t => t.trim()).filter(Boolean),
      hostImages: [],
      items: items.map(it => ({
        name: it.name,
        description: it.description,
        priceRupees: it.priceRupees ?? 0,
        quantity: it.quantity,
        maxPerBooking: it.maxPerBooking,
        images: it.images,
        unit: (isRental || isActivity || isStay) ? (it.unit ?? config.defaultUnit) : null,
        amenities: (isRental || isStay) ? (it.amenities ?? []) : null,
      })),
    }
    try {
      localStorage.setItem(SERVICE_LISTING_PREVIEW_HANDOFF_KEY, JSON.stringify(payload))
    } catch {
      toast.error('Could not open preview (storage blocked).')
      return
    }
    window.open('/host/service-listing-preview', '_blank', 'noopener,noreferrer')
  }

  // ── Save handlers ─────────────────────────────────────────────────────
  async function submitCreate() {
    const businessErr = validBusinessTab()
    if (businessErr) { toast.error(businessErr); setStep(0); return }
    const itemsErr = validItemsTab()
    if (itemsErr) { toast.error(itemsErr); setStep(1); return }

    setSaving(true)
    createSubmitCancelledRef.current = false
    setCreateSubmitOverlayOpen(true)
    const payload: HostServiceItemDraft[] = items.map(i => ({
      name: i.name.trim(),
      description: i.description.trim() || null,
      price_paise: Math.round((i.priceRupees ?? 0) * 100),
      quantity_available: i.maxPerBooking,
      max_per_booking: i.quantity,
      images: i.images,
      unit: (isRental || isActivity || isStay) ? (i.unit || config.defaultUnit) : null,
      amenities: (isRental || isStay) ? (i.amenities || []) : null,
    }))

    let result: Awaited<ReturnType<typeof createHostServiceListing>> | undefined
    try {
      result = await createHostServiceListing({
        title: title.trim(),
        description: description.trim() || null,
        short_description: shortDescription.trim() || null,
        type,
        unit,
        destination_ids: destinationIds,
        location: location.trim() || null,
        latitude: pinLatLon?.lat ?? null,
        longitude: pinLatLon?.lon ?? null,
        // Rentals & stays: master amenities empty — each item owns its own.
        amenities: isRental || isStay ? [] : amenities,
        tags,
        metadata: null,
        host_id: userId,
        items: payload,
        ...(type === 'activities' ? { event_schedule: buildEventSchedulePayload() } : {}),
      })
    } catch {
      toast.error('Submission failed. Please try again.')
      return
    } finally {
      setSaving(false)
      setCreateSubmitOverlayOpen(false)
    }

    if (!result) return

    if (createSubmitCancelledRef.current) {
      if (!('error' in result && result.error)) {
        toast.success('Your listing was submitted for review.')
        window.location.assign('/host')
      }
      return
    }

    if ('error' in result && result.error) {
      toast.error(result.error)
      return
    }
    toast.success('Listing submitted for review!')
    window.location.assign('/host')
  }

  function cancelCreateSubmitOverlay() {
    createSubmitCancelledRef.current = true
    setCreateSubmitOverlayOpen(false)
  }

  async function saveBusinessEdit() {
    if (mode !== 'edit') return
    const err = validBusinessTab()
    if (err) { toast.error(err); return }
    setSaving(true)
    const res = await updateHostServiceListing(props.listing.id, {
      title: title.trim(),
      description: description.trim() || null,
      short_description: shortDescription.trim() || null,
      ...((isRental || isActivity || isStay) ? {} : { unit, amenities }),
      ...(isStay ? { amenities: [] } : {}),
      destination_ids: destinationIds,
      location: location.trim() || null,
      latitude: pinLatLon?.lat ?? null,
      longitude: pinLatLon?.lon ?? null,
      tags,
      ...(type === 'activities' ? { event_schedule: buildEventSchedulePayload() } : {}),
    })
    setSaving(false)
    if ('error' in res && res.error) {
      toast.error(res.error)
      return
    }
    if ('statusChangedToPending' in res && res.statusChangedToPending) {
      toast.success('Saved — changes sent for admin review. Your listing stays visible.')
    } else {
      toast.success('Business details saved')
    }
    setSavedSnapshot(serializeFormState())
    router.refresh()
  }

  async function saveItemEdit(draft: DraftItem) {
    if (mode !== 'edit') return
    if (!draft.name.trim()) { toast.error('Item name required'); return }
    if (draft.priceRupees == null || Number.isNaN(draft.priceRupees) || draft.priceRupees <= 0) {
      toast.error('Please enter a price greater than 0')
      return
    }
    setSaving(true)
    try {
      if (draft.dbId) {
        const res = await updateServiceListingItem(draft.dbId, {
          name: draft.name,
          description: draft.description || null,
          price_paise: Math.round(draft.priceRupees * 100),
          quantity_available: draft.maxPerBooking,
          max_per_booking: draft.quantity,
          images: draft.images,
          ...(isRental || isStay
            ? { unit: draft.unit || config.defaultUnit, amenities: draft.amenities || [] }
            : isActivity
              ? { unit: draft.unit || config.defaultUnit }
              : {}),
        })
        if ('error' in res && res.error) {
          toast.error(res.error)
          return
        }
        toast.success('Item saved')
      } else {
        const res = await createServiceListingItem({
          service_listing_id: props.listing.id,
          name: draft.name,
          description: draft.description,
          price_paise: Math.round((draft.priceRupees ?? 0) * 100),
          quantity_available: draft.maxPerBooking,
          max_per_booking: draft.quantity,
          images: draft.images,
          position_order: items.findIndex(i => i.localKey === draft.localKey),
          ...(isRental || isStay
            ? { unit: draft.unit || config.defaultUnit, amenities: draft.amenities || [] }
            : isActivity
              ? { unit: draft.unit || config.defaultUnit }
              : {}),
        })
        if ('error' in res && res.error) {
          toast.error(res.error)
          return
        }
        if ('item' in res && res.item) {
          updateDraft(draft.localKey, { dbId: res.item.id })
          toast.success('Item added')
        }
      }
      setSavedSnapshot(serializeFormState())
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  /**
   * Master save: run the Business-tab save and then save every item. Used by
   * the footer "Save changes" button and by the unsaved-changes dialog's
   * "Save and leave" path. Returns true only when everything persisted.
   */
  async function saveAll(): Promise<boolean> {
    if (mode !== 'edit') return false
    const businessErr = validBusinessTab()
    if (businessErr) { toast.error(businessErr); setStep(0); return false }
    const itemsErr = validItemsTab()
    if (itemsErr) { toast.error(itemsErr); setStep(1); return false }

    setSaving(true)
    try {
      const businessRes = await updateHostServiceListing(props.listing.id, {
        title: title.trim(),
        description: description.trim() || null,
        short_description: shortDescription.trim() || null,
        ...((isRental || isActivity || isStay) ? {} : { unit, amenities }),
        ...(isStay ? { amenities: [] } : {}),
        destination_ids: destinationIds,
        location: location.trim() || null,
        latitude: pinLatLon?.lat ?? null,
        longitude: pinLatLon?.lon ?? null,
        tags,
        ...(type === 'activities' ? { event_schedule: buildEventSchedulePayload() } : {}),
      })
      if ('error' in businessRes && businessRes.error) {
        toast.error(businessRes.error)
        return false
      }
      let anyStatusChange = 'statusChangedToPending' in businessRes
        ? !!businessRes.statusChangedToPending
        : false

      // Save each item sequentially — order matters for position_order on
      // brand-new items, and concurrent writes to the same listing can race.
      for (const draft of items) {
        if (draft.dbId) {
          const res = await updateServiceListingItem(draft.dbId, {
            name: draft.name,
            description: draft.description || null,
            price_paise: Math.round((draft.priceRupees ?? 0) * 100),
            quantity_available: draft.maxPerBooking,
            max_per_booking: draft.quantity,
            images: draft.images,
            ...(isRental || isStay
              ? { unit: draft.unit || config.defaultUnit, amenities: draft.amenities || [] }
              : isActivity
                ? { unit: draft.unit || config.defaultUnit }
                : {}),
          })
          if ('error' in res && res.error) {
            toast.error(`"${draft.name}": ${res.error}`)
            return false
          }
          if ('statusChangedToPending' in res && res.statusChangedToPending) {
            anyStatusChange = true
          }
        } else {
          const res = await createServiceListingItem({
            service_listing_id: props.listing.id,
            name: draft.name,
            description: draft.description,
            price_paise: Math.round((draft.priceRupees ?? 0) * 100),
            quantity_available: draft.maxPerBooking,
            max_per_booking: draft.quantity,
            images: draft.images,
            position_order: items.findIndex(i => i.localKey === draft.localKey),
            ...(isRental || isStay
              ? { unit: draft.unit || config.defaultUnit, amenities: draft.amenities || [] }
              : isActivity
                ? { unit: draft.unit || config.defaultUnit }
                : {}),
          })
          if ('error' in res && res.error) {
            toast.error(`"${draft.name}": ${res.error}`)
            return false
          }
          if ('item' in res && res.item) {
            updateDraft(draft.localKey, { dbId: res.item.id })
          }
          if ('statusChangedToPending' in res && res.statusChangedToPending) {
            anyStatusChange = true
          }
        }
      }

      setSavedSnapshot(serializeFormState())
      if (anyStatusChange) {
        toast.success('All changes saved — sent for admin review. Your listing stays visible.')
      } else {
        toast.success('All changes saved')
      }
      router.refresh()
      return true
    } finally {
      setSaving(false)
    }
  }

  function goToPendingNav() {
    const target = pendingNav
    setPendingNav(null)
    if (!target) return
    // Clear the saved snapshot so the click handler won't re-trap our own
    // nav — we've already confirmed.
    setSavedSnapshot(currentSnapshot)
    router.push(target)
  }

  async function saveAndLeave() {
    const ok = await saveAll()
    if (ok) goToPendingNav()
  }

  function discardAndLeave() {
    goToPendingNav()
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <>
      <HostSubmittingOverlay
        open={createSubmitOverlayOpen}
        message="Submitting…"
        onCancel={cancelCreateSubmitOverlay}
      />
    <div className="space-y-6">
      {/* Stepper */}
      <div className="flex flex-wrap gap-2">
        {STEPS.map((s, idx) => {
          const Icon = s.icon
          const active = idx === step
          return (
            <button
              key={s.label}
              type="button"
              onClick={() => tryGoTo(idx)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {s.label}
            </button>
          )
        })}
      </div>

      {/* Business tab */}
      {step === 0 && (
        <div className="space-y-6 bg-card border border-border rounded-xl p-6">
          <div id="field-location" className="space-y-2">
            <label className="text-sm font-semibold">Locations *</label>
            <div className="flex flex-wrap items-center gap-2">
              {destinationIds.map(id => {
                const d = knownDestinations.find(x => x.id === id)
                if (!d) return null
                return (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/30 text-xs text-primary"
                  >
                    {d.name}, {d.state}
                    <button
                      type="button"
                      onClick={() => setDestinationIds(prev => prev.filter(x => x !== id))}
                      className="hover:text-destructive"
                      aria-label="Remove"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )
              })}
              {!addingLocation && (
                <button
                  type="button"
                  onClick={() => setAddingLocation(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-secondary border border-border text-foreground hover:bg-secondary/80"
                >
                  + Add location
                </button>
              )}
            </div>

            {addingLocation && (
              <div className="pt-1">
                <HostDestinationSearch
                  destinations={knownDestinations}
                  excludeIds={destinationIds}
                  onPick={(picked) => {
                    setKnownDestinations(prev =>
                      prev.find(d => d.id === picked.id)
                        ? prev
                        : [...prev, { ...picked, country: 'India', slug: '', image_url: null, description: null, created_at: new Date().toISOString() } as Destination],
                    )
                    setDestinationIds(prev => prev.includes(picked.id) ? prev : [...prev, picked.id])
                    setAddingLocation(false)
                  }}
                  placeholder="Search any destination in India..."
                />
                <button
                  type="button"
                  onClick={() => setAddingLocation(false)}
                  className="mt-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold">{config.titleLabel} *</label>
            <input
              id="field-title"
              type="text"
              placeholder={config.titlePlaceholder}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:border-primary text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold">
              Address details <span className="text-xs font-normal text-muted-foreground">(optional)</span>
            </label>
            <div className="relative" ref={suggestionsRef}>
              <input
                id="field-address"
                type="text"
                placeholder="Building / floor / landmark (optional)"
                value={location}
                onChange={(e) => { setLocation(e.target.value); setShowSuggestions(false) }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); previewLocationOnMap() } }}
                className="w-full px-3 py-2 pr-20 rounded-lg border border-border bg-background focus:outline-none focus:border-primary text-sm"
              />
              <button
                type="button"
                onClick={useCurrentLocation}
                disabled={geocoding}
                className="absolute right-9 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary disabled:opacity-40 transition-colors"
                title="Use my current location"
              >
                <LocateFixed className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={previewLocationOnMap}
                disabled={geocoding || !location.trim()}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary disabled:opacity-40 transition-colors"
                title="Search this address on the map"
              >
                {geocoding ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
              </button>

              {/* Multi-result suggestions dropdown */}
              {showSuggestions && geoSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 z-30 rounded-lg border border-border bg-card shadow-lg overflow-hidden">
                  {geoSuggestions.map((r, i) => {
                    const parts = r.display_name.split(', ')
                    const primary = parts.slice(0, 2).join(', ')
                    const secondary = parts.slice(2).join(', ')
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => openMapAt(r)}
                        className="w-full text-left px-3 py-2.5 hover:bg-primary/10 transition-colors border-b border-border last:border-0"
                      >
                        <p className="text-sm font-medium truncate">{primary}</p>
                        {secondary && <p className="text-xs text-muted-foreground truncate">{secondary}</p>}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Google Maps URL fallback */}
            <div>
              <button
                type="button"
                onClick={() => setShowMapsUrl(v => !v)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors mt-1"
              >
                <LinkIcon className="h-3 w-3" />
                Paste a Google Maps link instead
                <ChevronDown className={`h-3 w-3 transition-transform ${showMapsUrl ? 'rotate-180' : ''}`} />
              </button>
              {showMapsUrl && (
                <div className="mt-2 flex gap-2">
                  <input
                    type="url"
                    placeholder="https://maps.app.goo.gl/... or google.com/maps/place/..."
                    value={mapsUrlInput}
                    onChange={(e) => setMapsUrlInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleMapsUrl() } }}
                    className="flex-1 px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:border-primary text-sm"
                  />
                  <button
                    type="button"
                    onClick={handleMapsUrl}
                    disabled={mapsUrlLoading || !mapsUrlInput.trim()}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors whitespace-nowrap"
                  >
                    {mapsUrlLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
                    Use link
                  </button>
                </div>
              )}
            </div>

            {/* Map pin — separate required field for stays/rentals. Holds the
                coordinates used for GPS navigation, independent of the free-text
                address above (which is for building / floor / landmark info). */}
            <div className="pt-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Map pin{(type === 'stays' || type === 'rentals') && (
                  <span className="text-red-500 ml-0.5">*</span>
                )}
              </label>
              {pinLatLon ? (
                <div className="mt-1.5 flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/30">
                  <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${pinLatLon.lat},${pinLatLon.lon}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-primary hover:underline truncate block"
                      title="Open in Google Maps"
                    >
                      {pinDisplayName || 'Saved map pin'}
                    </a>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {pinLatLon.lat.toFixed(5)}, {pinLatLon.lon.toFixed(5)} · Opens in Google Maps
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setPinLatLon(null); setPinDisplayName(null) }}
                    className="flex-shrink-0 h-6 w-6 flex items-center justify-center rounded-full text-muted-foreground hover:text-red-600 hover:bg-red-500/10 transition-colors"
                    title="Remove pin"
                    aria-label="Remove map pin"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold">Short description</label>
            <input
              type="text"
              placeholder="One-line description for search results"
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:border-primary text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold">About your business</label>
            <TripDescriptionMarkdownToolbar
              textareaRef={descRef}
              value={description}
              onChange={setDescription}
            />
            <textarea
              ref={descRef}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              placeholder="Tell travelers about your shop / property / agency — experience, specialties, what makes you different."
              className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:border-primary text-sm resize-y"
            />
          </div>

          {!isRental && !isActivity && !isStay && (
            <div className="space-y-2">
              <label className="text-sm font-semibold">Pricing unit *</label>
              <p className="text-xs text-muted-foreground">Applied to every item under this listing.</p>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as Unit)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:border-primary text-sm"
              >
                {config.unitOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}

          {!isRental && !isStay && (
          <div className="space-y-2">
            <label className="text-sm font-semibold">Amenities / features</label>
            <div className="flex flex-wrap gap-2">
              {amenitiesAll.map(a => {
                const selected = amenities.includes(a)
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAmenities(prev => selected ? prev.filter(x => x !== a) : [...prev, a])}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      selected
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary border border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {a}
                  </button>
                )
              })}
            </div>
            <div className="flex gap-2 pt-1">
              <input
                type="text"
                placeholder="Add your own (e.g., Heater, Balcony)"
                value={customAmenity}
                onChange={(e) => setCustomAmenity(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    const v = customAmenity.trim()
                    if (v && !amenities.includes(v)) setAmenities(prev => [...prev, v])
                    setCustomAmenity('')
                  }
                }}
                className="flex-1 px-3 py-1.5 rounded-lg border border-border bg-background focus:outline-none focus:border-primary text-xs"
              />
              <button
                type="button"
                onClick={() => {
                  const v = customAmenity.trim()
                  if (v && !amenities.includes(v)) setAmenities(prev => [...prev, v])
                  setCustomAmenity('')
                }}
                disabled={!customAmenity.trim()}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-secondary border border-border text-foreground hover:bg-secondary/80 disabled:opacity-50"
              >
                + Add
              </button>
            </div>
          </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-semibold">Tags</label>
            <input
              type="text"
              placeholder="e.g., family-friendly, budget, adventure"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:border-primary text-sm"
            />
          </div>

          {type === 'activities' && (() => {
            const todayStr = new Date().toISOString().slice(0, 10)
            const allPast = isDateSpecific && eventSchedule.length > 0 &&
              eventSchedule.every(e => e.date < todayStr)
            return (
              <div className="space-y-3 pt-2 border-t border-border/60">
                <div>
                  <label className="text-sm font-semibold">Is this a date-specific activity?</label>
                  <p className="text-xs text-muted-foreground">
                    Date-specific activities auto-hide from Explore once every date passes. Leave off for ongoing offerings.
                  </p>
                  <div className="mt-2 flex gap-2">
                    {[{v: false, l: 'No, ongoing'}, {v: true, l: 'Yes, specific dates'}].map(opt => (
                      <button
                        key={opt.l}
                        type="button"
                        onClick={() => {
                          setIsDateSpecific(opt.v)
                          if (!opt.v) { setHasSlots(false); setEventSchedule([]); setNewEventDate('') }
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          isDateSpecific === opt.v
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary border border-border text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {opt.l}
                      </button>
                    ))}
                  </div>
                </div>

                {isDateSpecific && (
                  <div>
                    <label className="text-sm font-semibold">Multiple time slots per date?</label>
                    <p className="text-xs text-muted-foreground">
                      Off = one all-day session per date. On = add specific start/end times travelers can book.
                    </p>
                    <div className="mt-2 flex gap-2">
                      {[{v: false, l: 'No'}, {v: true, l: 'Yes'}].map(opt => (
                        <button
                          key={opt.l}
                          type="button"
                          onClick={() => {
                            setHasSlots(opt.v)
                            if (!opt.v) setEventSchedule(prev => prev.map(e => ({ ...e, slots: [] })))
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            hasSlots === opt.v
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-secondary border border-border text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {opt.l}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {isDateSpecific && (
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Dates {hasSlots ? '& time slots' : ''}</label>
                    <div className="flex gap-2">
                      <input
                        type="date"
                        value={newEventDate}
                        min={todayStr}
                        onChange={(e) => setNewEventDate(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:border-primary text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const v = newEventDate
                          if (!v) return
                          if (eventSchedule.some(e => e.date === v)) { toast.error('That date is already added'); return }
                          setEventSchedule(prev => [...prev, { date: v, slots: [] }].sort((a, b) => a.date.localeCompare(b.date)))
                          setNewEventDate('')
                        }}
                        disabled={!newEventDate}
                        className="px-3 py-2 rounded-lg text-xs font-semibold bg-secondary border border-border text-foreground hover:bg-secondary/80 disabled:opacity-50"
                      >
                        + Add date
                      </button>
                    </div>

                    {eventSchedule.length > 0 && (
                      <div className="space-y-2 pt-1">
                        {eventSchedule.map((entry, idx) => {
                          const isPast = entry.date < todayStr
                          return (
                            <div
                              key={entry.date}
                              className={`rounded-lg border p-3 ${
                                isPast ? 'bg-muted/30 border-border' : 'bg-secondary/40 border-border'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className={`text-sm font-semibold ${isPast ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                                  {new Date(entry.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setEventSchedule(prev => prev.filter((_, i) => i !== idx))}
                                  className="text-xs text-red-500 hover:underline"
                                >
                                  Remove
                                </button>
                              </div>

                              {hasSlots && (
                                <div className="mt-2 space-y-1.5">
                                  {entry.slots.map((slot, si) => (
                                    <div key={si} className="flex items-center gap-2">
                                      <input
                                        type="time"
                                        value={slot.start}
                                        onChange={(e) => setEventSchedule(prev => prev.map((x, i) =>
                                          i === idx
                                            ? { ...x, slots: x.slots.map((s, j) => j === si ? { ...s, start: e.target.value } : s) }
                                            : x
                                        ))}
                                        className="flex-1 px-2 py-1.5 rounded-md border border-border bg-background text-xs focus:outline-none focus:border-primary"
                                      />
                                      <span className="text-xs text-muted-foreground">to</span>
                                      <input
                                        type="time"
                                        value={slot.end}
                                        onChange={(e) => setEventSchedule(prev => prev.map((x, i) =>
                                          i === idx
                                            ? { ...x, slots: x.slots.map((s, j) => j === si ? { ...s, end: e.target.value } : s) }
                                            : x
                                        ))}
                                        className="flex-1 px-2 py-1.5 rounded-md border border-border bg-background text-xs focus:outline-none focus:border-primary"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => setEventSchedule(prev => prev.map((x, i) =>
                                          i === idx ? { ...x, slots: x.slots.filter((_, j) => j !== si) } : x
                                        ))}
                                        className="text-muted-foreground hover:text-red-500"
                                        aria-label="Remove slot"
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  ))}
                                  <button
                                    type="button"
                                    onClick={() => setEventSchedule(prev => prev.map((x, i) =>
                                      i === idx ? { ...x, slots: [...x.slots, { start: '09:00', end: '11:00' }] } : x
                                    ))}
                                    className="text-xs text-primary hover:underline"
                                  >
                                    + Add time slot
                                  </button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {allPast && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 pt-1">
                        All dates have passed — this listing is hidden from Explore. Add a future date to relist.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })()}

          {mode === 'edit' && (
            <div className="pt-4 border-t border-border">
              <Button onClick={saveBusinessEdit} disabled={saving || !isDirty}>
                {saving ? 'Saving…' : 'Save business details'}
              </Button>
              {!isDirty && (
                <p className="text-xs text-muted-foreground mt-1.5">No unsaved changes.</p>
              )}
            </div>
          )}

          {mode === 'edit' && (
            <CoHostSection
              listingId={props.listing.id}
              isPrimaryHost={props.listing.host_id === userId}
            />
          )}
        </div>
      )}

      {/* Items tab */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Items</h3>
              <p className="text-xs text-muted-foreground">
                Add up to 100 items. Each item can have up to 5 photos.
                {typeof listingBookingCount === 'number' && (
                  <>
                    {' '}
                    <span className="text-foreground/80">
                      This listing has {listingBookingCount} booking{listingBookingCount === 1 ? '' : 's'} (excludes cancelled).
                    </span>
                  </>
                )}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addDraft}
              disabled={!canAddAnother()}
              title={canAddAnother() ? '' : 'Fill in name and price on your current item first'}
            >
              + Add item
            </Button>
          </div>

          <div className="space-y-4">
            {items.map((draft, idx) => (
              <div key={draft.localKey} className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">
                    Item {idx + 1}
                    {mode === 'edit' && draft.dbId && bookingCountByItemId && (
                      <span className="ml-1.5 font-normal tabular-nums">
                        · {bookingCountByItemId[draft.dbId] ?? 0} booking
                        {(bookingCountByItemId[draft.dbId] ?? 0) === 1 ? '' : 's'}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeDraft(draft)}
                    className="text-xs text-red-500 hover:underline"
                  >
                    Remove
                  </button>
                </div>

                <div>
                  <label className="text-xs font-semibold">Name *</label>
                  <input
                    id={`item-name-${draft.localKey}`}
                    type="text"
                    value={draft.name}
                    onChange={(e) => updateDraft(draft.localKey, { name: e.target.value })}
                    placeholder={config.itemNamePlaceholder}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-primary"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold">Description</label>
                  <TripDescriptionMarkdownToolbar
                    textareaRef={{ current: itemDescRefs.current[draft.localKey] ?? null }}
                    value={draft.description}
                    onChange={(next) => updateDraft(draft.localKey, { description: next })}
                  />
                  <textarea
                    ref={(el) => { itemDescRefs.current[draft.localKey] = el }}
                    value={draft.description}
                    onChange={(e) => updateDraft(draft.localKey, { description: e.target.value })}
                    rows={3}
                    placeholder="Optional details specific to this item. Use **bold**, ## heading, - bullet."
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-primary resize-y"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs font-semibold">Price (₹) *</label>
                    <input
                      id={`item-price-${draft.localKey}`}
                      type="number"
                      min="0"
                      required
                      placeholder="Enter price"
                      value={draft.priceRupees ?? ''}
                      onChange={(e) => {
                        const v = e.target.value
                        updateDraft(draft.localKey, {
                          priceRupees: v === '' ? null : Number(v),
                        })
                      }}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold">Max per order</label>
                    <input
                      type="number"
                      min="1"
                      value={draft.quantity}
                      onChange={(e) => updateDraft(draft.localKey, { quantity: Number(e.target.value) })}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold">Total available</label>
                    <input
                      type="number"
                      min="1"
                      value={draft.maxPerBooking}
                      onChange={(e) => updateDraft(draft.localKey, { maxPerBooking: Number(e.target.value) })}
                      className={`mt-1 w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:border-primary ${draft.quantity > (draft.maxPerBooking || 0) ? 'border-red-500' : 'border-border'}`}
                    />
                  </div>
                </div>

                {draft.quantity > (draft.maxPerBooking || 0) && draft.maxPerBooking > 0 && (
                  <p className="text-xs text-red-500 font-medium">
                    "Max per order" ({draft.quantity}) cannot exceed "Total available" ({draft.maxPerBooking}). Reduce max per order.
                  </p>
                )}

                {(isRental || isActivity || isStay) && (
                  <div className={isRental || isStay ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : ''}>
                    <div>
                      <label className="text-xs font-semibold">Pricing unit *</label>
                      <select
                        value={draft.unit || config.defaultUnit}
                        onChange={(e) => updateDraft(draft.localKey, { unit: e.target.value as Unit })}
                        className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-primary"
                      >
                        {config.unitOptions.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    {(isRental || isStay) && <div>
                      <label className="text-xs font-semibold">Amenities / features</label>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {Array.from(new Set([...config.suggestedAmenities, ...(draft.amenities || [])])).map(a => {
                          const selected = (draft.amenities || []).includes(a)
                          return (
                            <button
                              key={a}
                              type="button"
                              onClick={() =>
                                updateDraft(draft.localKey, {
                                  amenities: selected
                                    ? (draft.amenities || []).filter(x => x !== a)
                                    : [...(draft.amenities || []), a],
                                })
                              }
                              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                                selected
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-secondary border border-border text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              {a}
                            </button>
                          )
                        })}
                      </div>
                      <div className="mt-2 flex gap-2">
                        <input
                          type="text"
                          placeholder={isStay ? 'Add your own (e.g., Heater, Balcony)' : 'Add your own (e.g., Helmet, Child seat)'}
                          value={customItemAmenity[draft.localKey] || ''}
                          onChange={(e) =>
                            setCustomItemAmenity(prev => ({ ...prev, [draft.localKey]: e.target.value }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              const v = (customItemAmenity[draft.localKey] || '').trim()
                              const current = draft.amenities || []
                              if (v && !current.includes(v)) {
                                updateDraft(draft.localKey, { amenities: [...current, v] })
                              }
                              setCustomItemAmenity(prev => ({ ...prev, [draft.localKey]: '' }))
                            }
                          }}
                          className="flex-1 px-2.5 py-1 rounded-md border border-border bg-background text-[11px] focus:outline-none focus:border-primary"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const v = (customItemAmenity[draft.localKey] || '').trim()
                            const current = draft.amenities || []
                            if (v && !current.includes(v)) {
                              updateDraft(draft.localKey, { amenities: [...current, v] })
                            }
                            setCustomItemAmenity(prev => ({ ...prev, [draft.localKey]: '' }))
                          }}
                          disabled={!(customItemAmenity[draft.localKey] || '').trim()}
                          className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-secondary border border-border text-foreground hover:bg-secondary/80 disabled:opacity-50"
                        >
                          + Add
                        </button>
                      </div>
                    </div>}
                  </div>
                )}

                <div id={`item-images-${draft.localKey}`}>
                  <label className="text-xs font-semibold">Photos ({draft.images.length} / 5)</label>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {draft.images.map((url, i) => {
                      const isCover = i === 0
                      return (
                        <div key={url} className="relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt="item"
                            className={`h-16 w-16 rounded-lg object-cover ${isCover ? 'ring-2 ring-primary' : ''}`}
                          />
                          {isCover ? (
                            <span className="absolute bottom-0 left-0 right-0 bg-primary/90 text-primary-foreground text-[9px] font-semibold text-center rounded-b-lg py-0.5">
                              Cover
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                updateDraft(draft.localKey, {
                                  images: [url, ...draft.images.filter(u => u !== url)],
                                })
                              }
                              className="absolute bottom-0.5 left-0.5 h-5 w-5 rounded-full bg-background/90 border border-border flex items-center justify-center shadow hover:bg-primary hover:text-primary-foreground transition-colors"
                              aria-label="Make cover"
                              title="Make this the cover photo"
                            >
                              <Star className="h-3 w-3" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => updateDraft(draft.localKey, { images: draft.images.filter(u => u !== url) })}
                            className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-background border border-border text-xs shadow"
                            aria-label="Remove"
                          >
                            ×
                          </button>
                        </div>
                      )
                    })}
                    {uploadingLocalKey === draft.localKey && uploadProgress.map((pct, i) => (
                      <div
                        key={`upload-${i}`}
                        className="relative h-16 w-16 rounded-lg border-2 border-primary/40 bg-secondary/40 overflow-hidden flex items-center justify-center"
                      >
                        <div
                          className="absolute inset-x-0 bottom-0 bg-primary/25 transition-[height] duration-200 ease-out"
                          style={{ height: `${pct}%` }}
                        />
                        <div className="relative flex flex-col items-center gap-0.5 text-[10px] font-semibold text-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                          <span>{pct}%</span>
                        </div>
                      </div>
                    ))}
                    {draft.images.length < 5 && uploadingLocalKey !== draft.localKey && (
                      <label className="h-16 w-16 rounded-lg border-2 border-dashed border-border flex items-center justify-center text-xs text-muted-foreground cursor-pointer hover:border-primary">
                        + Add
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(e) => { handleItemImageAdd(draft, e.target.files); e.target.value = '' }}
                        />
                      </label>
                    )}
                  </div>
                </div>

                {mode === 'edit' && (
                  <div className="pt-2">
                    <Button size="sm" onClick={() => saveItemEdit(draft)} disabled={saving}>
                      {draft.dbId ? 'Save item' : 'Add item'}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Review tab */}
      {step === 2 && (
        <div className="space-y-4 bg-card border border-border rounded-xl p-6">
          <div>
            <h3 className="font-bold text-lg">{title || 'Untitled listing'}</h3>
            <p className="text-xs text-muted-foreground mt-1 capitalize">
              {config.heading.toLowerCase()}{(isRental || isStay) ? '' : ` · ${unit.replace('_', ' ')}`}
            </p>
            {shortDescription && (
              <p className="text-sm text-muted-foreground mt-2">{shortDescription}</p>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {destinationIds.map(id => {
              const d = knownDestinations.find(x => x.id === id)
              if (!d) return null
              return (
                <span key={id} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  {d.name}, {d.state}
                </span>
              )
            })}
          </div>

          {description && (
            <div>
              <h4 className="text-sm font-semibold mb-1">About</h4>
              <TripDescriptionDisplay className="text-sm text-muted-foreground">
                {description}
              </TripDescriptionDisplay>
            </div>
          )}

          <div>
            <h4 className="text-sm font-semibold mb-2">
              Items ({items.length})
              {typeof listingBookingCount === 'number' && (
                <span className="ml-2 text-xs font-normal text-muted-foreground tabular-nums">
                  · {listingBookingCount} booking{listingBookingCount === 1 ? '' : 's'} total
                </span>
              )}
            </h4>
            <ul className="space-y-3">
              {items.map(i => (
                <li key={i.localKey} className="rounded-lg border border-border p-3">
                  <div className="flex items-start gap-3">
                    {i.images[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={i.images[0]} alt="" className="h-14 w-14 rounded object-cover flex-shrink-0" />
                    ) : (
                      <div className="h-14 w-14 rounded bg-secondary flex-shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{i.name || 'Unnamed item'}</div>
                      <div className="text-xs text-muted-foreground">
                        ₹{(i.priceRupees ?? 0).toLocaleString('en-IN')}
                        {(isRental || isActivity || isStay) && i.unit ? ` / ${i.unit.replace('per_', '').replace('_', ' ')}` : ''}
                        {' · '}{i.maxPerBooking} available · max {i.quantity}/order · {i.images.length} photo{i.images.length === 1 ? '' : 's'}
                        {mode === 'edit' && i.dbId && bookingCountByItemId && (
                          <>
                            {' · '}
                            <span className="tabular-nums text-foreground/80">
                              {bookingCountByItemId[i.dbId] ?? 0} booking
                              {(bookingCountByItemId[i.dbId] ?? 0) === 1 ? '' : 's'}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  {i.description.trim() && (
                    <TripDescriptionDisplay className="mt-2 text-xs text-muted-foreground">
                      {i.description}
                    </TripDescriptionDisplay>
                  )}
                  {(isRental || isStay) && i.amenities && i.amenities.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {i.amenities.map(a => (
                        <span key={a} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary">{a}</span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {!isRental && !isStay && amenities.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-1">Amenities</h4>
              <div className="flex flex-wrap gap-1.5">
                {amenities.map(a => (
                  <span key={a} className="text-xs px-2 py-0.5 rounded bg-secondary">{a}</span>
                ))}
              </div>
            </div>
          )}

          {mode === 'create' && (
            <div className="pt-2 space-y-2">
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={openPreview}
                  className="gap-1.5 w-full sm:w-auto"
                >
                  <Eye className="h-4 w-4" />
                  Preview
                </Button>
                <Button onClick={submitCreate} disabled={saving} className="flex-1">
                  {saving ? 'Submitting…' : 'Submit for review'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                An admin will review your listing and notify you on approval.
              </p>
            </div>
          )}
          {mode === 'edit' && (
            <div className="pt-2 text-xs text-muted-foreground">
              Use <strong>Save changes</strong> below to persist edits from every tab in one go —
              or keep using each tab&apos;s own Save button. Substantive changes to an approved
              listing reset its status to Pending for re-review.
            </div>
          )}
        </div>
      )}

      {/* Edit-mode action bar: master save + preview. Sits above the
          back/next nav so hosts can commit or preview from any tab. */}
      {mode === 'edit' && (
        <div className="sticky bottom-0 z-20 -mx-4 px-4 sm:mx-0 sm:px-0 pt-3 pb-3 bg-gradient-to-t from-background via-background to-background/60 border-t border-border backdrop-blur">
          <div className="flex flex-wrap items-center gap-2 justify-between">
            <div className="text-xs">
              {isDirty ? (
                <span className="inline-flex items-center gap-1.5 text-amber-500">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  Unsaved changes
                </span>
              ) : (
                <span className="text-muted-foreground">All changes saved</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={openPreview}
                title="Open a draft-accurate preview in a new tab"
              >
                <Eye className="h-4 w-4 mr-1.5" />
                Preview
              </Button>
              {initialListing?.slug && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(`/listings/${type}/${initialListing.slug}`, '_blank', 'noopener,noreferrer')}
                  title="Open the public (last-saved) listing page"
                >
                  <ExternalLink className="h-4 w-4 mr-1.5" />
                  Public page
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                onClick={saveAll}
                disabled={saving || !isDirty}
              >
                <Save className="h-4 w-4 mr-1.5" />
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Nav */}
      <div className="flex justify-between pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => tryGoTo(Math.max(0, step - 1))}
          disabled={step === 0}
        >
          <ChevronLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={() => tryGoTo(step + 1)}>
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (isDirty) { setPendingNav('/host'); return }
              router.push('/host')
            }}
          >
            Back to host dashboard
          </Button>
        )}
      </div>

      {/* Map preview modal — interactive draggable-pin map */}
      {mapPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setMapPreview(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-lg rounded-xl border border-border bg-card p-5 space-y-3 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-base">Adjust pin location</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Drag the pin to the exact spot</p>
              </div>
              <button type="button" onClick={() => setMapPreview(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2">{mapPreview.displayName}</p>
            <DraggablePinMap
              lat={mapPreview.lat}
              lon={mapPreview.lon}
              onChange={(newLat, newLon, displayName) => {
                // Only update the preview while dragging — the pin isn't
                // committed to the form until "Use this location" is clicked,
                // so closing the modal doesn't leak an unintended pin.
                setMapPreview({ lat: newLat, lon: newLon, displayName })
              }}
            />
            <div className="flex flex-wrap justify-between items-center gap-2 pt-1">
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${mapPreview.lat},${mapPreview.lon}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Google Maps
              </a>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPinLatLon({ lat: mapPreview.lat, lon: mapPreview.lon })
                    setPinDisplayName(mapPreview.displayName)
                    setMapPreview(null)
                  }}
                >
                  Use this pin
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setMapPreview(null)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Validation popup — lists empty required fields; clicking an error scrolls to it */}
      {validationPopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setValidationPopup(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md rounded-xl border border-border bg-card p-5 space-y-3 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-base">Please fill in required fields</h3>
              <button type="button" onClick={() => setValidationPopup(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="space-y-1.5">
              {validationPopup.map((err) => (
                <li key={`${err.fieldId}-${err.label}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setValidationPopup(null)
                      if (err.fieldId) {
                        const el = document.getElementById(err.fieldId)
                        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                        ;(el as HTMLInputElement | null)?.focus?.()
                      }
                    }}
                    className="text-left text-sm text-primary hover:underline w-full"
                  >
                    → {err.label}
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex justify-end pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setValidationPopup(null)}>
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Unsaved-changes dialog: fires when host clicks an internal link
          with unsaved edits. beforeunload handles tab close via the
          browser's generic prompt. */}
      {pendingNav && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setPendingNav(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md rounded-xl border border-border bg-card p-5 space-y-3 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-base">Unsaved changes</h3>
            <p className="text-sm text-muted-foreground">
              You have edits that haven&apos;t been saved yet. What would you like to do?
            </p>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPendingNav(null)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={discardAndLeave}
                disabled={saving}
                className="text-red-500 hover:text-red-600"
              >
                Discard &amp; leave
              </Button>
              <Button
                type="button"
                onClick={saveAndLeave}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save & leave'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  )
}
