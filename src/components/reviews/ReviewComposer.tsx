'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ImagePlus, Loader2, Star, X } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { compressImage, uploadImage } from '@/lib/images/compressImage'
import { v1 } from '@/lib/api/v1-client'

const MAX_PHOTOS = 6

type Photo = { key: string; preview: string; url: string | null; progress: number; failed: boolean }

function Stars({ label, value, onChange, id }: { label: string; value: number; onChange: (v: number) => void; id: string }) {
  return (
    <fieldset className="space-y-1">
      <legend id={id} className="text-sm font-medium text-foreground">{label}</legend>
      <div className="flex gap-1" role="radiogroup" aria-labelledby={id}>
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={value === i}
            aria-label={`${i} star${i === 1 ? '' : 's'}`}
            onClick={() => onChange(i)}
            className="rounded p-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Star className={`h-8 w-8 transition-colors ${i <= value ? 'fill-amber-400 text-amber-400' : 'text-foreground/30 hover:text-amber-400/60'}`} aria-hidden />
          </button>
        ))}
      </div>
    </fieldset>
  )
}

/** Review a finished trip: two ratings, a title, the text and up to six photos (POST /api/v1/reviews). */
export function ReviewComposer({ bookingId, tripSlug }: { bookingId: string; tripSlug: string }) {
  const [dest, setDest] = useState(0)
  const [exp, setExp] = useState(0)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [photos, setPhotos] = useState<Photo[]>([])
  const [sending, setSending] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const previews = useRef<string[]>([])
  const router = useRouter()

  useEffect(() => () => { for (const u of previews.current) URL.revokeObjectURL(u) }, [])

  const patch = (key: string, p: Partial<Photo>) => setPhotos((list) => list.map((x) => (x.key === key ? { ...x, ...p } : x)))

  async function addFiles(files: FileList | null) {
    if (!files?.length) return
    const room = MAX_PHOTOS - photos.length
    const chosen = Array.from(files).slice(0, Math.max(room, 0))
    if (files.length > room) toast.message(`You can add up to ${MAX_PHOTOS} photos`)
    for (const file of chosen) {
      const key = crypto.randomUUID()
      try {
        const c = await compressImage(file)
        previews.current.push(c.previewUrl)
        setPhotos((list) => [...list, { key, preview: c.previewUrl, url: null, progress: 0, failed: false }])
        uploadImage(c.blob, 'review', (p) => patch(key, { progress: p }))
          .then((r) => patch(key, { url: r.url, progress: 1 }))
          .catch((e: Error) => { patch(key, { failed: true }); toast.error(e.message) })
      } catch (e) {
        toast.error((e as Error).message || 'Use a JPEG, PNG or WebP photo')
      }
    }
  }

  const uploading = photos.some((p) => !p.url && !p.failed)

  async function submit() {
    if (!dest || !exp) { toast.error('Rate both the destination and the experience'); return }
    if (uploading) { toast.message('Wait for the photos to finish uploading'); return }
    setSending(true)
    const r = await v1<{ id: string }>('/reviews', {
      body: {
        bookingId,
        ratingDestination: dest,
        ratingExperience: exp,
        title: title.trim() || undefined,
        body: body.trim() || undefined,
        photos: photos.filter((p) => p.url).map((p) => p.url as string),
      },
    })
    setSending(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('Thanks for your review')
    router.push(`/packages/${encodeURIComponent(tripSlug)}#reviews`)
  }

  return (
    <form className="pc-card space-y-5 p-5" onSubmit={(e) => { e.preventDefault(); void submit() }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Stars id="rate-dest" label="The destination" value={dest} onChange={setDest} />
        <Stars id="rate-exp" label="Your experience with UnSOLO" value={exp} onChange={setExp} />
      </div>
      <div className="space-y-1">
        <label htmlFor="review-title" className="text-sm font-medium text-foreground">Title</label>
        <Input id="review-title" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 120))} placeholder="Sum it up in a line" />
      </div>
      <div className="space-y-1">
        <label htmlFor="review-body" className="text-sm font-medium text-foreground">Your review</label>
        <Textarea id="review-body" value={body} onChange={(e) => setBody(e.target.value.slice(0, 3000))} rows={5} placeholder="What did you love? What should the next group know?" className="resize-y" />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Photos <span className="font-normal text-muted-foreground">(up to {MAX_PHOTOS})</span></p>
        <div className="flex flex-wrap gap-2">
          {photos.map((p) => (
            <div key={p.key} className="relative h-20 w-20 overflow-hidden rounded-lg bg-secondary">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.preview} alt="" className={`h-full w-full object-cover ${p.url ? '' : 'opacity-60'}`} />
              {!p.url && !p.failed ? (
                <span className="absolute inset-x-0 bottom-0 bg-black/60 text-center text-[11px] font-semibold text-white">{Math.round(p.progress * 100)}%</span>
              ) : null}
              {p.failed ? <span className="absolute inset-x-0 bottom-0 bg-red-600 text-center text-[11px] font-semibold text-white">Failed</span> : null}
              <button
                type="button"
                onClick={() => setPhotos((list) => list.filter((x) => x.key !== p.key))}
                aria-label="Remove photo"
                className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS ? (
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:border-primary hover:text-foreground"
            >
              <ImagePlus className="h-5 w-5" aria-hidden />Add
            </button>
          ) : null}
        </div>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple hidden onChange={(e) => { void addFiles(e.target.files); e.target.value = '' }} />
      </div>
      <button type="submit" disabled={sending || !dest || !exp} className="pc-btn w-full disabled:opacity-60 sm:w-auto">
        {sending ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Sending…</> : uploading ? 'Uploading photos…' : 'Post review'}
      </button>
    </form>
  )
}
