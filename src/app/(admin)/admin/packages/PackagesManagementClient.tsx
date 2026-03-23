'use client'

import { useState, useTransition } from 'react'
import { formatPrice, formatDate, type Package, type Destination } from '@/types'
import { createPackage, updatePackage, togglePackageActive, createDestination } from '@/actions/admin'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Plus, Eye, EyeOff, Star, MapPin, Edit2, X } from 'lucide-react'

interface Props {
  packages: Package[]
  destinations: Destination[]
}

export function PackagesManagementClient({ packages: initial, destinations }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [showDestForm, setShowDestForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Form state
  const [form, setForm] = useState({
    title: '', slug: '', destination_id: '', description: '', short_description: '',
    price: '', duration_days: '', max_group_size: '', difficulty: 'moderate',
    includes: '', images: '', departure_dates: '', is_featured: false,
  })

  const [destForm, setDestForm] = useState({ name: '', state: '', description: '', image_url: '' })

  function resetForm() {
    setForm({
      title: '', slug: '', destination_id: '', description: '', short_description: '',
      price: '', duration_days: '', max_group_size: '', difficulty: 'moderate',
      includes: '', images: '', departure_dates: '', is_featured: false,
    })
    setEditingId(null)
    setShowForm(false)
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
      includes: (pkg.includes || []).join(', '),
      images: (pkg.images || []).join('\n'),
      departure_dates: (pkg.departure_dates || []).join(', '),
      is_featured: pkg.is_featured,
    })
    setEditingId(pkg.id)
    setShowForm(true)
  }

  function handleSubmit() {
    if (!form.title || !form.destination_id || !form.price || !form.duration_days) {
      setMessage({ type: 'error', text: 'Title, destination, price, and duration are required.' })
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
      includes: form.includes.split(',').map(s => s.trim()).filter(Boolean),
      images: form.images.split('\n').map(s => s.trim()).filter(Boolean),
      departure_dates: form.departure_dates.split(',').map(s => s.trim()).filter(Boolean),
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
    startTransition(async () => {
      const res = await togglePackageActive(pkgId, !current)
      if (res.error) setMessage({ type: 'error', text: res.error })
      else setMessage({ type: 'success', text: `Package ${!current ? 'activated' : 'deactivated'}. Reload to see changes.` })
    })
  }

  function handleCreateDest() {
    if (!destForm.name || !destForm.state) return
    startTransition(async () => {
      const res = await createDestination(destForm.name, destForm.state, destForm.description, destForm.image_url)
      if (res.error) setMessage({ type: 'error', text: res.error })
      else {
        setMessage({ type: 'success', text: 'Destination created! Reload to see it in dropdown.' })
        setDestForm({ name: '', state: '', description: '', image_url: '' })
        setShowDestForm(false)
      }
    })
  }

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
        <Button
          variant="outline"
          className="border-zinc-700 gap-1"
          onClick={() => setShowDestForm(!showDestForm)}
        >
          <MapPin className="h-4 w-4" /> New Destination
        </Button>
      </div>

      {/* New destination form */}
      {showDestForm && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Add New Destination</h3>
            <button onClick={() => setShowDestForm(false)}><X className="h-4 w-4 text-zinc-500" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Name *</label>
              <Input value={destForm.name} onChange={e => setDestForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Kasol" className="bg-zinc-800 border-zinc-700" />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">State *</label>
              <Input value={destForm.state} onChange={e => setDestForm(f => ({ ...f, state: e.target.value }))} placeholder="e.g. Himachal Pradesh" className="bg-zinc-800 border-zinc-700" />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Description</label>
              <Input value={destForm.description} onChange={e => setDestForm(f => ({ ...f, description: e.target.value }))} placeholder="Short description" className="bg-zinc-800 border-zinc-700" />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Image URL</label>
              <Input value={destForm.image_url} onChange={e => setDestForm(f => ({ ...f, image_url: e.target.value }))} placeholder="https://..." className="bg-zinc-800 border-zinc-700" />
            </div>
          </div>
          <Button onClick={handleCreateDest} disabled={isPending || !destForm.name || !destForm.state} className="bg-primary text-black hover:bg-primary/90">
            {isPending ? 'Creating...' : 'Create Destination'}
          </Button>
        </div>
      )}

      {/* Package form */}
      {showForm && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{editingId ? 'Edit Package' : 'Create New Package'}</h3>
            <button onClick={resetForm}><X className="h-4 w-4 text-zinc-500" /></button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Title *</label>
              <Input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value, slug: autoSlug(e.target.value) }))}
                placeholder="e.g. Kasol Backpacking Trip"
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Slug</label>
              <Input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} className="bg-zinc-800 border-zinc-700 text-zinc-500" />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Destination *</label>
              <select
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm"
                value={form.destination_id}
                onChange={e => setForm(f => ({ ...f, destination_id: e.target.value }))}
              >
                <option value="">Select destination...</option>
                {destinations.map(d => (
                  <option key={d.id} value={d.id}>{d.name}, {d.state}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Price (₹) *</label>
              <Input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="8999" className="bg-zinc-800 border-zinc-700" />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Duration (days) *</label>
              <Input type="number" value={form.duration_days} onChange={e => setForm(f => ({ ...f, duration_days: e.target.value }))} placeholder="4" className="bg-zinc-800 border-zinc-700" />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Max Group Size</label>
              <Input type="number" value={form.max_group_size} onChange={e => setForm(f => ({ ...f, max_group_size: e.target.value }))} placeholder="12" className="bg-zinc-800 border-zinc-700" />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Difficulty</label>
              <select
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm"
                value={form.difficulty}
                onChange={e => setForm(f => ({ ...f, difficulty: e.target.value }))}
              >
                <option value="easy">Easy</option>
                <option value="moderate">Moderate</option>
                <option value="challenging">Challenging</option>
              </select>
            </div>
            <div className="flex items-center gap-2 self-end pb-2">
              <input
                type="checkbox"
                checked={form.is_featured}
                onChange={e => setForm(f => ({ ...f, is_featured: e.target.checked }))}
                className="accent-primary"
                id="is_featured"
              />
              <label htmlFor="is_featured" className="text-sm">Featured</label>
            </div>
          </div>

          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Short Description</label>
            <Input value={form.short_description} onChange={e => setForm(f => ({ ...f, short_description: e.target.value }))} placeholder="One-liner for cards" className="bg-zinc-800 border-zinc-700" />
          </div>

          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Full Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={3}
              placeholder="Detailed trip description..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Includes (comma-separated)</label>
              <Input value={form.includes} onChange={e => setForm(f => ({ ...f, includes: e.target.value }))} placeholder="Accommodation, Meals, Transport, Guide" className="bg-zinc-800 border-zinc-700" />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Departure Dates (comma-separated)</label>
              <Input value={form.departure_dates} onChange={e => setForm(f => ({ ...f, departure_dates: e.target.value }))} placeholder="2026-04-15, 2026-05-01" className="bg-zinc-800 border-zinc-700" />
            </div>
          </div>

          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Image URLs (one per line)</label>
            <textarea
              value={form.images}
              onChange={e => setForm(f => ({ ...f, images: e.target.value }))}
              rows={2}
              placeholder="https://images.unsplash.com/..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm resize-none font-mono text-xs"
            />
          </div>

          <Button onClick={handleSubmit} disabled={isPending} className="bg-primary text-black hover:bg-primary/90">
            {isPending ? 'Saving...' : editingId ? 'Update Package' : 'Create Package'}
          </Button>
        </div>
      )}

      {/* Package list */}
      <div className="space-y-3">
        {initial.map(pkg => (
          <div key={pkg.id} className={`rounded-xl border bg-zinc-900/50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${pkg.is_active ? 'border-zinc-800' : 'border-red-900/30 opacity-60'}`}>
            <div className="flex items-center gap-3 min-w-0">
              {pkg.images?.[0] && (
                <img src={pkg.images[0]} alt="" className="h-12 w-12 rounded-lg object-cover shrink-0" />
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold truncate">{pkg.title}</p>
                  {pkg.is_featured && <Star className="h-3.5 w-3.5 text-primary fill-primary shrink-0" />}
                  {!pkg.is_active && <Badge className="bg-red-900/50 text-red-300 border border-red-700 text-xs">Inactive</Badge>}
                </div>
                <p className="text-xs text-zinc-500">
                  {pkg.destination?.name}, {pkg.destination?.state} · {pkg.duration_days}d · Max {pkg.max_group_size} · {pkg.difficulty}
                </p>
                <p className="text-xs text-zinc-600">
                  {(pkg.departure_dates || []).length} departure dates · {formatPrice(pkg.price_paise)}/person
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-primary font-bold text-sm">{formatPrice(pkg.price_paise)}</span>
              <Button
                size="sm"
                variant="ghost"
                className="text-zinc-400 hover:text-white"
                onClick={() => loadForEdit(pkg)}
              >
                <Edit2 className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className={pkg.is_active ? 'text-red-400 hover:text-red-300' : 'text-green-400 hover:text-green-300'}
                onClick={() => handleToggleActive(pkg.id, pkg.is_active)}
                disabled={isPending}
              >
                {pkg.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
