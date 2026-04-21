'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { formatPrice, type Package, type Destination, type JoinPreferences } from '@/types'
import { maxInclusiveSpanDays, packageDurationFullLabel, packageDurationShortLabel } from '@/lib/package-trip-calendar'
import {
  hasTieredPricing,
  minPricePaiseFromVariants,
  priceVariantsFromFormRows,
  type PriceVariant,
} from '@/lib/package-pricing'
import { INTEREST_TAGS, UPLOAD_MAX_IMAGE_BYTES, UPLOAD_IMAGE_TOO_LARGE_MESSAGE } from '@/lib/constants'
import { createPackage, updatePackage, togglePackageActive, deletePackage, createDestination, addIncludesOption } from '@/actions/admin'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ImageUploadOverlay } from '@/components/ui/ImageUploadOverlay'
import { TripDescriptionMarkdownToolbar } from '@/components/ui/TripDescriptionMarkdownToolbar'
import { TripImageGridWithCover } from '@/components/ui/TripImageGridWithCover'
import { Plus, Eye, EyeOff, Star, Edit2, X, Upload, Image as ImageIcon, Check, Users } from 'lucide-react'
import { DestinationSearch } from '@/components/admin/DestinationSearch'

interface IncludesOption {
  id: string
  label: string
}

interface Props {
  packages: Package[]
  destinations: Destination[]
  includesOptions: IncludesOption[]
}

