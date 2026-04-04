'use client'

import { useState, useTransition, useRef } from 'react'
import { formatPrice, type Package, type Destination } from '@/types'
import { createPackage, updatePackage, togglePackageActive, deletePackage, createDestination, addIncludesOption } from '@/actions/admin'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Plus, Eye, EyeOff, Star, MapPin, Edit2, X, Upload, Image as ImageIcon } from 'lucide-react'

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
    price: '', duration_days: '', max_group_size: '', difficulty: 'moderate',
    selectedIncludes: [] as string[],
    images: [] as string[],
    departureDates: [] as { departure: string; }[],
    is_featured: false,
  })

  // Inline new destination
  const [showNewDest, setShowNewDest] = useState(false)
  const [newDest, setNewDest] = useState({ name: '', state: '' })

  // New includes option
  const [newInclude, setNewInclude] = useState('')

  // Image upload
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [imageUrlInput, setImageUrlInput] = useState('')

  function resetForm() {
    setForm({
      title: '', slug: '', destination_id: '', description: '', short_description: '',
      price: '', duration_days: '', max_group_size: '', difficulty: 'moderate',
      selectedIncludes: [], images: [],
      departureDates: [], is_featured: false,
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
      price: String(pkg.price_paise / 100),
      duration_days: String(pkg.duration_days),
      max_group_size: String(pkg.max_group_size),
      difficulty: pkg.difficulty,
      selectedIncludes: pkg.includes || [],
      images: pkg.images || [],
      departureDates: (pkg.departure_dates || []).map(d => ({ departure: d })),
      is_featured: pkg.is_featured,
    })
    setEditingId(pkg.id)
    setShowForm(true)
  }

  function handleSubmit() {
    if (!form.title || !form.destination_id || !form.price || !form.duration_days) {
      setMessage({ type: 'error', text: 'Title, destination, price, and duration are required.' })
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    if (!editingId && form.images.length === 0) {
      setMessage({ type: 'error', text: 'Please add at least one thumbnail image for the package.' })
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    const data = {
      title: form.title,
      slug: form.slug || autoSlug(form.title),
      destination_id: form.destination_id,
      description: form.description,
      short_description: form.short_description,
      price_paise: Math.round(parseFloat(form.price) * 100),
      duration_days: parseInt(form.duration_days),
      max_group_size: parseInt(form.max_group_size) || 12,
      difficulty: form.difficulty,
      includes: form.selectedIncludes,
      images: form.images,
      departure_dates: form.departureDates.map(d => d.departure).filter(Boolean),
      is_featured: form.is_featured,
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
          setForm(f => ({ ...f, images: [...f.images, json.url] }))
        } else {
          setMessage({ type: 'error', text: json.error || 'Upload failed' })
        }
      } catch {
        setMessage({ type: 'error', text: 'Upload failed' })
      }
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
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

  function removeImage(idx: number) {
    setForm(f => ({ ...f, images: f.images.filter((_, i) => i !== idx) }))
  }

  function addDepartureDate() {
    setForm(f => ({ ...f, departureDates: [...f.departureDates, { departure: '' }] }))
  }

  function updateDepartureDate(idx: number, value: string) {
    setForm(f => ({
      ...f,
      departureDates: f.departureDates.map((d, i) => i === idx ? { departure: value } : d),
    }))
  }

  function removeDepartureDate(idx: number) {
    setForm(f => ({ ...f, departureDates: f.departureDates.filter((_, i) => i !== idx) }))
  }

  const today = new Date().toISOString().split('T')[0]
  const maxDateStr = (() => { const d = new Date(); d.setFullYear(d.getFullYear() + 2); return d.toISOString().split('T')[0] })()

  return (
    <div className="space-y-6">
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
        <div className="rounded-xl border border-border bg-card/50 p-5 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg">{editingId ? 'Edit Package' : 'Create New Package'}</h3>
            <button onClick={resetForm}><X className="h-4 w-4 text-muted-foreground" /></button>
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
              <select
                className="w-full bg-secondary border border-zinc-700 rounded-lg px-3 py-2 text-sm"
                value={form.destination_id}
                onChange={e => {
                  if (e.target.value === '__new__') {
                    setShowNewDest(true)
                  } else {
                    setForm(f => ({ ...f, destination_id: e.target.value }))
                  }
                }}
              >
                <option value="">Select destination...</option>
                {destinations.map(d => (
                  <option key={d.id} value={d.id}>{d.name}, {d.state}</option>
                ))}
                <option value="__new__">+ Add New Destination</option>
              </select>

              {showNewDest && (
                <div className="mt-2 p-3 bg-secondary/50 rounded-lg border border-zinc-700 space-y-2">
                  <Input
                    placeholder="City/Town/Village name (e.g. Kasol)"
                    value={newDest.name}
                    onChange={e => setNewDest(n => ({ ...n, name: e.target.value }))}
                    className="bg-secondary border-zinc-700 text-sm"
                  />
                  <select
                    value={newDest.state}
                    onChange={e => setNewDest(n => ({ ...n, state: e.target.value }))}
                    className="w-full bg-secondary border border-zinc-700 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">Select state/UT...</option>
                    {['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Andaman & Nicobar','Chandigarh','Dadra & Nagar Haveli','Daman & Diu','Delhi','Jammu & Kashmir','Ladakh','Lakshadweep','Puducherry'].map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleCreateDestInline} disabled={isPending || !newDest.name || !newDest.state} className="bg-primary text-black text-xs">
                      Create
                    </Button>
                    <Button size="sm" variant="ghost" className="text-xs text-muted-foreground" onClick={() => setShowNewDest(false)}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Price (₹) *</label>
              <Input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="8999" className="bg-secondary border-zinc-700" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Duration (days) *</label>
              <Input type="number" value={form.duration_days} onChange={e => setForm(f => ({ ...f, duration_days: e.target.value }))} placeholder="4" className="bg-secondary border-zinc-700" />
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
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={3}
              placeholder="Detailed trip description..."
              className="w-full bg-secondary border border-zinc-700 rounded-lg px-3 py-2 text-sm resize-none"
            />
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

          {/* Images — upload + URL */}
          <div>
            <label className="text-xs text-muted-foreground mb-2 block">
              Images <span className="text-zinc-600">(Recommended: 1200×800px, max 5MB each, JPEG/PNG/WebP)</span>
            </label>

            {/* Current images */}
            {form.images.length > 0 && (
              <div className="flex gap-2 flex-wrap mb-3">
                {form.images.map((url, i) => (
                  <div key={i} className="relative group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="h-20 w-28 rounded-lg object-cover border border-zinc-700" />
                    <button
                      onClick={() => removeImage(i)}
                      className="absolute -top-1.5 -right-1.5 bg-red-600 text-white rounded-full h-5 w-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ×
                    </button>
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
                className="border-zinc-700 text-xs gap-1"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Upload className="h-3 w-3" /> {uploading ? 'Uploading...' : 'Upload from Device'}
              </Button>
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

          {/* Departure Dates — date pickers */}
          <div>
            <label className="text-xs text-muted-foreground mb-2 block">Departure Dates</label>
            <div className="space-y-2 mb-2">
              {form.departureDates.map((d, i) => {
                const returnDate = d.departure && form.duration_days
                  ? (() => { const r = new Date(d.departure + 'T00:00:00'); r.setDate(r.getDate() + parseInt(form.duration_days || '0') - 1); return r.toISOString().split('T')[0] })()
                  : ''
                return (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      type="date"
                      min={today}
                      max={maxDateStr}
                      value={d.departure}
                      onChange={e => updateDepartureDate(i, e.target.value)}
                      className="bg-secondary border-zinc-700 text-sm max-w-[180px]"
                    />
                    {returnDate && (
                      <span className="text-xs text-muted-foreground">→ Return: {new Date(returnDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    )}
                    <button onClick={() => removeDepartureDate(i)} className="text-red-400 hover:text-red-300"><X className="h-4 w-4" /></button>
                  </div>
                )
              })}
            </div>
            <Button size="sm" variant="outline" className="border-zinc-700 text-xs gap-1" onClick={addDepartureDate}>
              <Plus className="h-3 w-3" /> Add Date
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
                  {pkg.destination?.name}, {pkg.destination?.state} · {pkg.duration_days}d · Max {pkg.max_group_size} · {pkg.difficulty}
                </p>
                <p className="text-xs text-zinc-600">
                  {(pkg.departure_dates || []).length} departure dates · {formatPrice(pkg.price_paise)}/person
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-primary font-bold text-sm">{formatPrice(pkg.price_paise)}</span>
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
