'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Camera, CalendarDays, HelpCircle, Loader2, MapPin, PenLine, X } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch, ApiClientError, newClientId } from '@/lib/api/client'
import { compressImage, uploadImage } from '@/lib/images/compressImage'
import { enqueue, isNetworkError } from '@/lib/tribe/outbox'
import { track } from '@/lib/analytics/client'
import type { Media, Post, Seat, UserLite } from '@/lib/tribe/models'
import { cn } from '@/lib/utils'
import { SeatRow } from './SeatRow'
import { dateRange } from './format'

type Kind = 'plan' | 'story' | 'ask'
type Photo = { key: string; preview: string; progress: number; media?: Media & { bytes?: number }; error?: string }

const TYPES: { id: Kind; title: string; body: string; icon: typeof PenLine }[] = [
  { id: 'plan', title: 'Plan', body: 'A trip or meetup you want company for. People ask to join; you decide.', icon: CalendarDays },
  { id: 'story', title: 'Story', body: 'A trip you took. Photos, tips, the people you went with.', icon: PenLine },
  { id: 'ask', title: 'Ask', body: 'A question for people who have been there. Add a poll if you like.', icon: HelpCircle },
]

export function Composer({ initialKind, me, pastTrips }: {
  initialKind: Kind | null
  me: UserLite
  pastTrips: { id: string; title: string }[]
}) {
  const router = useRouter()
  const [kind, setKind] = useState<Kind | null>(initialKind)
  const clientId = useMemo(() => newClientId(), [])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [place, setPlace] = useState('')
  const [startsOn, setStartsOn] = useState('')
  const [endsOn, setEndsOn] = useState('')
  const [spots, setSpots] = useState(4)
  const [audience, setAudience] = useState<'anyone' | 'women' | 'verified'>('anyone')
  const [cost, setCost] = useState('')
  const [meeting, setMeeting] = useState('')
  const [tripId, setTripId] = useState('')
  const [showOnTrip, setShowOnTrip] = useState(true)
  const [poll, setPoll] = useState<string[]>([])
  const [photos, setPhotos] = useState<Photo[]>([])
  const [busy, setBusy] = useState(false)
  const [moneyPrompt, setMoneyPrompt] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => { track('screen.view', { kind }, 'compose') }, [kind])

  /** Photos compress (≤2 MB) and upload in the background while the user keeps typing. */
  async function addPhotos(files: FileList | null) {
    if (!files) return
    const list = Array.from(files).slice(0, 6 - photos.length)
    for (const file of list) {
      const key = crypto.randomUUID()
      setPhotos((p) => [...p, { key, preview: URL.createObjectURL(file), progress: 0 }])
      void (async () => {
        try {
          const c = await compressImage(file)
          setPhotos((p) => p.map((x) => (x.key === key ? { ...x, preview: c.previewUrl } : x)))
          const media = await uploadImage(c.blob, kind === 'story' ? 'post' : 'post', (pr) =>
            setPhotos((p) => p.map((x) => (x.key === key ? { ...x, progress: pr } : x))))
          setPhotos((p) => p.map((x) => (x.key === key ? { ...x, progress: 1, media } : x)))
        } catch (e) {
          setPhotos((p) => p.map((x) => (x.key === key ? { ...x, error: (e as Error).message } : x)))
        }
      })()
    }
  }

  const uploading = photos.some((p) => !p.media && !p.error)
  const valid =
    kind === 'plan' ? place.trim().length >= 2 && !!startsOn && spots >= 2 && (!endsOn || endsOn >= startsOn)
    : kind === 'ask' ? body.trim().length >= 10 && (poll.length === 0 || (poll.length >= 2 && poll.every((o) => o.trim())))
    : kind === 'story' ? body.trim().length > 0 || photos.some((p) => p.media)
    : false

  function payload(confirmNonCommercial: boolean) {
    return {
      clientId, kind, title: title.trim() || null, body: body.trim(),
      place: place.trim() ? { name: place.trim() } : null,
      startsOn: kind === 'plan' ? startsOn : null, endsOn: kind === 'plan' && endsOn ? endsOn : null,
      spotsTotal: kind === 'plan' ? spots : null, audience: kind === 'plan' ? audience : 'anyone',
      estCostText: kind === 'plan' ? cost.trim() || null : null, meetingPoint: kind === 'plan' ? meeting.trim() || null : null,
      tripPackageId: kind === 'story' && tripId ? tripId : null, showOnTripPage: kind === 'story' && !!tripId && showOnTrip,
      poll: kind === 'ask' && poll.length >= 2 ? poll.map((o) => o.trim()) : null,
      media: photos.filter((p) => p.media).map((p) => p.media!),
      confirmNonCommercial,
    }
  }

  async function publish(confirmNonCommercial = false) {
    if (!kind || !valid || busy) return
    setBusy(true)
    try {
      if (!confirmNonCommercial) {
        const s = await apiFetch<{ prompts: string[] }>('/moderation/screen', { body: { text: `${title}\n${body}` } })
        if (s.prompts.includes('money')) { setMoneyPrompt(true); setBusy(false); return }
      }
      const r = await apiFetch<{ post: Post; moderation: { state: string; prompts: string[] } }>('/posts', { body: payload(confirmNonCommercial) })
      track('post.create', { kind, held: r.moderation.state === 'held' })
      if (r.moderation.state === 'held') toast.message('Posted for a quick review. It goes live once our team has a look (usually within 2 hours).')
      else if (r.moderation.prompts.includes('contact_hidden')) toast.message('Posted. We hid phone numbers and payment IDs — people can message you on UnSOLO instead.')
      else toast.success('Posted')
      router.replace(`/tribe/p/${r.post.id}`)
    } catch (e) {
      if (isNetworkError(e)) {
        enqueue('/posts', payload(confirmNonCommercial), clientId)
        toast.message('You’re offline. We saved your post and will publish it when you’re back online.')
        router.replace('/tribe')
        return
      }
      if (e instanceof ApiClientError && e.code === 'phone_required') {
        toast.error('Verify your phone number to post')
        router.push('/settings#phone')
      } else toast.error((e as Error).message)
      setBusy(false)
    }
  }

  if (!kind) {
    return (
      <div className="mx-auto max-w-xl px-4 pb-24 pt-6">
        <h1 className="text-[28px]">What are you posting?</h1>
        <ul className="mt-5 space-y-3">
          {TYPES.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => setKind(t.id)} className={cn('flex w-full items-start gap-4 p-4 text-left', t.id === 'plan' ? 'pc-pencilled' : 'pc-surface')}>
                <t.icon className="mt-0.5 h-6 w-6 shrink-0" aria-hidden />
                <span><span className="block text-lg font-semibold">{t.title}</span><span className="block text-sm text-muted-foreground">{t.body}</span></span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-muted-foreground">Selling a trip, stay or activity? <Link href="/host" className="pc-link">List it on Hosting</Link> so people can book and pay safely.</p>
      </div>
    )
  }

  const previewSeats: Seat[] = [{ state: 'organiser', user: me }, ...Array.from({ length: Math.max(spots - 1, 0) }, () => ({ state: 'open' as const, user: null }))]

  return (
    <div className="mx-auto grid max-w-[1100px] grid-cols-1 gap-8 px-4 pb-32 pt-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:pt-8">
      <form className="min-w-0 space-y-5" onSubmit={(e) => { e.preventDefault(); void publish() }}>
        <div className="flex items-center justify-between">
          <h1 className="text-[28px]">New {kind}</h1>
          <button type="button" className="pc-link text-sm" onClick={() => setKind(null)}>Change type</button>
        </div>

        {kind === 'plan' && <p className="pc-kicker">Community plan · not a booking. No money is collected through UnSOLO for plans.</p>}

        {(kind === 'plan' || kind === 'ask') && (
          <Field label={kind === 'plan' ? 'Where to?' : 'Place (optional)'} icon={MapPin}>
            <input value={place} onChange={(e) => setPlace(e.target.value)} maxLength={120} placeholder="Spiti, Himachal" className="pc-input" required={kind === 'plan'} />
          </Field>
        )}

        {kind === 'plan' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="From"><input type="date" min={today} value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className="pc-input" required /></Field>
            <Field label="To"><input type="date" min={startsOn || today} value={endsOn} onChange={(e) => setEndsOn(e.target.value)} className="pc-input" /></Field>
          </div>
        )}

        {kind !== 'ask' && (
          <Field label={kind === 'plan' ? 'Title' : 'Title (optional)'}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={kind === 'plan' ? 'Spiti in January — 3 spots' : 'Kheerganga, finally'} className="pc-input" />
          </Field>
        )}

        <Field label={kind === 'ask' ? 'Your question' : kind === 'plan' ? 'What’s the plan?' : 'Tell the story'}>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} rows={kind === 'ask' ? 3 : 6} className="pc-input py-3"
            placeholder={kind === 'ask' ? 'First solo trek in December — Kedarkantha or Brahmatal?' : kind === 'plan' ? 'Slow road trip, homestays, flexible on dates…' : 'What it was like, tips for the next person…'} />
          <span className="pc-mono mt-1 block text-right text-xs text-muted-foreground">{body.length}/4000</span>
        </Field>

        {kind === 'plan' && (
          <>
            <Field label="Group size (including you)">
              <div className="flex items-center gap-3">
                <button type="button" className="pc-btn pc-btn-quiet w-11 px-0" onClick={() => setSpots(Math.max(2, spots - 1))} aria-label="Fewer">−</button>
                <span className="pc-mono w-8 text-center text-lg font-semibold" aria-live="polite">{spots}</span>
                <button type="button" className="pc-btn pc-btn-quiet w-11 px-0" onClick={() => setSpots(Math.min(30, spots + 1))} aria-label="More">+</button>
                <span className="text-sm text-muted-foreground">{spots - 1} open {spots - 1 === 1 ? 'spot' : 'spots'}</span>
              </div>
            </Field>
            <Field label="Who can join">
              <div className="flex flex-wrap gap-2" role="radiogroup">
                {([['anyone', 'Anyone'], ['women', 'Women only'], ['verified', 'Verified only']] as const).map(([id, label]) => (
                  <button key={id} type="button" role="radio" aria-checked={audience === id} className="pc-chip" onClick={() => setAudience(id)}>{label}</button>
                ))}
              </div>
              {(audience !== 'anyone' || spots >= 5) && <p className="mt-2 text-xs text-muted-foreground">Women-only plans and plans of 5 or more need a verified ID — so joiners know who they&apos;re meeting.</p>}
            </Field>
            <Field label="Rough cost (optional)">
              <input value={cost} onChange={(e) => setCost(e.target.value)} maxLength={120} placeholder="Est. ₹14,000 each, split among ourselves" className="pc-input" />
            </Field>
            <Field label="Meeting point (only approved people see this)">
              <input value={meeting} onChange={(e) => setMeeting(e.target.value)} maxLength={300} placeholder="ISBT Kashmere Gate, 6 am" className="pc-input" />
            </Field>
          </>
        )}

        {kind === 'story' && pastTrips.length > 0 && (
          <Field label="Which UnSOLO trip? (optional)">
            <select value={tripId} onChange={(e) => setTripId(e.target.value)} className="pc-input">
              <option value="">Not an UnSOLO trip</option>
              {pastTrips.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
            {tripId && (
              <label className="mt-2 flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" checked={showOnTrip} onChange={(e) => setShowOnTrip(e.target.checked)} /> Show on the trip page as “From people who went” (+20 pts)
              </label>
            )}
          </Field>
        )}

        {kind === 'ask' && (
          <Field label="Poll (optional)">
            <div className="space-y-2">
              {poll.map((o, i) => (
                <div key={i} className="flex gap-2">
                  <input value={o} onChange={(e) => setPoll(poll.map((x, j) => (j === i ? e.target.value : x)))} maxLength={80} placeholder={`Option ${i + 1}`} className="pc-input" />
                  <button type="button" className="pc-iconbtn" aria-label="Remove option" onClick={() => setPoll(poll.filter((_, j) => j !== i))}><X className="h-4 w-4" /></button>
                </div>
              ))}
              {poll.length < 4 && <button type="button" className="pc-btn pc-btn-quiet pc-btn-sm" onClick={() => setPoll(poll.length ? [...poll, ''] : ['', ''])}>{poll.length ? 'Add option' : 'Add a poll'}</button>}
            </div>
          </Field>
        )}

        {kind !== 'ask' && (
          <Field label="Photos (up to 6)">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {photos.map((p) => (
                <div key={p.key} className="relative aspect-square overflow-hidden rounded-md border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.preview} alt="" className="h-full w-full object-cover" />
                  {!p.media && !p.error && <span className="absolute inset-0 grid place-items-center bg-black/35 text-white"><span className="pc-mono text-xs">{Math.round(p.progress * 100)}%</span></span>}
                  {p.error && <span className="absolute inset-x-0 bottom-0 bg-destructive p-1 text-[11px] text-white">{p.error}</span>}
                  <button type="button" aria-label="Remove photo" className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white" onClick={() => setPhotos(photos.filter((x) => x.key !== p.key))}><X className="h-3.5 w-3.5" /></button>
                </div>
              ))}
              {photos.length < 6 && (
                <button type="button" onClick={() => fileRef.current?.click()} className="grid aspect-square place-items-center rounded-md border-[1.5px] border-dashed border-[color:var(--pc-rule2)] text-muted-foreground">
                  <Camera className="h-6 w-6" aria-hidden /><span className="sr-only">Add photos</span>
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { void addPhotos(e.target.files); e.target.value = '' }} />
            <p className="mt-1 text-xs text-muted-foreground">Photos are compressed on your device before upload. Location data is removed.</p>
          </Field>
        )}

        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-foreground bg-background p-3 lg:static lg:border-0 lg:p-0">
          <button type="submit" className="pc-btn pc-btn-block" disabled={!valid || busy || uploading}>
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Publishing…</> : uploading ? 'Uploading photos…' : `Publish ${kind}`}
          </button>
        </div>
      </form>

      {kind === 'plan' && (
        <aside className="lg:sticky lg:top-24 lg:self-start" aria-label="Preview">
          <p className="mb-2 text-sm text-muted-foreground">Preview</p>
          <div className="pc-pencilled p-4">
            <p className="pc-kicker">Community plan · not a booking</p>
            <h2 className="mt-2 text-xl">{title || place || 'Your plan'}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{place || 'Somewhere'} · {startsOn ? dateRange(startsOn, endsOn || null) : 'Dates'}</p>
            <SeatRow seats={previewSeats} size="sm" className="mt-3" />
            {cost && <p className="mt-2 text-sm text-muted-foreground">{cost}</p>}
          </div>
        </aside>
      )}

      {moneyPrompt && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 md:items-center" role="dialog" aria-modal="true" aria-label="Charging for this?">
          <div className="w-full max-w-md rounded-t-lg border border-foreground bg-background p-5 md:rounded-md">
            <h2 className="text-xl">Charging for this?</h2>
            <p className="mt-2 text-sm text-muted-foreground">Prices per person, advances and payment IDs belong in a hosted trip, where people book and pay safely through UnSOLO.</p>
            <div className="mt-4 flex flex-col gap-2">
              <Link href="/host/create" className="pc-btn">List it as a hosted trip</Link>
              <button type="button" className="pc-btn pc-btn-quiet" onClick={() => { setMoneyPrompt(false); void publish(true) }}>It&apos;s just a cost split — post anyway</button>
              <button type="button" className="pc-link mt-1 text-sm" onClick={() => setMoneyPrompt(false)}>Edit post</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, icon: Icon, children }: { label: string; icon?: typeof MapPin; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">{Icon && <Icon className="h-4 w-4" aria-hidden />}{label}</span>
      {children}
    </label>
  )
}
