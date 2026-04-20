'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Building2, Package, Eye, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { HostDestinationSearch } from '@/components/hosting/HostDestinationSearch'
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
import type {
  Destination,
  ServiceListing,
  ServiceListingItem,
  ServiceListingMetadata,
  ServiceListingType,
} from '@/types'

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
  defaultUnit: Unit
  suggestedAmenities: string[]
  unitOptions: { value: Unit; label: string }[]
}> = {
  stays: {
    heading: 'Stay',
    titleLabel: 'Business / property name',
    titleHint: 'The name of your stay or property — travelers see this first.',
    titlePlaceholder: 'e.g., Mountain View Homestay, Riverbank Cottages',
    defaultUnit: 'per_night',
    suggestedAmenities: ['WiFi', 'Kitchen', 'Bathroom', 'AC', 'Parking'],
    unitOptions: [
      { value: 'per_night', label: 'Per night' },
      { value: 'per_day', label: 'Per day' },
      { value: 'per_week', label: 'Per week' },
    ],
  },
  activities: {
    heading: 'Activity',
    titleLabel: 'Business / experience name',
    titleHint: 'Your company or offering name. Individual activities go in as items below.',
    titlePlaceholder: 'e.g., Himalayan Adventures, Spiti Photography Tours',
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
  priceRupees: number
  quantity: number
  maxPerBooking: number
  images: string[]
}

function emptyDraft(): DraftItem {
  return {
    localKey: typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `new-${Math.random().toString(36).slice(2)}`,
    name: '',
    description: '',
    priceRupees: 0,
    quantity: 1,
    maxPerBooking: 1,
    images: [],
  }
}

function itemFromRow(row: ServiceListingItem): DraftItem {
  return {
    dbId: row.id,
    localKey: row.id,
    name: row.name,
    description: row.description || '',
    priceRupees: row.price_paise / 100,
    quantity: row.quantity_available,
    maxPerBooking: row.max_per_booking,
    images: row.images,
  }
}

async function uploadImage(file: File): Promise<string | null> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('purpose', 'host_trip')
  const res = await fetch('/api/upload', { method: 'POST', body: fd })
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: 'Upload failed' }))
    toast.error(error || 'Upload failed')
    return null
  }
  const { url } = await res.json()
  return url as string
}

