'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ImageUploadOverlay } from '@/components/ui/ImageUploadOverlay'
import { toast } from 'sonner'
import {
  INTEREST_TAGS,
  UPLOAD_MAX_IMAGE_BYTES,
  UPLOAD_IMAGE_TOO_LARGE_MESSAGE,
} from '@/lib/constants'
import { formatPrice } from '@/lib/utils'
import {
  createHostedTrip,
  getDestinationsPublic,
  getIncludesOptionsPublic,
  checkIsHost,
} from '@/actions/hosting'
import {
  fetchNominatimIndiaDestinations,
  nominatimDebounceMs,
} from '@/lib/nominatim-destinations'
import { maxInclusiveSpanDays, packageDurationFullLabel } from '@/lib/package-trip-calendar'
import {
  minPricePaiseFromVariants,
  priceVariantsFromFormRows,
  type PriceVariant,
} from '@/lib/package-pricing'
import {
  ArrowLeft,
  ArrowRight,
  Upload,
  Image as ImageIcon,
  X,
  Plus,
  Loader2,
  Check,
  MapPin,
  Calendar,
  Users,
  IndianRupee,
  Tag,
  FileText,
  Eye,
} from 'lucide-react'

type Destination = { id: string; name: string; state: string }
type IncludesOption = { id: string; label: string }

const STEPS = [
  { label: 'Basic Info', icon: FileText },
  { label: 'Details', icon: Calendar },
  { label: 'Images', icon: ImageIcon },
  { label: 'Preferences', icon: Users },
  { label: 'Review', icon: Check },
]

