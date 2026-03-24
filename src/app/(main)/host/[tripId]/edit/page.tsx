'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { updateHostedTrip, getHostTripDetail, checkIsHost } from '@/actions/hosting'
import { ArrowLeft, Save, AlertTriangle } from 'lucide-react'
import Link from 'next/link'

export default function EditTripPage() {
  const router = useRouter()
  const params = useParams()
  const tripId = params.tripId as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [trip, setTrip] = useState<Record<string, unknown> | null>(null)

  // Editable fields
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [shortDescription, setShortDescription] = useState('')
  const [priceRupees, setPriceRupees] = useState('')
  const [maxGroupSize, setMaxGroupSize] = useState('')
  const [difficulty, setDifficulty] = useState('moderate')

  useEffect(() => {
    async function load() {
      const hostStatus = await checkIsHost()
      if (!hostStatus.authenticated || !hostStatus.isHost) {
        router.push('/host/verify')
        return
      }

      const tripData = await getHostTripDetail(tripId)
      if (!tripData) {
        toast.error('Trip not found')
        router.push('/host')
        return
      }

      setTrip(tripData)
      setTitle(tripData.title || '')
      setDescription(tripData.description || '')
      setShortDescription(tripData.short_description || '')
      setPriceRupees(tripData.price_paise ? String(tripData.price_paise / 100) : '')
      setMaxGroupSize(String(tripData.max_group_size || 12))
      setDifficulty(tripData.difficulty || 'moderate')
      setLoading(false)
    }
    load()
  }, [tripId, router])

  async function handleSave() {
    if (!title.trim()) { toast.error('Title is required'); return }
    if (!priceRupees || parseInt(priceRupees) < 100) { toast.error('Price must be at least ₹100'); return }

    setSaving(true)
    const result = await updateHostedTrip(tripId, {
      title: title.trim(),
      description: description.trim(),
      short_description: shortDescription.trim() || null,
      price_paise: Math.round(parseFloat(priceRupees) * 100),
      max_group_size: parseInt(maxGroupSize) || 12,
      difficulty,
    })

    if (result.error) {
      toast.error(result.error)
    } else {
      if (result.needsReapproval) {
        toast.success('Trip updated! Sent for re-approval since it was already approved.')
      } else {
        toast.success('Trip updated!')
      }
      router.push(`/host/${tripId}`)
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  const isApproved = (trip as Record<string, unknown>)?.moderation_status === 'approved'

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground mb-4 gap-1.5">
          <Link href={`/host/${tripId}`}>
            <ArrowLeft className="h-4 w-4" />
            Back to Manage
          </Link>
        </Button>

        <h1 className="text-2xl font-black mb-2">Edit Trip</h1>

        {isApproved && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 mb-6">
            <AlertTriangle className="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-yellow-400">
              This trip is currently live. Saving changes will temporarily remove it from explore and send it for admin re-approval.
            </p>
          </div>
        )}

        <div className="space-y-5">
          <div>
            <label className="text-sm text-muted-foreground mb-1.5 block">Title *</label>
            <Input value={title} onChange={e => setTitle(e.target.value)} className="bg-secondary border-border" maxLength={100} />
          </div>

          <div>
            <label className="text-sm text-muted-foreground mb-1.5 block">Short Description</label>
            <Input value={shortDescription} onChange={e => setShortDescription(e.target.value)} className="bg-secondary border-border" maxLength={150} />
          </div>

          <div>
            <label className="text-sm text-muted-foreground mb-1.5 block">Description *</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={6}
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted-foreground mb-1.5 block">Price (₹) *</label>
              <Input type="number" value={priceRupees} onChange={e => setPriceRupees(e.target.value)} className="bg-secondary border-border" min="100" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1.5 block">Max Group Size</label>
              <Input type="number" value={maxGroupSize} onChange={e => setMaxGroupSize(e.target.value)} className="bg-secondary border-border" min="2" max="50" />
            </div>
          </div>

          <div>
            <label className="text-sm text-muted-foreground mb-1.5 block">Difficulty</label>
            <select
              value={difficulty}
              onChange={e => setDifficulty(e.target.value)}
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
            >
              <option value="easy">Easy</option>
              <option value="moderate">Moderate</option>
              <option value="challenging">Challenging</option>
            </select>
          </div>

          <Button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            className="w-full bg-primary text-primary-foreground font-bold"
            size="lg"
          >
            {saving ? 'Saving...' : (
              <span className="flex items-center gap-2">
                <Save className="h-4 w-4" />
                {isApproved ? 'Save & Submit for Re-approval' : 'Save Changes'}
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