export function HostServiceListingTabs(props: Props) {
  const { type, destinations, userId, mode } = props
  const router = useRouter()
  const config = TYPE_CONFIG[type]

  const initialListing = mode === 'edit' ? props.listing : null
  const initialItems = mode === 'edit' ? props.initialItems : []

  const [step, setStep] = useState(() => {
    const t = props.initialTab
    if (typeof t === 'number' && t >= 0 && t < STEPS.length) return t
    return 0
  })
  const [saving, setSaving] = useState(false)

  // ── Business tab state ────────────────────────────────────────────────
  const [knownDestinations, setKnownDestinations] = useState<Destination[]>(destinations)
  const [addingLocation, setAddingLocation] = useState(false)
  const [title, setTitle] = useState(initialListing?.title || '')
  const [destinationIds, setDestinationIds] = useState<string[]>(
    initialListing?.destination_ids || (initialListing?.destination_id ? [initialListing.destination_id] : []),
  )
  const [location, setLocation] = useState(initialListing?.location || '')
  const [shortDescription, setShortDescription] = useState(initialListing?.short_description || '')
  const [description, setDescription] = useState(initialListing?.description || '')
  const [unit, setUnit] = useState<Unit>((initialListing?.unit as Unit) || config.defaultUnit)
  const [amenities, setAmenities] = useState<string[]>(
    initialListing?.amenities || [...config.suggestedAmenities],
  )
  const [tagsInput, setTagsInput] = useState((initialListing?.tags || []).join(', '))
  const [customAmenity, setCustomAmenity] = useState('')
  const descRef = useRef<HTMLTextAreaElement>(null)

  // ── Items tab state ───────────────────────────────────────────────────
  const [items, setItems] = useState<DraftItem[]>(
    initialItems.length > 0 ? initialItems.map(itemFromRow) : [emptyDraft()],
  )
  const [uploadingLocalKey, setUploadingLocalKey] = useState<string | null>(null)
  const itemDescRefs = useRef<Record<string, HTMLTextAreaElement | null>>({})

  // ── Helpers ───────────────────────────────────────────────────────────
  const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean)
  const amenitiesAll = Array.from(new Set([...config.suggestedAmenities, ...amenities]))

  function validBusinessTab(): string | null {
    if (!title.trim()) return 'Please enter a name'
    if (destinationIds.length === 0) return 'Please add at least one location'
    return null
  }

  function validItemsTab(): string | null {
    if (items.length === 0) return 'Add at least one item'
    for (const i of items) {
      if (!i.name.trim()) return 'Every item needs a name'
      if (i.priceRupees < 0) return `"${i.name || 'Item'}" has a negative price`
      if (i.quantity < 0) return `"${i.name || 'Item'}" has a negative quantity`
      if (i.maxPerBooking < 1) return `"${i.name || 'Item'}" max-per-booking must be at least 1`
      if (i.images.length > 5) return `"${i.name || 'Item'}" has more than 5 photos`
    }
    return null
  }

  function tryGoTo(next: number) {
    if (next === step) return
    if (next > step) {
      const businessErr = validBusinessTab()
      if (businessErr) { toast.error(businessErr); return }
      if (next > 1) {
        const itemsErr = validItemsTab()
        if (itemsErr) { toast.error(itemsErr); return }
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
    setItems(prev => [...prev, emptyDraft()])
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
    const remainingSlots = 5 - draft.images.length
    const toUpload = Array.from(files).slice(0, remainingSlots)
    if (toUpload.length < files.length) {
      toast.error('Max 5 photos per item')
    }
    setUploadingLocalKey(draft.localKey)
    const uploaded: string[] = []
    for (const f of toUpload) {
      const url = await uploadImage(f)
      if (url) uploaded.push(url)
    }
    setUploadingLocalKey(null)
    if (uploaded.length === 0) return
    updateDraft(draft.localKey, { images: [...draft.images, ...uploaded] })
  }

  // ── Save handlers ─────────────────────────────────────────────────────
  async function submitCreate() {
    const businessErr = validBusinessTab()
    if (businessErr) { toast.error(businessErr); setStep(0); return }
    const itemsErr = validItemsTab()
    if (itemsErr) { toast.error(itemsErr); setStep(1); return }

    setSaving(true)
    const payload: HostServiceItemDraft[] = items.map(i => ({
      name: i.name.trim(),
      description: i.description.trim() || null,
      price_paise: Math.round(i.priceRupees * 100),
      quantity_available: i.quantity,
      max_per_booking: i.maxPerBooking,
      images: i.images,
    }))

    const result = await createHostServiceListing({
      title: title.trim(),
      description: description.trim() || null,
      short_description: shortDescription.trim() || null,
      type,
      unit,
      destination_ids: destinationIds,
      location: location.trim() || null,
      amenities,
      tags,
      metadata: null,
      host_id: userId,
      items: payload,
    })
    setSaving(false)

    if ('error' in result && result.error) {
      toast.error(result.error)
      return
    }
    toast.success('Listing submitted for review!')
    router.push('/host')
    router.refresh()
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
      unit,
      destination_ids: destinationIds,
      location: location.trim() || null,
      amenities,
      tags,
    })
    setSaving(false)
    if ('error' in res && res.error) {
      toast.error(res.error)
      return
    }
    toast.success('Business details saved')
    router.refresh()
  }

  async function saveItemEdit(draft: DraftItem) {
    if (mode !== 'edit') return
    if (!draft.name.trim()) { toast.error('Item name required'); return }
    setSaving(true)
    try {
      if (draft.dbId) {
        const res = await updateServiceListingItem(draft.dbId, {
          name: draft.name,
          description: draft.description || null,
          price_paise: Math.round(draft.priceRupees * 100),
          quantity_available: draft.quantity,
          max_per_booking: draft.maxPerBooking,
          images: draft.images,
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
          price_paise: Math.round(draft.priceRupees * 100),
          quantity_available: draft.quantity,
          max_per_booking: draft.maxPerBooking,
          images: draft.images,
          position_order: items.findIndex(i => i.localKey === draft.localKey),
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
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
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
          <div className="space-y-2">
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
            <p className="text-xs text-muted-foreground">{config.titleHint}</p>
            <input
              type="text"
              placeholder={config.titlePlaceholder}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:border-primary text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold">Specific address</label>
            <input
              type="text"
              placeholder="e.g., 12 Lakeside Road, Manali, HP 175131"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:border-primary text-sm"
            />
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
            <p className="text-xs text-muted-foreground">
              Use the toolbar for <strong>bold</strong>, headings, and bullet lists — or type Markdown
              (<code>**bold**</code>, <code>## Heading</code>, <code>- item</code>).
            </p>
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

          <div className="space-y-2">
            <label className="text-sm font-semibold">Tags</label>
            <p className="text-xs text-muted-foreground">Comma-separated.</p>
            <input
              type="text"
              placeholder="e.g., family-friendly, budget, adventure"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:border-primary text-sm"
            />
          </div>

          {mode === 'edit' && (
            <div className="pt-4 border-t border-border">
              <Button onClick={saveBusinessEdit} disabled={saving}>
                {saving ? 'Saving…' : 'Save business details'}
              </Button>
            </div>
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
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addDraft}>
              + Add item
            </Button>
          </div>

          <div className="space-y-4">
            {items.map((draft, idx) => (
              <div key={draft.localKey} className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">
                    Item {idx + 1}
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
                    type="text"
                    value={draft.name}
                    onChange={(e) => updateDraft(draft.localKey, { name: e.target.value })}
                    placeholder="e.g., Maruti Alto (white) / Deluxe Room / Sunset Trek"
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
                    <label className="text-xs font-semibold">Price (₹)</label>
                    <input
                      type="number"
                      min="0"
                      value={draft.priceRupees}
                      onChange={(e) => updateDraft(draft.localKey, { priceRupees: Number(e.target.value) })}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold">Quantity</label>
                    <input
                      type="number"
                      min="0"
                      value={draft.quantity}
                      onChange={(e) => updateDraft(draft.localKey, { quantity: Number(e.target.value) })}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold">Max / booking</label>
                    <input
                      type="number"
                      min="1"
                      value={draft.maxPerBooking}
                      onChange={(e) => updateDraft(draft.localKey, { maxPerBooking: Number(e.target.value) })}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold">Photos ({draft.images.length} / 5)</label>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {draft.images.map(url => (
                      <div key={url} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="item" className="h-16 w-16 rounded-lg object-cover" />
                        <button
                          type="button"
                          onClick={() => updateDraft(draft.localKey, { images: draft.images.filter(u => u !== url) })}
                          className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-background border border-border text-xs shadow"
                          aria-label="Remove"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {draft.images.length < 5 && (
                      <label className="h-16 w-16 rounded-lg border-2 border-dashed border-border flex items-center justify-center text-xs text-muted-foreground cursor-pointer hover:border-primary">
                        {uploadingLocalKey === draft.localKey ? '…' : '+ Add'}
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(e) => { handleItemImageAdd(draft, e.target.files); e.target.value = '' }}
                          disabled={uploadingLocalKey === draft.localKey}
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
              {config.heading.toLowerCase()} · {unit.replace('_', ' ')}
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
            <h4 className="text-sm font-semibold mb-2">Items ({items.length})</h4>
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
                        ₹{i.priceRupees.toLocaleString('en-IN')} · Qty {i.quantity} · Max {i.maxPerBooking}/booking · {i.images.length} photo{i.images.length === 1 ? '' : 's'}
                      </div>
                    </div>
                  </div>
                  {i.description.trim() && (
                    <TripDescriptionDisplay className="mt-2 text-xs text-muted-foreground">
                      {i.description}
                    </TripDescriptionDisplay>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {amenities.length > 0 && (
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
            <div className="pt-2">
              <Button onClick={submitCreate} disabled={saving} className="w-full">
                {saving ? 'Submitting…' : 'Submit for review'}
              </Button>
              <p className="text-xs text-muted-foreground text-center mt-2">
                An admin will review your listing and notify you on approval.
              </p>
            </div>
          )}
          {mode === 'edit' && (
            <div className="pt-2 text-xs text-muted-foreground">
              Edits on each tab are saved independently via their Save buttons.
              Changes to an approved listing reset its status to Pending for re-review.
            </div>
          )}
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
          <Button type="button" variant="outline" onClick={() => router.push('/host')}>
            Back to host dashboard
          </Button>
        )}
      </div>
    </div>
  )
}