export default function CreateTripPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(true)

  // Data
  const [destinations, setDestinations] = useState<Destination[]>([])
  const [includesOptions, setIncludesOptions] = useState<IncludesOption[]>([])

  // Form state
  const [title, setTitle] = useState('')
  const [destinationId, setDestinationId] = useState('')
  const [description, setDescription] = useState('')
  const [shortDescription, setShortDescription] = useState('')

  const [priceRows, setPriceRows] = useState<{ rupees: string; facilities: string }[]>([
    { rupees: '', facilities: '' },
  ])
  const [tripDays, setTripDays] = useState('')
  const [tripNights, setTripNights] = useState('')
  const [excludeFirstTravel, setExcludeFirstTravel] = useState(true)
  const [departureTime, setDepartureTime] = useState<'morning' | 'evening'>('morning')
  const [returnTime, setReturnTime] = useState<'morning' | 'evening'>('morning')
  const [maxGroupSize, setMaxGroupSize] = useState('12')
  const [adminMaxGroupSize, setAdminMaxGroupSize] = useState(50)
  const [difficulty, setDifficulty] = useState('moderate')
  const [scheduleRows, setScheduleRows] = useState<{ dep: string; ret: string }[]>([
    { dep: '', ret: '' },
  ])
  const [selectedIncludes, setSelectedIncludes] = useState<string[]>([])

  const [images, setImages] = useState<string[]>([])
  const [imageUrlInput, setImageUrlInput] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadAbortRef = useRef<AbortController | null>(null)
  const imageUrlGenerationRef = useRef(0)

  const [minAge, setMinAge] = useState('')
  const [maxAge, setMaxAge] = useState('')
  const [genderPreference, setGenderPreference] = useState<'all' | 'men' | 'women'>('all')
  const [minTripsCompleted, setMinTripsCompleted] = useState('')
  const [interestTags, setInterestTags] = useState<string[]>([])

  useEffect(() => {
    async function load() {
      const hostStatus = await checkIsHost()
      if (!hostStatus.authenticated) {
        router.push('/login')
        return
      }
      if (!hostStatus.isHost) {
        router.push('/host/verify')
        return
      }

      const [dests, includes] = await Promise.all([
        getDestinationsPublic(),
        getIncludesOptionsPublic(),
      ])
      setDestinations(dests)
      setIncludesOptions(includes)

      // Fetch admin-managed max group size
      const { createClient: cc } = await import('@/lib/supabase/client')
      const sb = cc()
      const { data: maxSetting } = await sb.from('platform_settings').select('value').eq('key', 'host_max_group_size').single()
      if (maxSetting) setAdminMaxGroupSize(parseInt(maxSetting.value) || 50)

      setLoading(false)
    }
    load()
  }, [router])

  // Tomorrow as minimum (trip can't start today)
  const tomorrow = (() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().split('T')[0]
  })()
  const today = tomorrow // alias for min attribute
  const maxDateStr = (() => {
    const d = new Date()
    d.setFullYear(d.getFullYear() + 2)
    return d.toISOString().split('T')[0]
  })()

  function addPriceRow() {
    setPriceRows((prev) => [...prev, { rupees: '', facilities: '' }])
  }

  function removePriceRow(i: number) {
    setPriceRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, j) => j !== i)))
  }

  function updatePriceRow(i: number, field: 'rupees' | 'facilities', value: string) {
    setPriceRows((prev) => prev.map((r, j) => (j === i ? { ...r, [field]: value } : r)))
  }

  function cancelFileUpload() {
    uploadAbortRef.current?.abort()
  }

  // Image upload handler (same pattern as admin)
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
          toast.error(UPLOAD_IMAGE_TOO_LARGE_MESSAGE)
          continue
        }
        const fd = new FormData()
        fd.append('file', file)
        fd.append('purpose', 'host_trip')
        try {
          const res = await fetch('/api/upload', { method: 'POST', body: fd, signal: ac.signal })
          const json = await res.json()
          if (ac.signal.aborted) {
            cancelled = true
            break
          }
          if (json.url) {
            setImages(prev => [...prev, json.url])
          } else {
            toast.error(json.error || 'Upload failed')
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
          toast.error('Upload failed')
        }
      }
      if (cancelled) {
        toast.message('Upload cancelled')
      }
    } finally {
      uploadAbortRef.current = null
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const [imageLoading, setImageLoading] = useState(false)

  function cancelImageUrlLoad() {
    imageUrlGenerationRef.current += 1
    setImageLoading(false)
  }

  async function addImageUrl() {
    const url = imageUrlInput.trim()
    if (!url) return

    const gen = ++imageUrlGenerationRef.current
    setImageLoading(true)
    let finalUrl = url

    // Convert Unsplash page URLs to direct image URLs
    if (url.includes('unsplash.com/photos/') && !url.includes('images.unsplash.com')) {
      const parts = url.split('/photos/')
      if (parts[1]) {
        const slug = parts[1].split('?')[0].split('/')[0]
        // Extract photo ID (last segment after last hyphen, or full slug if no hyphens)
        const photoId = slug.includes('-') ? slug.split('-').pop() : slug
        // Try multiple Unsplash URL formats
        const candidates = [
          `https://images.unsplash.com/photo-${photoId}?w=1200&q=80`,
          `https://images.unsplash.com/${photoId}?w=1200&q=80`,
        ]
        let found = false
        for (const candidate of candidates) {
          try {
            const img = new Image()
            const loaded = await new Promise<boolean>((resolve) => {
              img.onload = () => resolve(true)
              img.onerror = () => resolve(false)
              img.src = candidate
              setTimeout(() => resolve(false), 5000)
            })
            if (loaded) {
              finalUrl = candidate
              found = true
              break
            }
          } catch { /* try next */ }
        }
        if (!found) {
          toast.error('Could not load Unsplash image. Try right-clicking the image → "Copy image address" and paste that instead.')
          if (gen === imageUrlGenerationRef.current) setImageLoading(false)
          return
        }
      }
    }

    if (gen !== imageUrlGenerationRef.current) return

    // Validate that the URL loads as an image
    try {
      const img = new Image()
      const loaded = await new Promise<boolean>((resolve) => {
        img.onload = () => resolve(true)
        img.onerror = () => resolve(false)
        img.src = finalUrl
        setTimeout(() => resolve(false), 8000)
      })
      if (gen !== imageUrlGenerationRef.current) return
      if (!loaded) {
        toast.error('Image could not be loaded. Check the URL or try uploading instead.')
        setImageLoading(false)
        return
      }
    } catch {
      if (gen !== imageUrlGenerationRef.current) return
      toast.error('Invalid image URL')
      setImageLoading(false)
      return
    }

    if (gen !== imageUrlGenerationRef.current) return
    setImages(prev => [...prev, finalUrl])
    setImageUrlInput('')
    setImageLoading(false)
    toast.success('Image added!')
  }

  function removeImage(idx: number) {
    setImages(prev => prev.filter((_, i) => i !== idx))
  }

  function addScheduleRow() {
    setScheduleRows((prev) => [...prev, { dep: '', ret: '' }])
  }

  function updateScheduleRow(idx: number, field: 'dep' | 'ret', value: string) {
    if (value && value.length === 10 && value < tomorrow) {
      toast.error(field === 'dep' ? 'Departure date must be in the future' : 'Return date must be in the future')
      return
    }
    setScheduleRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)),
    )
  }

  function removeScheduleRow(idx: number) {
    setScheduleRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)))
  }

  function toggleInclude(label: string) {
    setSelectedIncludes(prev =>
      prev.includes(label) ? prev.filter(i => i !== label) : [...prev, label]
    )
  }

  function toggleInterestTag(tag: string) {
    setInterestTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    )
  }

  // Validation per step
  function canProceed(): boolean {
    switch (step) {
      case 0:
        return !!title.trim() && !!destinationId && !!description.trim()
      case 1: {
        const pairs = scheduleRows.filter((r) => r.dep && r.ret)
        if (!tripDays || !tripNights || pairs.length === 0) return false
        if (priceRows.length >= 2) {
          return priceRows.every((r) => {
            const p = Math.round(parseFloat(r.rupees) * 100)
            return r.facilities.trim() && Number.isFinite(p) && p >= 100
          })
        }
        const p0 = Math.round(parseFloat(priceRows[0]?.rupees || '') * 100)
        return Number.isFinite(p0) && p0 >= 100
      }
      case 2:
        return images.length > 0
      case 3:
        return true // preferences are optional
      case 4:
        return true
      default:
        return false
    }
  }

  function handleSubmit() {
    let pricePaise: number
    let price_variants: PriceVariant[] | null = null
    if (priceRows.length >= 2) {
      try {
        const rows = priceRows.map((r) => ({
          pricePaise: Math.round(parseFloat(r.rupees) * 100),
          facilities: r.facilities,
        }))
        const tiersBuilt = priceVariantsFromFormRows(rows)
        if (!tiersBuilt) throw new Error('Invalid price tiers')
        price_variants = tiersBuilt
        pricePaise = minPricePaiseFromVariants(tiersBuilt)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Invalid price tiers')
        return
      }
    } else {
      pricePaise = Math.round(parseFloat(priceRows[0]?.rupees || '') * 100)
      if (!Number.isFinite(pricePaise) || pricePaise < 100) {
        toast.error('Enter a valid price per person (minimum ₹1)')
        return
      }
    }

    const pairs = scheduleRows
      .filter((r) => r.dep && r.ret)
      .map((r) => ({ dep: r.dep, ret: r.ret }))
    if (pairs.length === 0) {
      toast.error('Add at least one departure date and return date')
      return
    }
    for (const p of pairs) {
      if (p.ret < p.dep) {
        toast.error('Return date must be on or after departure for every row')
        return
      }
    }
    const td = parseInt(tripDays, 10)
    const tn = parseInt(tripNights, 10)
    if (!Number.isFinite(td) || td < 1 || !Number.isFinite(tn) || tn < 0) {
      toast.error('Enter valid trip days (≥1) and nights (≥0)')
      return
    }
    const duration_days = maxInclusiveSpanDays(pairs)

    startTransition(async () => {
      const result = await createHostedTrip({
        title: title.trim(),
        destination_id: destinationId,
        description: description.trim(),
        short_description: shortDescription.trim() || undefined,
        price_paise: pricePaise,
        price_variants,
        duration_days,
        trip_days: td,
        trip_nights: tn,
        exclude_first_day_travel: excludeFirstTravel,
        departure_time: departureTime,
        return_time: returnTime,
        departure_dates: pairs.map((p) => p.dep),
        return_dates: pairs.map((p) => p.ret),
        max_group_size: parseInt(maxGroupSize) || 12,
        difficulty,
        includes: selectedIncludes,
        images,
        join_preferences: {
          gender_preference: genderPreference !== 'all' ? genderPreference : undefined,
          min_trips_completed: minTripsCompleted ? parseInt(minTripsCompleted) : undefined,
          interest_tags: interestTags.length > 0 ? interestTags : undefined,
        },
      })

      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Trip created! It will be reviewed by our team before going live.')
        router.push('/host')
      }
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const selectedDest = destinations.find(d => d.id === destinationId)

  return (
    <div className="min-h-screen bg-background">
      <ImageUploadOverlay
        open={uploading}
        message="Uploading images…"
        subMessage="Please keep this tab open."
        onCancel={cancelFileUpload}
      />
      <ImageUploadOverlay
        open={imageLoading}
        message="Loading image…"
        subMessage="Validating the image URL"
        onCancel={cancelImageUrlLoad}
      />
      <div className="mx-auto max-w-3xl px-4 py-10">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/host')}
            className="text-muted-foreground mb-4 gap-1.5"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
          <h1 className="text-3xl font-black">
            Create a <span className="text-primary">Trip</span>
          </h1>
          <p className="text-muted-foreground mt-1">
            Fill in the details for your community trip. It will be reviewed before going live.
          </p>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            const isActive = i === step
            const isDone = i < step
            return (
              <button
                key={i}
                onClick={() => {
                  if (i < step) setStep(i)
                }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : isDone
                    ? 'bg-primary/10 text-primary cursor-pointer'
                    : 'bg-secondary text-muted-foreground'
                }`}
              >
                {isDone ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">{s.label}</span>
                <span className="sm:hidden">{i + 1}</span>
              </button>
            )
          })}
        </div>

        {/* Step Content */}
        <div className="rounded-xl border border-border bg-card p-6">
          {/* Step 1: Basic Info */}
          {step === 0 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold">Basic Information</h2>

              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">Trip Title *</label>
                <Input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Kasol Backpacking Adventure"
                  className="bg-secondary border-border"
                  maxLength={100}
                />
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">Destination *</label>
                <DestinationSearch
                  destinations={destinations}
                  value={destinationId}
                  onChange={setDestinationId}
                />
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">Short Description</label>
                <Input
                  value={shortDescription}
                  onChange={e => setShortDescription(e.target.value)}
                  placeholder="One-liner that appears on trip cards"
                  className="bg-secondary border-border"
                  maxLength={150}
                />
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">Full Description *</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={5}
                  placeholder="Describe your trip in detail -- what travelers can expect, itinerary highlights, etc."
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm resize-none"
                />
              </div>
            </div>
          )}

          {/* Step 2: Details */}
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold">Trip Details</h2>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <label className="text-sm text-muted-foreground">
                    Price per person (INR) *{priceRows.length >= 2 ? ' — accommodation / options' : ''}
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1 text-xs"
                    onClick={addPriceRow}
                  >
                    <Plus className="h-3 w-3" />
                    Add price option
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  One price by default. Use &quot;Add price option&quot; for multiple tiers (dorm, private room, etc.). Each tier needs a short facilities description.
                </p>
                <div className="space-y-3">
                  {priceRows.map((row, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-border bg-secondary/30 p-3 space-y-2"
                    >
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="flex-1 min-w-[120px]">
                          <span className="text-[10px] text-muted-foreground block mb-1">Price (INR)</span>
                          <Input
                            type="number"
                            value={row.rupees}
                            onChange={(e) => updatePriceRow(i, 'rupees', e.target.value)}
                            placeholder="8999"
                            className="bg-secondary border-border"
                            min="1"
                          />
                        </div>
                        {priceRows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removePriceRow(i)}
                            className="p-2 text-red-400 hover:text-red-300"
                            title="Remove tier"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      {priceRows.length >= 2 && (
                        <div>
                          <span className="text-[10px] text-muted-foreground block mb-1">
                            What&apos;s included / accommodation type *
                          </span>
                          <Input
                            value={row.facilities}
                            onChange={(e) => updatePriceRow(i, 'facilities', e.target.value)}
                            placeholder="e.g. Shared dorm · 4-bed · common washrooms"
                            className="bg-secondary border-border text-sm"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {priceRows.length === 1 && priceRows[0].rupees && (
                  <p className="text-xs text-muted-foreground">
                    Listed from {formatPrice(Math.round(parseFloat(priceRows[0].rupees || '0') * 100))} / person
                  </p>
                )}
                {priceRows.length >= 2 && (
                  <p className="text-xs text-muted-foreground">
                    Listing shows the lowest tier; travelers choose their option when booking.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">Trip days (on trip) *</label>
                  <Input
                    type="number"
                    value={tripDays}
                    onChange={(e) => setTripDays(e.target.value)}
                    placeholder="e.g. 4"
                    className="bg-secondary border-border"
                    min="1"
                    max="60"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">Trip nights (on trip) *</label>
                  <Input
                    type="number"
                    value={tripNights}
                    onChange={(e) => setTripNights(e.target.value)}
                    placeholder="e.g. 3"
                    className="bg-secondary border-border"
                    min="0"
                    max="60"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="flex items-start gap-2 text-sm cursor-pointer text-foreground">
                    <input
                      type="checkbox"
                      className="mt-1 accent-primary"
                      checked={excludeFirstTravel}
                      onChange={(e) => setExcludeFirstTravel(e.target.checked)}
                    />
                    <span>
                      Day 1 / night 1 is travel only — don&apos;t count it in the trip days &amp; nights above
                      <span className="block text-xs text-muted-foreground font-normal mt-0.5">
                        On by default. Turn off if your first day/night is part of the advertised experience.
                      </span>
                    </span>
                  </label>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">Departure time (leave)</label>
                  <select value={departureTime} onChange={e => setDepartureTime(e.target.value as 'morning' | 'evening')} className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm">
                    <option value="morning">Morning</option>
                    <option value="evening">Evening</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">Return / arrival time</label>
                  <select value={returnTime} onChange={e => setReturnTime(e.target.value as 'morning' | 'evening')} className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm">
                    <option value="morning">Morning</option>
                    <option value="evening">Evening</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">Max Group Size (limit: {adminMaxGroupSize})</label>
                  <Input
                    type="number"
                    value={maxGroupSize}
                    onChange={e => {
                      const v = parseInt(e.target.value)
                      if (v > adminMaxGroupSize) {
                        toast.error(`Maximum group size allowed is ${adminMaxGroupSize}`)
                        setMaxGroupSize(String(adminMaxGroupSize))
                      } else {
                        setMaxGroupSize(e.target.value)
                      }
                    }}
                    placeholder="12"
                    className="bg-secondary border-border"
                    min="2"
                    max={adminMaxGroupSize}
                  />
                </div>

                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">Difficulty</label>
                  <select
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
                    value={difficulty}
                    onChange={e => setDifficulty(e.target.value)}
                  >
                    <option value="easy">Easy</option>
                    <option value="moderate">Moderate</option>
                    <option value="challenging">Challenging</option>
                  </select>
                </div>
              </div>

              {/* Duration summary */}
              {tripDays && tripNights && (
                <div className="px-3 py-2 rounded-lg bg-primary/10 border border-primary/30 text-sm space-y-1">
                  <p className="font-bold text-primary">
                    {packageDurationFullLabel({
                      duration_days: Math.max(1, parseInt(tripDays, 10) || 1),
                      trip_days: parseInt(tripDays, 10) || 1,
                      trip_nights: parseInt(tripNights, 10) || 0,
                      exclude_first_day_travel: excludeFirstTravel,
                      departure_time: departureTime,
                      return_time: returnTime,
                    })}
                  </p>
                  {scheduleRows.some((r) => r.dep && r.ret) && (
                    <p className="text-xs text-muted-foreground">
                      Calendar span for bookings: up to{' '}
                      {maxInclusiveSpanDays(
                        scheduleRows.filter((r) => r.dep && r.ret).map((r) => ({ dep: r.dep, ret: r.ret })),
                      )}{' '}
                      day(s) inclusive (from your departure → return dates).
                    </p>
                  )}
                </div>
              )}

              {/* Departure + return (no auto end date) */}
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">
                  Offered departures — set departure and return / arrival for each *
                </label>
                <div className="space-y-3 mb-3">
                  {scheduleRows.map((row, i) => (
                    <div key={i} className="flex flex-wrap items-end gap-2">
                      <div>
                        <span className="text-[10px] text-muted-foreground block mb-1">Departure date</span>
                        <Input
                          type="date"
                          min={today}
                          max={maxDateStr}
                          value={row.dep}
                          onChange={(e) => updateScheduleRow(i, 'dep', e.target.value)}
                          className="bg-secondary border-border text-sm w-[160px]"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground block mb-1">Return / arrival date</span>
                        <Input
                          type="date"
                          min={row.dep || today}
                          max={maxDateStr}
                          value={row.ret}
                          onChange={(e) => updateScheduleRow(i, 'ret', e.target.value)}
                          className="bg-secondary border-border text-sm w-[160px]"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeScheduleRow(i)}
                        className="text-red-400 hover:text-red-300 p-2"
                        title="Remove row"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <Button size="sm" variant="outline" className="gap-1.5" type="button" onClick={addScheduleRow}>
                  <Plus className="h-3 w-3" /> Add another departure
                </Button>
              </div>

              {/* Includes */}
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">
                  What&apos;s Included
                </label>
                <div className="flex flex-wrap gap-2">
                  {includesOptions.map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => toggleInclude(opt.label)}
                      className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                        selectedIncludes.includes(opt.label)
                          ? 'bg-primary/10 border-primary text-primary'
                          : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {selectedIncludes.includes(opt.label) && (
                        <Check className="h-3 w-3 inline mr-1" />
                      )}
                      {opt.label}
                    </button>
                  ))}
                  {/* Custom includes that aren't in the standard list */}
                  {selectedIncludes.filter(s => !includesOptions.find(o => o.label === s)).map(custom => (
                    <button
                      key={custom}
                      onClick={() => toggleInclude(custom)}
                      className="px-3 py-1.5 rounded-lg text-sm border bg-primary/10 border-primary text-primary"
                    >
                      <Check className="h-3 w-3 inline mr-1" />{custom}
                    </button>
                  ))}
                </div>
                {/* Add custom include */}
                <div className="flex gap-2 mt-2">
                  <input
                    type="text"
                    placeholder="Add custom (e.g. Yoga Mats)"
                    className="bg-secondary border border-border rounded-lg px-3 py-1.5 text-sm flex-1 max-w-[250px] focus:outline-none focus:border-primary"
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const val = (e.target as HTMLInputElement).value.trim()
                        if (val && !selectedIncludes.includes(val)) {
                          setSelectedIncludes(prev => [...prev, val])
                          ;(e.target as HTMLInputElement).value = ''
                        }
                      }
                    }}
                  />
                  <span className="text-[10px] text-muted-foreground self-center">Press Enter</span>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Images */}
          {step === 2 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold">Trip Images</h2>
              <p className="text-sm text-muted-foreground">
                Add at least one image. Use 16:9 ratio photos for best display (e.g. 1920×1080).
              </p>

              {/* Current images */}
              {images.length > 0 && (
                <div className="flex gap-3 flex-wrap">
                  {images.map((url, i) => (
                    <div key={i} className="relative group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt=""
                        className="h-24 w-36 rounded-lg object-cover border border-border"
                      />
                      <button
                        onClick={() => removeImage(i)}
                        className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full h-5 w-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                      {i === 0 && (
                        <span className="absolute bottom-1 left-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">
                          Cover
                        </span>
                      )}
                    </div>
                  ))}
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
                  className="gap-1.5"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  <Upload className="h-3 w-3" />
                  {uploading ? 'Uploading...' : 'Upload from Device'}
                </Button>
                <span className="text-muted-foreground text-xs">or</span>
                <Input
                  value={imageUrlInput}
                  onChange={e => setImageUrlInput(e.target.value)}
                  placeholder="Paste image URL..."
                  className="bg-secondary border-border text-sm max-w-sm"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addImageUrl()
                    }
                  }}
                />
                <Button size="sm" variant="outline" className="gap-1.5" onClick={addImageUrl} disabled={imageLoading || !imageUrlInput.trim()}>
                  {imageLoading ? (
                    <><span className="h-3 w-3 border-2 border-current/30 border-t-current rounded-full animate-spin" /> Validating...</>
                  ) : (
                    <><ImageIcon className="h-3 w-3" /> Add URL</>
                  )}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Max 5MB each. JPEG, PNG, or WebP.
              </p>
            </div>
          )}

          {/* Step 4: Join Preferences */}
          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold">Join Preferences</h2>
              <p className="text-sm text-muted-foreground">
                Optional filters for who can request to join your trip.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">
                    Min Trips Completed
                  </label>
                  <Input
                    type="number"
                    value={minTripsCompleted}
                    onChange={e => setMinTripsCompleted(e.target.value)}
                    placeholder="e.g. 1"
                    className="bg-secondary border-border"
                    min="0"
                  />
                </div>

                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">
                    Gender Preference
                  </label>
                  <div className="flex gap-2">
                    {(['all', 'men', 'women'] as const).map(g => (
                      <button
                        key={g}
                        onClick={() => setGenderPreference(g)}
                        className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-colors capitalize ${
                          genderPreference === g
                            ? 'bg-primary/10 border-primary text-primary'
                            : 'bg-secondary border-border text-muted-foreground'
                        }`}
                      >
                        {g === 'all' ? 'Everyone' : g === 'men' ? 'Men Only' : 'Women Only'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Interest Tags */}
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">
                  Preferred Interest Tags
                </label>
                <div className="flex flex-wrap gap-2">
                  {INTEREST_TAGS.map(tag => (
                    <button
                      key={tag}
                      onClick={() => toggleInterestTag(tag)}
                      className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                        interestTags.includes(tag)
                          ? 'bg-primary/10 border-primary text-primary'
                          : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {interestTags.includes(tag) && (
                        <Check className="h-3 w-3 inline mr-1" />
                      )}
                      {tag}
                    </button>
                  ))}
                  {/* Custom tags not in standard list */}
                  {interestTags.filter(t => !(INTEREST_TAGS as readonly string[]).includes(t)).map(custom => (
                    <button
                      key={custom}
                      onClick={() => toggleInterestTag(custom)}
                      className="px-3 py-1.5 rounded-lg text-sm border bg-primary/10 border-primary text-primary"
                    >
                      <Check className="h-3 w-3 inline mr-1" />{custom}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <input
                    type="text"
                    placeholder="Add custom tag (e.g. Stargazing)"
                    className="bg-secondary border border-border rounded-lg px-3 py-1.5 text-sm flex-1 max-w-[250px] focus:outline-none focus:border-primary"
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const val = (e.target as HTMLInputElement).value.trim()
                        if (val && !interestTags.includes(val)) {
                          toggleInterestTag(val)
                          ;(e.target as HTMLInputElement).value = ''
                        }
                      }
                    }}
                  />
                  <span className="text-[10px] text-muted-foreground self-center">Press Enter</span>
                </div>
              </div>
            </div>
          )}

          {/* Step 5: Review */}
          {step === 4 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold">Review Your Trip</h2>
              <p className="text-sm text-muted-foreground">
                Double-check everything before submitting. Your trip will be reviewed by our team.
              </p>

              <div className="space-y-4">
                {/* Basic Info */}
                <div className="rounded-lg border border-border p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" /> Basic Info
                    </h3>
                    <button
                      onClick={() => setStep(0)}
                      className="text-xs text-primary hover:underline"
                    >
                      Edit
                    </button>
                  </div>
                  <p className="text-foreground font-medium">{title}</p>
                  {selectedDest && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {selectedDest.name}, {selectedDest.state}
                    </p>
                  )}
                  {shortDescription && (
                    <p className="text-sm text-muted-foreground">{shortDescription}</p>
                  )}
                </div>

                {/* Details */}
                <div className="rounded-lg border border-border p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-primary" /> Details
                    </h3>
                    <button
                      onClick={() => setStep(1)}
                      className="text-xs text-primary hover:underline"
                    >
                      Edit
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <span className="flex flex-col gap-1">
                      <span className="flex items-center gap-1">
                        <IndianRupee className="h-3.5 w-3.5 text-primary" />
                        {(() => {
                          const amounts = priceRows
                            .map((r) => Math.round(parseFloat(r.rupees || '0') * 100))
                            .filter((n) => Number.isFinite(n) && n >= 100)
                          if (priceRows.length >= 2 && amounts.length > 0) {
                            return <>From {formatPrice(Math.min(...amounts))} / person</>
                          }
                          return <>{formatPrice(amounts[0] || 0)} / person</>
                        })()}
                      </span>
                      {priceRows.length >= 2 && (
                        <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                          {priceRows.map((r, i) => (
                            <li key={i}>
                              {formatPrice(Math.round(parseFloat(r.rupees || '0') * 100))} — {r.facilities || '—'}
                            </li>
                          ))}
                        </ul>
                      )}
                    </span>
                    <span>
                      {tripDays}D · {tripNights}N · departs {departureTime} · returns {returnTime}
                      {excludeFirstTravel ? ' · travel day excluded from counts' : ''}
                    </span>
                    <span>Max {maxGroupSize} people</span>
                    <span className="capitalize">{difficulty}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {scheduleRows
                      .filter((r) => r.dep && r.ret)
                      .map((r, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {new Date(r.dep + 'T00:00:00').toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}{' '}
                          →{' '}
                          {new Date(r.ret + 'T00:00:00').toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </Badge>
                      ))}
                  </div>
                  {selectedIncludes.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {selectedIncludes.map(inc => (
                        <Badge key={inc} variant="outline" className="text-xs">
                          {inc}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Images */}
                <div className="rounded-lg border border-border p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold flex items-center gap-2">
                      <ImageIcon className="h-4 w-4 text-primary" /> Images
                    </h3>
                    <button
                      onClick={() => setStep(2)}
                      className="text-xs text-primary hover:underline"
                    >
                      Edit
                    </button>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {images.map((url, i) => (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        key={i}
                        src={url}
                        alt=""
                        className="h-16 w-24 rounded-lg object-cover border border-border"
                      />
                    ))}
                  </div>
                </div>

                {/* Preferences */}
                <div className="rounded-lg border border-border p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Users className="h-4 w-4 text-primary" /> Join Preferences
                    </h3>
                    <button
                      onClick={() => setStep(3)}
                      className="text-xs text-primary hover:underline"
                    >
                      Edit
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                    {genderPreference !== 'all' && (
                      <span className="capitalize">{genderPreference} only</span>
                    )}
                    {minTripsCompleted && <span>Min trips: {minTripsCompleted}</span>}
                    {genderPreference === 'all' && !minTripsCompleted && (
                      <span>Open to everyone</span>
                    )}
                  </div>
                  {interestTags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {interestTags.map(tag => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          <Tag className="h-3 w-3 mr-1" />
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
            <Button
              variant="outline"
              onClick={() => setStep(s => s - 1)}
              disabled={step === 0}
              className="gap-1.5"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>

            {step < STEPS.length - 1 ? (
              <Button
                onClick={() => setStep(s => s + 1)}
                disabled={!canProceed()}
                className="bg-primary text-primary-foreground font-bold gap-1.5"
              >
                Next
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    // Open preview in new tab with data in sessionStorage
                    const previewData = {
                      title, shortDescription, description, priceRows, tripDays, tripNights, maxGroupSize,
                      difficulty, scheduleRows, excludeFirstTravel, departureTime, returnTime, selectedIncludes, images, interestTags,
                      destination: destinationId ? destinations.find(d => d.id === destinationId) : null,
                    }
                    sessionStorage.setItem('trip-preview', JSON.stringify(previewData))
                    window.open('/host/create?preview=1', '_blank')
                  }}
                  className="gap-1.5"
                >
                  <Eye className="h-4 w-4" />
                  Preview
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={isPending}
                  className="bg-primary text-primary-foreground font-bold gap-1.5"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      Submit for Review
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Destination Search with Maps ────────────────────────────
function DestinationSearch({
  destinations,
  value,
  onChange,
}: {
  destinations: Destination[]
  value: string
  onChange: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<
    { id: string; name: string; state: string; isNew?: boolean; detail?: string }[]
  >([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [selectedLabel, setSelectedLabel] = useState('')
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const nominatimReqIdRef = useRef(0)
  const nominatimAbortRef = useRef<AbortController | null>(null)

  // Set initial label if value exists
  useEffect(() => {
    if (value && !selectedLabel) {
      const d = destinations.find(d => d.id === value)
      if (d) setSelectedLabel(`${d.name}, ${d.state}`)
    }
  }, [value, destinations, selectedLabel])

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function normalizeDestQuery(s: string) {
    return s.toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ').trim()
  }

  function handleInput(q: string) {
    setQuery(q)
    setOpen(true)

    if (timerRef.current) clearTimeout(timerRef.current)

    // Match local DB: ignore commas (e.g. "Shoja, Himachal Pradesh")
    const qNorm = normalizeDestQuery(q)
    const tokens = qNorm.split(' ').filter(Boolean)
    const localMatches = destinations
      .filter((d) => {
        const hay = normalizeDestQuery(`${d.name} ${d.state}`)
        return tokens.length === 0 ? true : tokens.every((t) => hay.includes(t))
      })
      .slice(0, 5)
    setResults(localMatches)

    if (q.length < 3) {
      nominatimAbortRef.current?.abort()
      nominatimReqIdRef.current += 1
      setSearching(false)
      return
    }

    nominatimAbortRef.current?.abort()
    const debounceMs = nominatimDebounceMs(q.trim().length)

    // Debounce map search (longer debounce for short strings avoids Nominatim empty prefixes like "Shoj")
    timerRef.current = setTimeout(async () => {
      const reqId = ++nominatimReqIdRef.current
      const controller = new AbortController()
      nominatimAbortRef.current = controller
      setSearching(true)
      try {
        const mapHits = await fetchNominatimIndiaDestinations(q, controller.signal)
        if (reqId !== nominatimReqIdRef.current) return

        const mapResults = mapHits
          .map((h) => ({ ...h, isNew: true as const }))
          .filter(
            (m) =>
              !localMatches.find(
                (l) =>
                  l.name.toLowerCase() === m.name.toLowerCase() &&
                  l.state.toLowerCase() === m.state.toLowerCase(),
              ),
          )

        setResults([...localMatches, ...mapResults])
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        // Keep local results on error
      } finally {
        if (reqId === nominatimReqIdRef.current) setSearching(false)
      }
    }, debounceMs)
  }

  async function selectDestination(d: {
    id: string
    name: string
    state: string
    isNew?: boolean
  }) {
    if (d.isNew) {
      // Create new destination in DB
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const slug = d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

      const { data: newDest, error } = await supabase
        .from('destinations')
        .insert({ name: d.name, state: d.state, slug })
        .select()
        .single()

      if (error) {
        // Might already exist
        const { data: existing } = await supabase
          .from('destinations')
          .select('id')
          .eq('name', d.name)
          .eq('state', d.state)
          .single()
        if (existing) {
          onChange(existing.id)
        } else {
          toast.error('Could not add destination')
          return
        }
      } else {
        onChange(newDest.id)
      }
    } else {
      onChange(d.id)
    }

    setSelectedLabel(`${d.name}, ${d.state}`)
    setQuery('')
    setOpen(false)
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <input
        type="text"
        value={query || (open ? '' : selectedLabel)}
        onChange={e => handleInput(e.target.value)}
        onFocus={() => { setOpen(true); if (selectedLabel) handleInput('') }}
        placeholder="Search any destination in India..."
        className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
      />
      {searching && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      )}

      {open && results.length > 0 && (
        <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-card border border-border rounded-lg shadow-xl max-h-60 overflow-y-auto">
          {results.map(r => (
            <button
              key={r.id}
              onClick={() => selectDestination(r)}
              className="flex items-center justify-between w-full text-left px-3 py-2.5 text-sm hover:bg-secondary/60 transition-colors border-b border-border/30 last:border-0"
            >
              <div className="min-w-0">
                <div>
                  <span className="font-medium">{r.name}</span>
                  <span className="text-muted-foreground">, {r.state}</span>
                </div>
                {r.detail && (
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">{r.detail}</p>
                )}
              </div>
              {r.isNew && (
                <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                  New
                </Badge>
              )}
            </button>
          ))}
        </div>
      )}

      {open && query.length >= 3 && results.length === 0 && !searching && (
        <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-card border border-border rounded-lg shadow-xl px-3 py-4 text-sm text-muted-foreground text-center">
          No destinations found for &quot;{query}&quot;
        </div>
      )}
    </div>
  )
}