export function PackagesManagementClient({ packages: initial, destinations: initDest, includesOptions: initIncludes }: Props) {
  const [packages, setPackages] = useState(initial)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [destinations, setDestinations] = useState(initDest)
  const [includesOptions, setIncludesOptions] = useState(initIncludes)

  // Form state
  const [form, setForm] = useState({
    title: '', slug: '', destination_id: '', description: '', short_description: '',
    priceRows: [{ rupees: '', facilities: '' }] as { rupees: string; facilities: string }[],
    trip_days: '', trip_nights: '', max_group_size: '', difficulty: 'moderate',
    exclude_first_travel: true,
    departure_time: 'morning' as 'morning' | 'evening',
    return_time: 'morning' as 'morning' | 'evening',
    selectedIncludes: [] as string[],
    images: [] as string[],
    departureDates: [] as { departure: string; returnDate: string }[],
    is_featured: false,
    join_payment_timing: 'after_host_approval' as 'after_host_approval' | 'pay_on_booking',
    join_gender: 'all' as 'all' | 'men' | 'women',
    join_min_trips: '',
    join_min_age: '',
    join_max_age: '',
    join_interest_tags: [] as string[],
  })

  // Inline new destination
  const [showNewDest, setShowNewDest] = useState(false)
  const [newDest, setNewDest] = useState({ name: '', state: '' })

  // New includes option
  const [newInclude, setNewInclude] = useState('')

  // Image upload
  const fileInputRef = useRef<HTMLInputElement>(null)
  const descriptionTextareaRef = useRef<HTMLTextAreaElement>(null)
  const uploadAbortRef = useRef<AbortController | null>(null)
  const [uploading, setUploading] = useState(false)
  const [imageUrlInput, setImageUrlInput] = useState('')
  const packageFormRef = useRef<HTMLDivElement>(null)

  function resetForm() {
    setForm({
      title: '', slug: '', destination_id: '', description: '', short_description: '',
      priceRows: [{ rupees: '', facilities: '' }],
      trip_days: '', trip_nights: '', max_group_size: '', difficulty: 'moderate',
      exclude_first_travel: true,
      departure_time: 'morning' as 'morning' | 'evening',
      return_time: 'morning' as 'morning' | 'evening',
      selectedIncludes: [], images: [],
      departureDates: [], is_featured: false,
      join_payment_timing: 'after_host_approval',
      join_gender: 'all',
      join_min_trips: '',
      join_min_age: '',
      join_max_age: '',
      join_interest_tags: [],
    })
    setEditingId(null)
    setShowForm(false)
    setImageUrlInput('')
  }

  function autoSlug(title: string) {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  }

  function loadForEdit(pkg: Package) {
    setForm({
      title: pkg.title,
      slug: pkg.slug,
      destination_id: pkg.destination_id,
      description: pkg.description,
      short_description: pkg.short_description || '',
      priceRows:
        hasTieredPricing(pkg.price_variants) && Array.isArray(pkg.price_variants)
          ? pkg.price_variants.map((v) => ({
              rupees: String(v.price_paise / 100),
              facilities: v.description,
            }))
          : [{ rupees: String(pkg.price_paise / 100), facilities: '' }],
      trip_days: String(pkg.trip_days ?? pkg.duration_days),
      trip_nights: String(pkg.trip_nights ?? Math.max(0, pkg.duration_days - 1)),
      max_group_size: String(pkg.max_group_size),
      difficulty: pkg.difficulty,
      exclude_first_travel: pkg.exclude_first_day_travel ?? true,
      departure_time: (pkg.departure_time as 'morning' | 'evening') || 'morning',
      return_time: (pkg.return_time as 'morning' | 'evening') || 'morning',
      selectedIncludes: pkg.includes || [],
      images: pkg.images || [],
      departureDates: (pkg.departure_dates || []).map((d, i) => ({
        departure: d,
        returnDate: (pkg.return_dates && pkg.return_dates[i]) || '',
      })),
      is_featured: pkg.is_featured,
      join_payment_timing:
        pkg.join_preferences?.payment_timing === 'pay_on_booking'
          ? 'pay_on_booking'
          : 'after_host_approval',
      join_gender:
        pkg.join_preferences?.gender_preference === 'men' ||
        pkg.join_preferences?.gender_preference === 'women'
          ? pkg.join_preferences.gender_preference
          : 'all',
      join_min_trips:
        pkg.join_preferences?.min_trips_completed != null
          ? String(pkg.join_preferences.min_trips_completed)
          : '',
      join_min_age: pkg.join_preferences?.min_age != null ? String(pkg.join_preferences.min_age) : '',
      join_max_age: pkg.join_preferences?.max_age != null ? String(pkg.join_preferences.max_age) : '',
      join_interest_tags: pkg.join_preferences?.interest_tags ? [...pkg.join_preferences.interest_tags] : [],
    })
    setEditingId(pkg.id)
    setShowForm(true)
  }

  useEffect(() => {
    if (!showForm) return
    const t = window.setTimeout(() => {
      packageFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
    return () => window.clearTimeout(t)
  }, [showForm, editingId])

  function handleSubmit() {
    const singleOk =
      form.priceRows.length === 1 &&
      form.priceRows[0].rupees &&
      Math.round(parseFloat(form.priceRows[0].rupees) * 100) >= 100
    const multiOk =
      form.priceRows.length >= 2 &&
      form.priceRows.every((r) => {
        const p = Math.round(parseFloat(r.rupees) * 100)
        return r.facilities.trim() && Number.isFinite(p) && p >= 100
      })
    if (!form.title || !form.destination_id || !form.trip_days || !form.trip_nights || (!singleOk && !multiOk)) {
      setMessage({ type: 'error', text: 'Title, destination, valid price(s), trip days, and trip nights are required.' })
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    const depRows = form.departureDates.filter(d => d.departure && d.returnDate)
    if (depRows.length === 0) {
      setMessage({ type: 'error', text: 'Add at least one departure date and return / arrival date.' })
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    for (const row of depRows) {
      if (row.returnDate < row.departure) {
        setMessage({ type: 'error', text: 'Return date must be on or after departure for every row.' })
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }
    }
    const duration_days = maxInclusiveSpanDays(depRows.map(d => ({ dep: d.departure, ret: d.returnDate })))
    const trip_days = parseInt(form.trip_days, 10)
    const trip_nights = parseInt(form.trip_nights, 10)
    if (!Number.isFinite(trip_days) || trip_days < 1 || !Number.isFinite(trip_nights) || trip_nights < 0) {
      setMessage({ type: 'error', text: 'Enter valid trip days (≥1) and nights (≥0).' })
      return
    }

    const join_preferences: JoinPreferences = {
      payment_timing: form.join_payment_timing,
    }
    if (form.join_gender !== 'all') join_preferences.gender_preference = form.join_gender
    if (form.join_min_trips.trim()) {
      const m = parseInt(form.join_min_trips, 10)
      if (Number.isFinite(m)) join_preferences.min_trips_completed = m
    }
    if (form.join_min_age.trim()) {
      const a = parseInt(form.join_min_age, 10)
      if (Number.isFinite(a)) join_preferences.min_age = a
    }
    if (form.join_max_age.trim()) {
      const a = parseInt(form.join_max_age, 10)
      if (Number.isFinite(a)) join_preferences.max_age = a
    }
    if (form.join_interest_tags.length > 0) join_preferences.interest_tags = [...form.join_interest_tags]

    if (!editingId && form.images.length === 0) {
      setMessage({ type: 'error', text: 'Please add at least one thumbnail image for the package.' })
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    let price_paise: number
    let price_variants: PriceVariant[] | null = null
    if (form.priceRows.length >= 2) {
      try {
        const rows = form.priceRows.map((r) => ({
          pricePaise: Math.round(parseFloat(r.rupees) * 100),
          facilities: r.facilities,
        }))
        const tiersBuilt = priceVariantsFromFormRows(rows)
        if (!tiersBuilt) throw new Error('Invalid price tiers')
        price_variants = tiersBuilt
        price_paise = minPricePaiseFromVariants(tiersBuilt)
      } catch (err) {
        setMessage({
          type: 'error',
          text: err instanceof Error ? err.message : 'Invalid price tiers',
        })
        return
      }
    } else {
      price_paise = Math.round(parseFloat(form.priceRows[0].rupees) * 100)
    }

    const data = {
      title: form.title,
      slug: form.slug || autoSlug(form.title),
      destination_id: form.destination_id,
      description: form.description,
      short_description: form.short_description,
      price_paise,
      price_variants,
      duration_days,
      trip_days,
      trip_nights,
      exclude_first_day_travel: form.exclude_first_travel,
      departure_time: form.departure_time,
      return_time: form.return_time,
      max_group_size: parseInt(form.max_group_size) || 12,
      difficulty: form.difficulty,
      includes: form.selectedIncludes,
      images: form.images,
      departure_dates: depRows.map(d => d.departure),
      return_dates: depRows.map(d => d.returnDate),
      is_featured: form.is_featured,
      join_preferences,
    }

    startTransition(async () => {
      let res
      if (editingId) {
        res = await updatePackage(editingId, data)
      } else {
        res = await createPackage(data)
      }
      if (res.error) {
        setMessage({ type: 'error', text: res.error })
      } else {
        setMessage({ type: 'success', text: editingId ? 'Package updated! Reload to see changes.' : 'Package created! Reload to see changes.' })
        resetForm()
      }
    })
  }

  function handleToggleActive(pkgId: string, current: boolean) {
    // Optimistic update
    setPackages(prev => prev.map(p => p.id === pkgId ? { ...p, is_active: !current } : p))
    startTransition(async () => {
      const res = await togglePackageActive(pkgId, !current)
      if (res.error) {
        setMessage({ type: 'error', text: res.error })
        // Revert on error
        setPackages(prev => prev.map(p => p.id === pkgId ? { ...p, is_active: current } : p))
      } else {
        setMessage({ type: 'success', text: `Package ${!current ? 'activated' : 'deactivated'}` })
      }
    })
  }

  function handleCreateDestInline() {
    if (!newDest.name || !newDest.state) return
    startTransition(async () => {
      const res = await createDestination(newDest.name, newDest.state)
      if (res.error) {
        setMessage({ type: 'error', text: res.error })
      } else if (res.id) {
        const created = { id: res.id, name: res.name || newDest.name, state: res.state || newDest.state, country: 'India', slug: '', image_url: null, description: null, created_at: '' }
        // Add to list if not already present
        setDestinations(prev => prev.find(d => d.id === res.id) ? prev : [...prev, created])
        setForm(f => ({ ...f, destination_id: res.id! }))
        setNewDest({ name: '', state: '' })
        setShowNewDest(false)
        setMessage({ type: 'success', text: `Destination "${res.name}" ready!` })
      }
    })
  }

  function handleAddInclude() {
    const trimmed = newInclude.trim()
    if (!trimmed) return
    startTransition(async () => {
      const res = await addIncludesOption(trimmed)
      if (res.error) {
        setMessage({ type: 'error', text: res.error })
      } else {
        const fakeOpt = { id: `new-${Date.now()}`, label: trimmed }
        setIncludesOptions(prev => [...prev, fakeOpt].sort((a, b) => a.label.localeCompare(b.label)))
        setForm(f => ({ ...f, selectedIncludes: [...f.selectedIncludes, trimmed] }))
        setNewInclude('')
      }
    })
  }

  function cancelFileUpload() {
    uploadAbortRef.current?.abort()
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files?.length) return

    const ac = new AbortController()
    uploadAbortRef.current = ac
    setUploading(true)
    let cancelled = false

    try {
      for (const file of Array.from(files)) {
        if (ac.signal.aborted) {
          cancelled = true
          break
        }
        if (file.size > UPLOAD_MAX_IMAGE_BYTES) {
          setMessage({ type: 'error', text: UPLOAD_IMAGE_TOO_LARGE_MESSAGE })
          continue
        }
        const fd = new FormData()
        fd.append('file', file)
        fd.append('purpose', 'package')
        try {
          const res = await fetch('/api/upload', { method: 'POST', body: fd, signal: ac.signal })
          const json = await res.json()
          if (ac.signal.aborted) {
            cancelled = true
            break
          }
          if (json.url) {
            setForm(f => ({ ...f, images: [...f.images, json.url] }))
          } else {
            setMessage({ type: 'error', text: json.error || 'Upload failed' })
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            cancelled = true
            break
          }
          if (err instanceof Error && err.name === 'AbortError') {
            cancelled = true
            break
          }
          setMessage({ type: 'error', text: 'Upload failed' })
        }
      }
      if (cancelled) {
        setMessage({ type: 'success', text: 'Upload cancelled' })
      }
    } finally {
      uploadAbortRef.current = null
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function addImageUrl() {
    const url = imageUrlInput.trim()
    if (!url) return
    // Convert unsplash page URLs to raw image URLs
    let finalUrl = url
    if (url.includes('unsplash.com/photos/') && !url.includes('images.unsplash.com')) {
      // Extract photo ID from URL like /photos/man-raising-xxx or /photos/abcdef
      const parts = url.split('/photos/')
      if (parts[1]) {
        const slug = parts[1].split('?')[0].split('/')[0]
        // The last segment after the last hyphen is the photo ID
        const photoId = slug.includes('-') ? slug.split('-').pop() : slug
        finalUrl = `https://images.unsplash.com/photo-${photoId}?w=1200&q=80`
      }
    }
    setForm(f => ({ ...f, images: [...f.images, finalUrl] }))
    setImageUrlInput('')
  }

  function toggleInterestTag(tag: string) {
    setForm(f => ({
      ...f,
      join_interest_tags: f.join_interest_tags.includes(tag)
        ? f.join_interest_tags.filter(t => t !== tag)
        : [...f.join_interest_tags, tag],
    }))
  }

  function addDepartureDate() {
    setForm(f => ({ ...f, departureDates: [...f.departureDates, { departure: '', returnDate: '' }] }))
  }

  function updateDepartureSlot(idx: number, field: 'departure' | 'returnDate', value: string) {
    setForm(f => ({
      ...f,
      departureDates: f.departureDates.map((d, i) => (i === idx ? { ...d, [field]: value } : d)),
    }))
  }

  function removeDepartureDate(idx: number) {
    setForm(f => ({ ...f, departureDates: f.departureDates.filter((_, i) => i !== idx) }))
  }

  const today = new Date().toISOString().split('T')[0]
  const maxDateStr = (() => { const d = new Date(); d.setFullYear(d.getFullYear() + 2); return d.toISOString().split('T')[0] })()

  return (
    <div className="space-y-6">
      <ImageUploadOverlay
        open={uploading}
        message="Uploading images…"
        subMessage="Please keep this tab open."
        onCancel={cancelFileUpload}
      />
      {message && (
        <p className={`text-sm px-4 py-3 rounded-lg ${message.type === 'error' ? 'bg-red-900/30 text-red-300' : 'bg-green-900/30 text-green-300'}`}>
          {message.text}
        </p>
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
        <Button
          onClick={() => { resetForm(); setShowForm(!showForm) }}
          className="bg-primary text-black hover:bg-primary/90 gap-1"
        >
          <Plus className="h-4 w-4" /> New Package
        </Button>
      </div>

      {/* Package form */}
      {showForm && (
        <div
          ref={packageFormRef}
          className="rounded-xl border border-border bg-card p-6 space-y-6 shadow-sm"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold text-lg text-foreground">{editingId ? 'Edit Package' : 'Create New Package'}</h3>
              <p className="text-xs text-muted-foreground mt-1">Aligned with the host trip form: pricing, descriptions, join rules, and gallery (cover = first image).</p>
            </div>
            <button type="button" onClick={resetForm} aria-label="Close form">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          {/* Basic info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Title *</label>
              <Input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value, slug: autoSlug(e.target.value) }))}
                placeholder="e.g. Kasol Backpacking Trip"
                className="bg-secondary border-zinc-700"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Slug</label>
              <Input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} className="bg-secondary border-zinc-700 text-muted-foreground" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Destination *</label>
              <DestinationSearch
                destinations={destinations}
                value={form.destination_id}
                onChange={id => setForm(f => ({ ...f, destination_id: id }))}
                onNewDestination={d => {
                  setDestinations(prev => prev.find(x => x.id === d.id) ? prev : [...prev, { ...d, country: 'India', slug: '', image_url: null, description: null, created_at: '' }])
                }}
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label className="text-xs text-muted-foreground">Price per person (INR) *</label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-xs"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      priceRows: [...f.priceRows, { rupees: '', facilities: '' }],
                    }))
                  }
                >
                  <Plus className="h-3 w-3" /> Add option
                </Button>
              </div>
              <p className="text-[10px] text-zinc-500">
                Multiple rows: dorm / private room / etc. Each tier needs a short facilities description.
              </p>
              {form.priceRows.map((row, i) => (
                <div key={i} className="rounded-lg border border-zinc-700 bg-secondary/40 p-2 space-y-2">
                  <div className="flex flex-wrap items-end gap-2">
                    <Input
                      type="number"
                      value={row.rupees}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          priceRows: f.priceRows.map((r, j) =>
                            j === i ? { ...r, rupees: e.target.value } : r,
                          ),
                        }))
                      }
                      placeholder="8999"
                      className="bg-secondary border-zinc-700 max-w-[140px]"
                      min={1}
                    />
                    {form.priceRows.length > 1 && (
                      <button
                        type="button"
                        className="p-1.5 text-red-400"
                        onClick={() =>
                          setForm((f) =>
                            f.priceRows.length <= 1
                              ? f
                              : { ...f, priceRows: f.priceRows.filter((_, j) => j !== i) },
                          )
                        }
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {form.priceRows.length >= 2 && (
                    <Input
                      value={row.facilities}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          priceRows: f.priceRows.map((r, j) =>
                            j === i ? { ...r, facilities: e.target.value } : r,
                          ),
                        }))
                      }
                      placeholder="e.g. Shared dorm · 4-bed"
                      className="bg-secondary border-zinc-700 text-xs"
                    />
                  )}
                </div>
              ))}
            </div>            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Trip days (on trip) *</label>
              <Input type="number" value={form.trip_days} onChange={e => setForm(f => ({ ...f, trip_days: e.target.value }))} placeholder="4" className="bg-secondary border-zinc-700" min={1} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Trip nights (on trip) *</label>
              <Input type="number" value={form.trip_nights} onChange={e => setForm(f => ({ ...f, trip_nights: e.target.value }))} placeholder="3" className="bg-secondary border-zinc-700" min={0} />
            </div>
            <div className="flex items-center gap-2 lg:col-span-2 self-end pb-1">
              <input type="checkbox" id="exclude_travel" checked={form.exclude_first_travel} onChange={e => setForm(f => ({ ...f, exclude_first_travel: e.target.checked }))} className="accent-primary" />
              <label htmlFor="exclude_travel" className="text-xs text-muted-foreground">Day 1 / night 1 is travel only (not counted in days/nights above)</label>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Departure time</label>
              <select value={form.departure_time} onChange={e => setForm(f => ({ ...f, departure_time: e.target.value as 'morning' | 'evening' }))} className="w-full bg-secondary border border-zinc-700 rounded-lg px-3 py-2 text-sm">
                <option value="morning">Morning</option>
                <option value="evening">Evening</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Return / arrival time</label>
              <select value={form.return_time} onChange={e => setForm(f => ({ ...f, return_time: e.target.value as 'morning' | 'evening' }))} className="w-full bg-secondary border border-zinc-700 rounded-lg px-3 py-2 text-sm">
                <option value="morning">Morning</option>
                <option value="evening">Evening</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Max Group Size</label>
              <Input type="number" value={form.max_group_size} onChange={e => setForm(f => ({ ...f, max_group_size: e.target.value }))} placeholder="12" className="bg-secondary border-zinc-700" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Difficulty</label>
              <select
                className="w-full bg-secondary border border-zinc-700 rounded-lg px-3 py-2 text-sm"
                value={form.difficulty}
                onChange={e => setForm(f => ({ ...f, difficulty: e.target.value }))}
              >
                <option value="easy">Easy</option>
                <option value="moderate">Moderate</option>
                <option value="challenging">Challenging</option>
              </select>
            </div>
            <div className="flex items-center gap-2 self-end pb-2">
              <input type="checkbox" checked={form.is_featured} onChange={e => setForm(f => ({ ...f, is_featured: e.target.checked }))} className="accent-primary" id="is_featured" />
              <label htmlFor="is_featured" className="text-sm">Featured</label>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Short Description</label>
            <Input value={form.short_description} onChange={e => setForm(f => ({ ...f, short_description: e.target.value }))} placeholder="One-liner for cards" className="bg-secondary border-zinc-700" />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Full Description</label>
            <TripDescriptionMarkdownToolbar
              textareaRef={descriptionTextareaRef}
              value={form.description}
              onChange={next => setForm(f => ({ ...f, description: next }))}
              className="mb-1.5"
            />
            <textarea
              ref={descriptionTextareaRef}
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={5}
              placeholder="Detailed trip description (Markdown: **bold**, ## heading, - list)"
              className="w-full bg-secondary border border-zinc-700 rounded-lg px-3 py-2 text-sm resize-y min-h-[120px]"
            />
          </div>

          {/* Join preferences (parity with host trip form) */}
          <div className="space-y-4 rounded-lg border border-border bg-secondary/20 p-4">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <Users className="h-4 w-4 text-primary shrink-0" /> Join preferences
            </h3>
            <p className="text-xs text-muted-foreground">
              Booking flow and optional filters for who can request to join (same fields hosts use).
            </p>
            <div className="space-y-2">
              <span className="text-xs font-medium text-foreground">Booking &amp; payment</span>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, join_payment_timing: 'after_host_approval' }))}
                  className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                    form.join_payment_timing === 'after_host_approval'
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-zinc-700 bg-secondary/40 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span className="font-semibold block">Request first, pay after approval</span>
                  <span className="text-xs mt-1 block opacity-90">Travelers send a join request; they pay after approval.</span>
                </button>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, join_payment_timing: 'pay_on_booking' }))}
                  className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                    form.join_payment_timing === 'pay_on_booking'
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-zinc-700 bg-secondary/40 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span className="font-semibold block">Book &amp; pay immediately</span>
                  <span className="text-xs mt-1 block opacity-90">Standard checkout without a join-request step.</span>
                </button>
              </div>
            </div>
            {form.join_payment_timing === 'pay_on_booking' && (
              <p className="text-xs text-amber-600/90 dark:text-amber-400/90">
                Gender and min-trips filters apply when using request-first booking.
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Min trips completed</label>
                <Input
                  type="number"
                  value={form.join_min_trips}
                  onChange={e => setForm(f => ({ ...f, join_min_trips: e.target.value }))}
                  placeholder="e.g. 1"
                  className="bg-secondary border-zinc-700"
                  min={0}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Gender preference</label>
                <div className="flex gap-2">
                  {(['all', 'men', 'women'] as const).map(g => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, join_gender: g }))}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs border transition-colors capitalize ${
                        form.join_gender === g
                          ? 'bg-primary/10 border-primary text-primary'
                          : 'bg-secondary border-zinc-700 text-muted-foreground'
                      }`}
                    >
                      {g === 'all' ? 'Everyone' : g === 'men' ? 'Men only' : 'Women only'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Min age</label>
                <Input
                  type="number"
                  value={form.join_min_age}
                  onChange={e => setForm(f => ({ ...f, join_min_age: e.target.value }))}
                  placeholder="Optional"
                  className="bg-secondary border-zinc-700"
                  min={0}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Max age</label>
                <Input
                  type="number"
                  value={form.join_max_age}
                  onChange={e => setForm(f => ({ ...f, join_max_age: e.target.value }))}
                  placeholder="Optional"
                  className="bg-secondary border-zinc-700"
                  min={0}
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-2 block">Interest tags</label>
              <div className="flex flex-wrap gap-2">
                {INTEREST_TAGS.map(tag => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleInterestTag(tag)}
                    className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                      form.join_interest_tags.includes(tag)
                        ? 'bg-primary/10 border-primary text-primary'
                        : 'bg-secondary border-zinc-700 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {form.join_interest_tags.includes(tag) && <Check className="h-3 w-3 inline mr-1" />}
                    {tag}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <Input
                  placeholder="Custom tag — Enter"
                  className="bg-secondary border-zinc-700 text-sm max-w-xs"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      const val = (e.target as HTMLInputElement).value.trim()
                      if (val && !form.join_interest_tags.includes(val)) {
                        toggleInterestTag(val)
                        ;(e.target as HTMLInputElement).value = ''
                      }
                    }
                  }}
                />
              </div>
            </div>
          </div>

          {/* What's Included — checkbox grid */}
          <div>
            <label className="text-xs text-muted-foreground mb-2 block">What&apos;s Included (check applicable)</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mb-3">
              {includesOptions.map(opt => (
                <label key={opt.id} className="flex items-center gap-2 text-sm cursor-pointer hover:text-white text-muted-foreground">
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={form.selectedIncludes.includes(opt.label)}
                    onChange={e => {
                      setForm(f => ({
                        ...f,
                        selectedIncludes: e.target.checked
                          ? [...f.selectedIncludes, opt.label]
                          : f.selectedIncludes.filter(i => i !== opt.label),
                      }))
                    }}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            <div className="flex gap-2 items-center">
              <Input
                value={newInclude}
                onChange={e => setNewInclude(e.target.value)}
                placeholder="Add custom facility..."
                className="bg-secondary border-zinc-700 text-sm max-w-xs"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddInclude() } }}
              />
              <Button size="sm" variant="outline" className="border-zinc-700 text-xs" onClick={handleAddInclude} disabled={isPending}>
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>
          </div>

          {/* Images — upload + URL (cover = first image; right-click / long-press to change) */}
          <div>
            <label className="text-xs text-muted-foreground mb-2 block">
              Images <span className="text-zinc-600">(Recommended: 16:9, max 5MB each, JPEG/PNG/WebP)</span>
            </label>
            {form.images.length >= 2 && (
              <p className="text-xs text-muted-foreground mb-2">
                First image is the cover. Right-click an image (desktop) or press and hold (mobile) on another image to make it the cover.
              </p>
            )}

            {form.images.length > 0 && (
              <div className="flex gap-3 flex-wrap mb-3">
                <TripImageGridWithCover
                  images={form.images}
                  onChange={next => setForm(f => ({ ...f, images: next }))}
                  imgClassName="h-20 w-28 rounded-lg object-cover border border-zinc-700"
                  removeButtonClassName="absolute -top-1.5 -right-1.5 z-10 bg-red-600 text-white rounded-full h-5 w-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex h-20 w-28 shrink-0 flex-col items-center justify-center rounded-lg border-2 border-dashed border-zinc-600 bg-secondary/20 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-secondary/40 hover:text-primary disabled:pointer-events-none disabled:opacity-50"
                  aria-label="Add image from device"
                >
                  <Plus className="h-6 w-6" />
                  <span className="mt-1 text-[10px] font-medium">Add image</span>
                </button>
              </div>
            )}

            <div className="flex gap-2 items-center flex-wrap">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                multiple
                className="hidden"
                onChange={handleFileUpload}
              />
              <Button
                size="sm"
                variant="outline"
                className="border-zinc-700 text-xs gap-1"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Upload className="h-3 w-3" /> {uploading ? 'Uploading...' : 'Upload from Device'}
              </Button>
              <span className="text-[10px] text-muted-foreground">16:9 ratio recommended</span>
              <span className="text-zinc-600 text-xs">or</span>
              <Input
                value={imageUrlInput}
                onChange={e => setImageUrlInput(e.target.value)}
                placeholder="Paste image URL..."
                className="bg-secondary border-zinc-700 text-sm max-w-sm"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addImageUrl() } }}
              />
              <Button size="sm" variant="outline" className="border-zinc-700 text-xs gap-1" onClick={addImageUrl}>
                <ImageIcon className="h-3 w-3" /> Add URL
              </Button>
            </div>
            <p className="text-xs text-zinc-600 mt-1">
              Tip: For Unsplash, use the image URL (images.unsplash.com/...), not the page URL.
            </p>
          </div>

          {/* Duration summary */}
          {form.trip_days && form.trip_nights && (
            <div className="px-3 py-2 rounded-lg bg-primary/10 border border-primary/30 text-sm space-y-1">
              <span className="font-bold text-primary block">
                {packageDurationFullLabel({
                  duration_days: Math.max(1, parseInt(form.trip_days, 10) || 1),
                  trip_days: parseInt(form.trip_days, 10) || 1,
                  trip_nights: parseInt(form.trip_nights, 10) || 0,
                  exclude_first_day_travel: form.exclude_first_travel,
                  departure_time: form.departure_time,
                  return_time: form.return_time,
                })}
              </span>
            </div>
          )}

          {/* Departure + return — date pickers */}
          <div>
            <label className="text-xs text-muted-foreground mb-2 block">Departure &amp; return / arrival (each row)</label>
            <div className="space-y-2 mb-2">
              {form.departureDates.map((d, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2">
                  <div>
                    <span className="text-[10px] text-muted-foreground block mb-0.5">Departure</span>
                    <Input
                      type="date"
                      min={today}
                      max={maxDateStr}
                      value={d.departure}
                      onChange={e => updateDepartureSlot(i, 'departure', e.target.value)}
                      className="bg-secondary border-zinc-700 text-sm max-w-[180px]"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block mb-0.5">Return</span>
                    <Input
                      type="date"
                      min={d.departure || today}
                      max={maxDateStr}
                      value={d.returnDate}
                      onChange={e => updateDepartureSlot(i, 'returnDate', e.target.value)}
                      className="bg-secondary border-zinc-700 text-sm max-w-[180px]"
                    />
                  </div>
                  <button type="button" onClick={() => removeDepartureDate(i)} className="text-red-400 hover:text-red-300 p-1"><X className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
            <Button size="sm" variant="outline" className="border-zinc-700 text-xs gap-1" type="button" onClick={addDepartureDate}>
              <Plus className="h-3 w-3" /> Add row
            </Button>
          </div>

          <Button onClick={handleSubmit} disabled={isPending} className="bg-primary text-black hover:bg-primary/90">
            {isPending ? 'Saving...' : editingId ? 'Update Package' : 'Create Package'}
          </Button>
        </div>
      )}

      {/* Package list */}
      <div className="space-y-3">
        {packages.map(pkg => (
          <div key={pkg.id} className={`rounded-xl border bg-card/50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${pkg.is_active ? 'border-border' : 'border-red-900/30 opacity-60'}`}>
            <div className="flex items-center gap-3 min-w-0">
              {pkg.images?.[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pkg.images[0]} alt="" className="h-12 w-12 rounded-lg object-cover shrink-0" />
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold truncate">{pkg.title}</p>
                  {pkg.is_featured && <Star className="h-3.5 w-3.5 text-primary fill-primary shrink-0" />}
                  {!pkg.is_active && <Badge className="bg-red-900/50 text-red-300 border border-red-700 text-xs">Inactive</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {pkg.destination?.name}, {pkg.destination?.state} · {packageDurationShortLabel(pkg)} · Max {pkg.max_group_size} · {pkg.difficulty}
                </p>
                <p className="text-xs text-zinc-600">
                  {(pkg.departure_dates || []).length} departure dates ·{' '}
                  {hasTieredPricing(pkg.price_variants) ? `From ${formatPrice(pkg.price_paise)}` : formatPrice(pkg.price_paise)}
                  /person
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-primary font-bold text-sm">
                {hasTieredPricing(pkg.price_variants) ? `From ${formatPrice(pkg.price_paise)}` : formatPrice(pkg.price_paise)}
              </span>
              <Button
                size="sm" variant="ghost"
                className="text-muted-foreground hover:text-white"
                onClick={() => window.open(`/packages/${pkg.slug}`, '_blank', 'noopener,noreferrer')}
                title="Preview public page"
              >
                <Eye className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-white" onClick={() => loadForEdit(pkg)}>
                <Edit2 className="h-4 w-4" />
              </Button>
              <Button
                size="sm" variant="ghost"
                className={pkg.is_active ? 'text-red-400 hover:text-red-300' : 'text-green-400 hover:text-green-300'}
                onClick={() => handleToggleActive(pkg.id, pkg.is_active)}
                disabled={isPending}
              >
                {pkg.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button
                size="sm" variant="ghost"
                className="text-red-500 hover:text-red-400"
                onClick={() => {
                  if (!window.confirm(`Delete "${pkg.title}"? This cannot be undone.`)) return
                  startTransition(async () => {
                    const res = await deletePackage(pkg.id)
                    if (res.error) setMessage({ type: 'error', text: res.error })
                    else {
                      setPackages(prev => prev.filter(p => p.id !== pkg.id))
                      setMessage({ type: 'success', text: 'Package deleted' })
                    }
                  })
                }}
                disabled={isPending}
                title="Delete package"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
