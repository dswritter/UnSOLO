'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { INTEREST_TAGS } from '@/lib/constants'
import { formatPrice } from '@/lib/utils'
import {
  createHostedTrip,
  getDestinationsPublic,
  getIncludesOptionsPublic,
  checkIsHost,
} from '@/actions/hosting'
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

  const [priceRupees, setPriceRupees] = useState('')
  const [durationDays, setDurationDays] = useState('')
  const [maxGroupSize, setMaxGroupSize] = useState('12')
  const [difficulty, setDifficulty] = useState('moderate')
  const [departureDates, setDepartureDates] = useState<string[]>([])
  const [selectedIncludes, setSelectedIncludes] = useState<string[]>([])

  const [images, setImages] = useState<string[]>([])
  const [imageUrlInput, setImageUrlInput] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
      setLoading(false)
    }
    load()
  }, [router])

  const today = new Date().toISOString().split('T')[0]
  const maxDateStr = (() => {
    const d = new Date()
    d.setFullYear(d.getFullYear() + 2)
    return d.toISOString().split('T')[0]
  })()

  // Image upload handler (same pattern as admin)
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files?.length) return
    setUploading(true)

    for (const file of Array.from(files)) {
      const fd = new FormData()
      fd.append('file', file)
      try {
        const res = await fetch('/api/upload', { method: 'POST', body: fd })
        const json = await res.json()
        if (json.url) {
          setImages(prev => [...prev, json.url])
        } else {
          toast.error(json.error || 'Upload failed')
        }
      } catch {
        toast.error('Upload failed')
      }
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function addImageUrl() {
    const url = imageUrlInput.trim()
    if (!url) return
    let finalUrl = url
    if (url.includes('unsplash.com/photos/') && !url.includes('images.unsplash.com')) {
      const parts = url.split('/photos/')
      if (parts[1]) {
        const slug = parts[1].split('?')[0].split('/')[0]
        const photoId = slug.includes('-') ? slug.split('-').pop() : slug
        finalUrl = `https://images.unsplash.com/photo-${photoId}?w=1200&q=80`
      }
    }
    setImages(prev => [...prev, finalUrl])
    setImageUrlInput('')
  }

  function removeImage(idx: number) {
    setImages(prev => prev.filter((_, i) => i !== idx))
  }

  function addDepartureDate() {
    setDepartureDates(prev => [...prev, ''])
  }

  function updateDepartureDate(idx: number, value: string) {
    setDepartureDates(prev => prev.map((d, i) => (i === idx ? value : d)))
  }

  function removeDepartureDate(idx: number) {
    setDepartureDates(prev => prev.filter((_, i) => i !== idx))
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
      case 1:
        return !!priceRupees && !!durationDays && departureDates.filter(Boolean).length > 0
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
    const pricePaise = Math.round(parseFloat(priceRupees) * 100)
    if (isNaN(pricePaise) || pricePaise <= 0) {
      toast.error('Invalid price')
      return
    }

    startTransition(async () => {
      const result = await createHostedTrip({
        title: title.trim(),
        destination_id: destinationId,
        description: description.trim(),
        short_description: shortDescription.trim() || undefined,
        price_paise: pricePaise,
        duration_days: parseInt(durationDays),
        max_group_size: parseInt(maxGroupSize) || 12,
        difficulty,
        includes: selectedIncludes,
        images,
        departure_dates: departureDates.filter(Boolean),
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">Price per person (INR) *</label>
                  <Input
                    type="number"
                    value={priceRupees}
                    onChange={e => setPriceRupees(e.target.value)}
                    placeholder="8999"
                    className="bg-secondary border-border"
                    min="1"
                  />
                  {priceRupees && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Display price: {formatPrice(Math.round(parseFloat(priceRupees || '0') * 100))}
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">Duration (days) *</label>
                  <Input
                    type="number"
                    value={durationDays}
                    onChange={e => setDurationDays(e.target.value)}
                    placeholder="4"
                    className="bg-secondary border-border"
                    min="1"
                    max="30"
                  />
                </div>

                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">Max Group Size</label>
                  <Input
                    type="number"
                    value={maxGroupSize}
                    onChange={e => setMaxGroupSize(e.target.value)}
                    placeholder="12"
                    className="bg-secondary border-border"
                    min="2"
                    max="50"
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

              {/* Departure Dates */}
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">Departure Dates *</label>
                <div className="space-y-2 mb-3">
                  {departureDates.map((d, i) => {
                    const returnDate =
                      d && durationDays
                        ? (() => {
                            const r = new Date(d + 'T00:00:00')
                            r.setDate(r.getDate() + parseInt(durationDays || '0') - 1)
                            return r.toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })
                          })()
                        : ''
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <Input
                          type="date"
                          min={today}
                          max={maxDateStr}
                          value={d}
                          onChange={e => updateDepartureDate(i, e.target.value)}
                          className="bg-secondary border-border text-sm max-w-[200px]"
                        />
                        {returnDate && (
                          <span className="text-xs text-muted-foreground">
                            Return: {returnDate}
                          </span>
                        )}
                        <button
                          onClick={() => removeDepartureDate(i)}
                          className="text-red-400 hover:text-red-300"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    )
                  })}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={addDepartureDate}
                >
                  <Plus className="h-3 w-3" /> Add Date
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
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Images */}
          {step === 2 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold">Trip Images</h2>
              <p className="text-sm text-muted-foreground">
                Add at least one image. High-quality photos attract more travelers.
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
                <Button size="sm" variant="outline" className="gap-1.5" onClick={addImageUrl}>
                  <ImageIcon className="h-3 w-3" /> Add URL
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Recommended: 1200x800px, max 5MB each. JPEG, PNG, or WebP.
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
                    <span className="flex items-center gap-1">
                      <IndianRupee className="h-3.5 w-3.5 text-primary" />
                      {formatPrice(Math.round(parseFloat(priceRupees || '0') * 100))} / person
                    </span>
                    <span>{durationDays} days</span>
                    <span>Max {maxGroupSize} people</span>
                    <span className="capitalize">{difficulty}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {departureDates.filter(Boolean).map((d, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {new Date(d + 'T00:00:00').toLocaleDateString('en-IN', {
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
  const [results, setResults] = useState<{ id: string; name: string; state: string; isNew?: boolean }[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [selectedLabel, setSelectedLabel] = useState('')
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

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

  function handleInput(q: string) {
    setQuery(q)
    setOpen(true)

    if (timerRef.current) clearTimeout(timerRef.current)

    // First show matching existing destinations instantly
    const localMatches = destinations
      .filter(d => `${d.name} ${d.state}`.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 5)
    setResults(localMatches)

    if (q.length < 3) return

    // Debounce map search
    timerRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + ' India')}&format=json&limit=5&countrycodes=in&addressdetails=1`,
          { headers: { 'User-Agent': 'UnSOLO/1.0' } }
        )
        const data = await res.json()

        const mapResults = data
          .filter((r: { type?: string }) => !['country', 'continent'].includes(r.type || ''))
          .map((r: { place_id: number; display_name: string; address?: { state?: string; city?: string; town?: string; village?: string; county?: string } }) => {
            const addr = r.address || {}
            const name = addr.city || addr.town || addr.village || addr.county || r.display_name.split(',')[0]
            const state = addr.state || 'India'
            return {
              id: `new_${r.place_id}`,
              name: name.trim(),
              state: state.trim(),
              isNew: true,
            }
          })
          // Remove duplicates with existing destinations
          .filter((m: { name: string; state: string }) =>
            !localMatches.find(l => l.name.toLowerCase() === m.name.toLowerCase() && l.state.toLowerCase() === m.state.toLowerCase())
          )

        setResults([...localMatches, ...mapResults])
      } catch {
        // Keep local results on error
      }
      setSearching(false)
    }, 400)
  }

  async function selectDestination(d: { id: string; name: string; state: string; isNew?: boolean }) {
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
              <div>
                <span className="font-medium">{r.name}</span>
                <span className="text-muted-foreground">, {r.state}</span>
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
