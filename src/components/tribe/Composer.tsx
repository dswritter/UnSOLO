'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BadgeCheck, Camera, CirclePlus, Loader2, MapPin, Minus, Plus, Venus, X } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch, ApiClientError, newClientId } from '@/lib/api/client'
import { compressImage, uploadImage } from '@/lib/images/compressImage'
import { enqueue, isNetworkError } from '@/lib/tribe/outbox'
import { track } from '@/lib/analytics/client'
import type { Media, Post, UserLite } from '@/lib/tribe/models'
import { cn } from '@/lib/utils'
import { SeatRing, type RingSeg } from './SeatRing'
import { KindTiles, type ComposeKind } from './ComposeSheet'
import { Sheet } from './Sheet'
import { dateRange, initials, nights } from './format'

type Kind = 'plan' | 'story' | 'ask'
type Photo = { key: string; preview: string; progress: number; media?: Media & { bytes?: number }; error?: string }

export function Composer({ initialKind, initialPoll = false, me, pastTrips }: {
  initialKind: Kind | null
  /** /tribe/new?kind=ask&poll=1 — opens the ask composer with two poll options ready. */
  initialPoll?: boolean
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
  const [poll, setPoll] = useState<string[]>(initialKind === 'ask' && initialPoll ? ['', ''] : [])
  const [photos, setPhotos] = useState<Photo[]>([])
  const [busy, setBusy] = useState(false)
  const [moneyPrompt, setMoneyPrompt] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => { track('screen.view', { kind }, 'compose') }, [kind])

  function pick(k: ComposeKind) {
    if (k === 'poll') { setKind('ask'); setPoll((p) => (p.length ? p : ['', ''])) }
    else setKind(k)
  }
  function close() {
    if (window.history.length > 1) router.back()
    else router.push('/tribe')
  }

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
          const media = await uploadImage(c.blob, 'post', (pr) =>
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
  const hint =
    kind === 'plan' ? (place.trim().length < 2 ? 'Add where you’re going' : !startsOn ? 'Pick a start date' : endsOn && endsOn < startsOn ? 'End date is before the start' : null)
    : kind === 'ask' ? (body.trim().length < 10 ? 'Write your question (10+ characters)' : poll.length && !poll.every((o) => o.trim()) ? 'Fill in every option' : null)
    : kind === 'story' ? (!body.trim() && !photos.some((p) => p.media) ? 'Add a photo or a few words' : null)
    : null

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

  // Step 1: what are you sharing? (sheet-like, actions at the bottom on phones)
  if (!kind) {
    return (
      <div className="flex min-h-[calc(100dvh-var(--pc-top-bar))] w-full flex-col justify-end md:justify-center md:py-10">
        <div className="fc-sheet mx-auto w-full md:max-w-[560px]">
          <div className="pc-sheet-grab" aria-hidden />
          <h1 className="fc-sheet-title mt-2">What are you sharing?</h1>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">Everything goes to Tribe. Plans are for finding people, not for selling trips.</p>
          <KindTiles onPick={pick} />
          <p className="mt-4 text-sm text-muted-foreground">Selling a trip, stay or activity? <Link href="/host" className="pc-link">List it on Hosting</Link> so people can book and pay safely.</p>
          <button type="button" className="pc-btn pc-btn-quiet pc-btn-block mt-4" onClick={close}>Cancel</button>
        </div>
      </div>
    )
  }

  const heading = kind === 'plan' ? 'New plan' : kind === 'story' ? 'New story' : poll.length ? 'New poll' : 'New question'
  const looking = spots - 1
  const previewSegs: RingSeg[] = [{ state: 'taken', user: me }, ...Array.from({ length: looking }, () => ({ state: 'open' as const }))]
  const women = audience === 'women'
  const n = nights(startsOn || null, endsOn || null)
  const preview = (size: number) => (
    <div className="grid place-items-center">
      <SeatRing segs={previewSegs} size={size} variant="plan" women={women} photo={me.avatarUrl} showDots={false}
        center={me.avatarUrl ? undefined : { big: initials(me.name), fontSize: size * 0.24 }} label={`Preview: you plus ${looking} open spots`} />
      <p className="fc-caption mt-2 text-center text-[13px]">Live preview · <strong>you + {looking} {looking === 1 ? 'spot' : 'spots'}</strong></p>
    </div>
  )

  return (
    <div className="mx-auto w-full max-w-[1100px] lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10 lg:px-8 lg:pt-6">
      <form className="min-w-0" onSubmit={(e) => { e.preventDefault(); void publish() }}>
        {/* Top bar: close + title. Publish lives in the bottom bar (thumb reach). */}
        <div className="sticky top-0 z-30 flex items-center gap-2 bg-[color:var(--pc-paper)]/90 px-2 py-2 backdrop-blur lg:static lg:bg-transparent lg:px-0 lg:backdrop-blur-none">
          <button type="button" className="pc-iconbtn" aria-label="Close" onClick={close}><X className="h-5 w-5" /></button>
          <h1 className="flex-1 text-center text-[17px] font-bold lg:text-left lg:text-[28px]">{heading}</h1>
          <button type="button" className="pc-chip min-h-9 px-3 text-[13px]" onClick={() => setKind(null)}>Change</button>
        </div>

        <div className="space-y-3 px-4 pt-2 lg:px-0">
          {kind === 'plan' && <div className="py-2 lg:hidden">{preview(132)}</div>}
          {kind === 'plan' && <p className="pc-kicker">Community plan · not a booking. No money is collected through UnSOLO for plans.</p>}

          {kind === 'ask' && (
            <Field label={poll.length ? 'Question' : 'Your question'}>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} rows={3}
                placeholder={poll.length ? 'Pickup point for the 27 Nov Bir trip?' : 'First solo trek in December — Kedarkantha or Brahmatal?'} />
              <Count n={body.length} />
            </Field>
          )}

          {(kind === 'plan' || kind === 'ask' || kind === 'story') && (
            <Field label={kind === 'plan' ? 'Where to?' : kind === 'story' ? 'Where was this? (optional)' : 'Place (optional)'} icon={MapPin}>
              <input value={place} onChange={(e) => setPlace(e.target.value)} maxLength={120} placeholder={kind === 'story' ? 'Kheerganga' : 'Spiti, Himachal'} required={kind === 'plan'} />
            </Field>
          )}

          {kind === 'plan' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="From"><input type="date" min={today} value={startsOn} onChange={(e) => setStartsOn(e.target.value)} required /></Field>
              <Field label={n ? `To · ${n} ${n === 1 ? 'night' : 'nights'}` : 'To'}><input type="date" min={startsOn || today} value={endsOn} onChange={(e) => setEndsOn(e.target.value)} /></Field>
            </div>
          )}

          {kind === 'plan' && (
            <div className="fc-field fc-field-row">
              <div>
                <span className="fc-field-label">People you’re looking for</span>
                <span className="mt-0.5 block text-[16px] font-semibold">{looking} more <span className="text-[13px] font-medium text-muted-foreground">· group of {spots}</span></span>
              </div>
              <div className="fc-stepper">
                <button type="button" onClick={() => setSpots(Math.max(2, spots - 1))} disabled={spots <= 2} aria-label="Fewer people"><Minus className="h-4 w-4" /></button>
                <b aria-live="polite">{looking}</b>
                <button type="button" onClick={() => setSpots(Math.min(30, spots + 1))} disabled={spots >= 30} aria-label="More people"><Plus className="h-4 w-4" /></button>
              </div>
            </div>
          )}

          {kind !== 'ask' && (
            <Field label={kind === 'plan' ? 'Title' : 'Title (optional)'}>
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={kind === 'plan' ? 'Spiti in January — 3 spots' : 'Kheerganga, finally'} />
            </Field>
          )}

          {kind !== 'ask' && (
            <Field label={kind === 'plan' ? 'What’s the plan?' : 'Tell the story'}>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} rows={kind === 'plan' ? 4 : 6}
                placeholder={kind === 'plan' ? 'Slow road trip, homestays, flexible on dates…' : 'What it was like, tips for the next person…'} />
              <Count n={body.length} />
            </Field>
          )}

          {kind === 'plan' && (
            <>
              <Field label="Budget each (optional)">
                <input value={cost} onChange={(e) => setCost(e.target.value)} maxLength={120} placeholder="~₹14,000 each, split among ourselves" />
              </Field>
              <ToggleField name="Women only" label={<span className="inline-flex items-center gap-1 text-[color:var(--pc-rose)]"><Venus className="h-3.5 w-3.5" aria-hidden />Women only</span>}
                hint="Only ID-verified women can join" rose on={audience === 'women'} onChange={(v) => setAudience(v ? 'women' : 'anyone')} />
              <ToggleField name="Verified travellers only" label={<span className="inline-flex items-center gap-1"><BadgeCheck className="h-3.5 w-3.5 text-[color:var(--pc-pine)]" aria-hidden />Verified travellers only</span>}
                hint="People with a verified ID" on={audience === 'verified'} onChange={(v) => setAudience(v ? 'verified' : 'anyone')} />
              {(audience !== 'anyone' || spots >= 5) && <p className="px-1 text-xs text-muted-foreground">Women-only plans and plans of 5 or more need a verified ID, so joiners know who they’re meeting.</p>}
              <Field label="Meeting point (only approved people see this)">
                <input value={meeting} onChange={(e) => setMeeting(e.target.value)} maxLength={300} placeholder="ISBT Kashmere Gate, 6 am" />
              </Field>
            </>
          )}

          {kind === 'story' && pastTrips.length > 0 && (
            <Field label="Which UnSOLO trip? (optional)">
              <select value={tripId} onChange={(e) => setTripId(e.target.value)}>
                <option value="">Not an UnSOLO trip</option>
                {pastTrips.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </Field>
          )}
          {kind === 'story' && tripId && (
            <ToggleField name="Show on the trip page" label="Show on the trip page" hint="As “From people who went” (+20 pts)" on={showOnTrip} onChange={setShowOnTrip} />
          )}

          {kind === 'ask' && (
            poll.length > 0 ? (
              <div className="space-y-2">
                <p className="px-1 text-[12px] font-bold text-[color:var(--pc-ink2)]">Options</p>
                {poll.map((o, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <label className="fc-field flex-1 py-2">
                      <span className="sr-only">Option {i + 1}</span>
                      <input value={o} onChange={(e) => setPoll(poll.map((x, j) => (j === i ? e.target.value : x)))} maxLength={80} placeholder={i < 2 ? `Option ${i + 1}` : `Option ${i + 1} (optional)`} />
                    </label>
                    {poll.length > 2 && <button type="button" className="pc-iconbtn" aria-label={`Remove option ${i + 1}`} onClick={() => setPoll(poll.filter((_, j) => j !== i))}><X className="h-4 w-4" /></button>}
                  </div>
                ))}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {poll.length < 4 && <button type="button" className="pc-btn pc-btn-quiet pc-btn-sm" onClick={() => setPoll([...poll, ''])}><CirclePlus className="h-4 w-4" aria-hidden />Add option</button>}
                  <button type="button" className="pc-link text-sm" onClick={() => setPoll([])}>Remove poll</button>
                </div>
                <p className="px-1 text-xs text-muted-foreground">Up to 4 options. Everyone sees the results after voting.</p>
              </div>
            ) : (
              <button type="button" className="pc-btn pc-btn-quiet pc-btn-sm" onClick={() => setPoll(['', ''])}><CirclePlus className="h-4 w-4" aria-hidden />Add a poll</button>
            )
          )}

          {kind !== 'ask' && (
            <div>
              <p className="mb-1.5 px-1 text-[12px] font-bold text-[color:var(--pc-ink2)]">Photos (up to 6)</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {photos.map((p) => (
                  <div key={p.key} className="relative aspect-square overflow-hidden rounded-[16px] bg-[color:var(--pc-tonal)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.preview} alt="" className="h-full w-full object-cover" />
                    {!p.media && !p.error && <span className="absolute inset-0 grid place-items-center bg-black/35 text-white"><span className="text-xs font-bold tabular-nums">{Math.round(p.progress * 100)}%</span></span>}
                    {p.error && <span className="absolute inset-x-0 bottom-0 bg-destructive p-1 text-[11px] text-white">{p.error}</span>}
                    <button type="button" aria-label="Remove photo" className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white" onClick={() => setPhotos(photos.filter((x) => x.key !== p.key))}><X className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
                {photos.length < 6 && (
                  <button type="button" onClick={() => fileRef.current?.click()} className="grid aspect-square place-items-center rounded-[16px] border-[1.5px] border-dashed border-[color:var(--pc-rule2)] text-[color:var(--pc-pine)] transition-colors hover:bg-[color:var(--pc-pine-soft)]">
                    <Camera className="h-6 w-6" aria-hidden /><span className="sr-only">Add photos</span>
                  </button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { void addPhotos(e.target.files); e.target.value = '' }} />
              <p className="mt-1.5 px-1 text-xs text-muted-foreground">Photos are compressed on your device before upload. Location data is removed.</p>
            </div>
          )}
        </div>

        <div className="fc-bar-spacer is-column" aria-hidden />
        <div className="fc-bar is-column">
          <div className="fc-bar-inner">
            <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground" aria-live="polite">
              {busy ? 'Publishing…' : uploading ? 'Uploading photos…' : hint ?? (kind === 'plan' ? `${place.trim()}${startsOn ? ` · ${dateRange(startsOn, endsOn || null)}` : ''}` : 'Ready to post')}
            </span>
            <button type="submit" className="pc-btn" disabled={!valid || busy || uploading}>
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Publishing</> : 'Publish'}
            </button>
          </div>
        </div>
      </form>

      {kind === 'plan' && (
        <aside className="hidden lg:block lg:sticky lg:top-6 lg:self-start" aria-label="Preview">
          <div className="pc-pencilled p-6">
            <p className="pc-eyebrow mb-4">Preview</p>
            {preview(200)}
            <h2 className="mt-4 text-center text-[20px] leading-tight">{title || place || 'Your plan'}</h2>
            <p className="mt-1 text-center text-sm text-muted-foreground">{place || 'Somewhere'} · {startsOn ? dateRange(startsOn, endsOn || null) : 'Dates'}</p>
            {cost && <p className="mt-1 text-center text-sm text-muted-foreground">{cost}</p>}
            {women && <p className="mt-3 flex justify-center"><span className="pc-tag pc-tag-women"><Venus className="h-3 w-3" aria-hidden />Women only</span></p>}
          </div>
        </aside>
      )}

      <Sheet open={moneyPrompt} onClose={() => setMoneyPrompt(false)} title="Charging for this?"
        description="Prices per person, advances and payment IDs belong in a hosted trip, where people book and pay safely through UnSOLO.">
        <div className="fc-sheet-actions">
          <Link href="/host/create" className="pc-btn pc-btn-block">List it as a hosted trip</Link>
          <button type="button" className="pc-btn pc-btn-quiet pc-btn-block" onClick={() => { setMoneyPrompt(false); void publish(true) }}>It’s just a cost split — post anyway</button>
          <button type="button" className="pc-link mt-1 min-h-11 text-sm" onClick={() => setMoneyPrompt(false)}>Edit post</button>
        </div>
      </Sheet>
    </div>
  )
}

function Field({ label, icon: Icon, children }: { label: string; icon?: typeof MapPin; children: React.ReactNode }) {
  return (
    <label className="fc-field">
      <span className="fc-field-label">{Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}{label}</span>
      {children}
    </label>
  )
}

function Count({ n }: { n: number }) {
  return <span className="mt-0.5 block text-right text-[11px] tabular-nums text-[color:var(--pc-ink3)]">{n}/4000</span>
}

function ToggleField({ name, label, hint, on, onChange, rose }: { name: string; label: React.ReactNode; hint: string; on: boolean; onChange: (v: boolean) => void; rose?: boolean }) {
  return (
    <div className="fc-field fc-field-row">
      <div className="min-w-0">
        <span className="fc-field-label">{label}</span>
        <span className="mt-0.5 block text-[13.5px] text-muted-foreground">{hint}</span>
      </div>
      <button type="button" role="switch" aria-checked={on} aria-label={name} className={cn('fc-switch', rose && 'is-rose')} onClick={() => onChange(!on)} />
    </div>
  )
}
