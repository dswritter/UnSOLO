'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  createServiceListingItem,
  updateServiceListingItem,
  deleteServiceListingItem,
} from '@/actions/host-service-listing-items'
import type { ServiceListing, ServiceListingItem } from '@/types'

interface Props {
  listingId: string
  listingUnit: ServiceListing['unit']
  initialItems: ServiceListingItem[]
}

const UNIT_LABEL: Record<ServiceListing['unit'], string> = {
  per_night: '/ night',
  per_person: '/ person',
  per_day: '/ day',
  per_hour: '/ hour',
  per_week: '/ week',
  per_month: '/ month',
}

type DraftItem = {
  name: string
  description: string
  priceRupees: number
  quantity: number
  maxPerBooking: number
  images: string[]
}

const EMPTY_DRAFT: DraftItem = {
  name: '',
  description: '',
  priceRupees: 0,
  quantity: 1,
  maxPerBooking: 1,
  images: [],
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

export function ItemsManagerClient({ listingId, listingUnit, initialItems }: Props) {
  const router = useRouter()
  const [items, setItems] = useState<ServiceListingItem[]>(initialItems)
  const [draft, setDraft] = useState<DraftItem>(EMPTY_DRAFT)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<DraftItem | null>(null)

  async function handleDraftImageAdd(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setUploading(true)
    const uploaded: string[] = []
    for (const f of files) {
      const url = await uploadImage(f)
      if (url) uploaded.push(url)
    }
    setDraft(prev => ({ ...prev, images: [...prev.images, ...uploaded] }))
    setUploading(false)
    e.target.value = ''
  }

  async function handleEditImageAdd(e: React.ChangeEvent<HTMLInputElement>) {
    if (!editDraft) return
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setUploading(true)
    const uploaded: string[] = []
    for (const f of files) {
      const url = await uploadImage(f)
      if (url) uploaded.push(url)
    }
    setEditDraft(prev => prev ? { ...prev, images: [...prev.images, ...uploaded] } : prev)
    setUploading(false)
    e.target.value = ''
  }

  async function handleAdd() {
    if (!draft.name.trim()) {
      toast.error('Item name is required')
      return
    }
    setSaving(true)
    const result = await createServiceListingItem({
      service_listing_id: listingId,
      name: draft.name,
      description: draft.description,
      price_paise: Math.round(draft.priceRupees * 100),
      quantity_available: draft.quantity,
      max_per_booking: draft.maxPerBooking,
      images: draft.images,
      position_order: items.length,
    })
    setSaving(false)
    if ('error' in result && result.error) {
      toast.error(result.error)
      return
    }
    if ('item' in result && result.item) {
      const newItem = result.item
      setItems(prev => [...prev, newItem])
      setDraft(EMPTY_DRAFT)
      toast.success('Item added')
      router.refresh()
    }
  }

  function startEdit(item: ServiceListingItem) {
    setEditingId(item.id)
    setEditDraft({
      name: item.name,
      description: item.description || '',
      priceRupees: item.price_paise / 100,
      quantity: item.quantity_available,
      maxPerBooking: item.max_per_booking,
      images: item.images,
    })
  }

  async function saveEdit() {
    if (!editingId || !editDraft) return
    if (!editDraft.name.trim()) {
      toast.error('Item name is required')
      return
    }
    setSaving(true)
    const result = await updateServiceListingItem(editingId, {
      name: editDraft.name,
      description: editDraft.description,
      price_paise: Math.round(editDraft.priceRupees * 100),
      quantity_available: editDraft.quantity,
      max_per_booking: editDraft.maxPerBooking,
      images: editDraft.images,
    })
    setSaving(false)
    if ('error' in result && result.error) {
      toast.error(result.error)
      return
    }
    if ('item' in result && result.item) {
      const updated = result.item
      setItems(prev => prev.map(i => i.id === editingId ? updated : i))
      setEditingId(null)
      setEditDraft(null)
      toast.success('Item updated')
      router.refresh()
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this item?')) return
    const result = await deleteServiceListingItem(id)
    if ('error' in result && result.error) {
      toast.error(result.error)
      return
    }
    setItems(prev => prev.filter(i => i.id !== id))
    toast.success('Item deleted')
    router.refresh()
  }

  const unitLabel = UNIT_LABEL[listingUnit] || ''

  return (
    <div className="space-y-6">
      {/* Existing items */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Items ({items.length})</h2>
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No items yet. Add your first one below.
          </p>
        )}
        {items.map(item => {
          const isEditing = editingId === item.id
          if (isEditing && editDraft) {
            return (
              <ItemEditor
                key={item.id}
                draft={editDraft}
                setDraft={setEditDraft as (d: DraftItem) => void}
                unitLabel={unitLabel}
                uploading={uploading}
                onImageAdd={handleEditImageAdd}
                onImageRemove={(url) =>
                  setEditDraft(prev => prev ? { ...prev, images: prev.images.filter(u => u !== url) } : prev)
                }
              >
                <div className="flex gap-2 pt-2">
                  <Button size="sm" onClick={saveEdit} disabled={saving || uploading}>
                    {saving ? 'Saving...' : 'Save'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setEditingId(null); setEditDraft(null) }}
                  >
                    Cancel
                  </Button>
                </div>
              </ItemEditor>
            )
          }
          return (
            <div key={item.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                {item.images[0] && (
                  <img
                    src={item.images[0]}
                    alt={item.name}
                    className="h-16 w-16 rounded-lg object-cover"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold truncate">{item.name}</h3>
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => startEdit(item)}
                        className="text-xs text-primary hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id)}
                        className="text-xs text-red-500 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    ₹{(item.price_paise / 100).toLocaleString('en-IN')} {unitLabel} · Qty {item.quantity_available} · Max {item.max_per_booking}/booking · {item.images.length} photo{item.images.length === 1 ? '' : 's'}
                  </p>
                  {item.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.description}</p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </section>

      {/* Add new */}
      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold">Add a new item</h2>
        <ItemEditor
          draft={draft}
          setDraft={setDraft}
          unitLabel={unitLabel}
          uploading={uploading}
          onImageAdd={handleDraftImageAdd}
          onImageRemove={(url) =>
            setDraft(prev => ({ ...prev, images: prev.images.filter(u => u !== url) }))
          }
        >
          <Button onClick={handleAdd} disabled={saving || uploading} className="w-full">
            {saving ? 'Adding...' : 'Add Item'}
          </Button>
        </ItemEditor>
      </section>

      <div className="pt-2">
        <Button variant="outline" onClick={() => router.push('/host')}>
          Back to host dashboard
        </Button>
      </div>
    </div>
  )
}

interface EditorProps {
  draft: DraftItem
  setDraft: (d: DraftItem) => void
  unitLabel: string
  uploading: boolean
  onImageAdd: (e: React.ChangeEvent<HTMLInputElement>) => void
  onImageRemove: (url: string) => void
  children?: React.ReactNode
}

function ItemEditor({ draft, setDraft, unitLabel, uploading, onImageAdd, onImageRemove, children }: EditorProps) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-semibold">Name *</label>
        <input
          type="text"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="e.g., Maruti Alto (White) / Deluxe Room / Sunset Trek"
          className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-primary"
        />
      </div>

      <div>
        <label className="text-xs font-semibold">Description</label>
        <textarea
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          rows={2}
          placeholder="Optional details specific to this item"
          className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-primary resize-none"
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-xs font-semibold">Price (₹) {unitLabel}</label>
          <input
            type="number"
            min="0"
            value={draft.priceRupees}
            onChange={(e) => setDraft({ ...draft, priceRupees: Number(e.target.value) })}
            className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="text-xs font-semibold">Quantity</label>
          <input
            type="number"
            min="0"
            value={draft.quantity}
            onChange={(e) => setDraft({ ...draft, quantity: Number(e.target.value) })}
            className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="text-xs font-semibold">Max / booking</label>
          <input
            type="number"
            min="1"
            value={draft.maxPerBooking}
            onChange={(e) => setDraft({ ...draft, maxPerBooking: Number(e.target.value) })}
            className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold">Photos</label>
        <div className="mt-1 flex flex-wrap gap-2">
          {draft.images.map((url) => (
            <div key={url} className="relative">
              <img src={url} alt="item" className="h-16 w-16 rounded-lg object-cover" />
              <button
                type="button"
                onClick={() => onImageRemove(url)}
                className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-background border border-border text-xs shadow"
                aria-label="Remove"
              >
                ×
              </button>
            </div>
          ))}
          <label className="h-16 w-16 rounded-lg border-2 border-dashed border-border flex items-center justify-center text-xs text-muted-foreground cursor-pointer hover:border-primary">
            {uploading ? '…' : '+ Add'}
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={onImageAdd}
              disabled={uploading}
            />
          </label>
        </div>
      </div>

      {children}
    </div>
  )
}
