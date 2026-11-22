'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle, Loader2, MessageCircle, MessageSquare, Phone, ShieldCheck, X } from 'lucide-react'
import { toast } from 'sonner'
import { Textarea } from '@/components/ui/textarea'
import { telHref, v1, waDigits } from '@/lib/api/v1-client'

type SosStatus = {
  onTrip: boolean
  trips: { bookingId: string; title: string; slug: string; start: string; end: string }[]
  emergencyContact: { name: string | null; phone: string } | null
  supportWhatsapp: string | null
}
type SosResult = {
  id: string
  notified: Record<string, string>
  trip: { title: string; slug: string } | null
  host: { name: string; phone: string | null } | null
  emergencyContact: { name: string | null; phone: string } | null
  supportWhatsapp: string | null
  message: string
}
type Fix = { lat: number; lng: number; accuracy: number }

/** One position, or null when location is off, denied or slow. SOS works without it. */
function locate(timeoutMs = 8000): Promise<Fix | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null)
  return new Promise((resolve) => {
    const done = (v: Fix | null) => { clearTimeout(t); resolve(v) }
    const t = setTimeout(() => resolve(null), timeoutMs + 500)
    navigator.geolocation.getCurrentPosition(
      (p) => done({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }),
      () => done(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    )
  })
}

function notifiedLines(n: Record<string, string>, r: SosResult): string[] {
  const out: string[] = []
  if (n.team) out.push(`UnSOLO team: ${n.team}`)
  if (n.email === 'sent') out.push('Our safety inbox has your alert')
  if (n.host) out.push(`${r.host?.name ?? 'Your host'} was notified in the app`)
  if (n.hostSms === 'sent') out.push('Your host got a text')
  if (n.emergencySms === 'sent') out.push(`${r.emergencyContact?.name || 'Your emergency contact'} got a text`)
  if (r.emergencyContact && n.emergencySms !== 'sent') out.push(`Text ${r.emergencyContact.name || 'your emergency contact'} yourself with the button below`)
  if (!r.emergencyContact) out.push('No emergency contact saved. You can add one in Edit profile')
  return out
}

/**
 * Red SOS button, shown only on trip days (GET /api/v1/sos says onTrip). Confirm with an optional
 * note, then POST /sos with the location when the browser allows it. While the dialog stays open
 * the location is re-sent every 60 seconds.
 */
export function SosButton({ className }: { className?: string }) {
  const [status, setStatus] = useState<SosStatus | null>(null)
  const [openFor, setOpenFor] = useState<SosStatus['trips'][number] | null>(null)

  useEffect(() => {
    let live = true
    void v1<SosStatus>('/sos').then((r) => { if (live && r.ok) setStatus(r.data) })
    return () => { live = false }
  }, [])

  if (!status?.onTrip || !status.trips.length) return null

  return (
    <div className={className}>
      <div className="flex flex-col gap-2 rounded-2xl border border-red-500/40 bg-red-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">You’re on a trip today</p>
          <p className="text-xs text-muted-foreground">If you need help, SOS tells the UnSOLO team, your host and your emergency contact.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {status.trips.map((t) => (
            <button
              key={t.bookingId}
              type="button"
              onClick={() => setOpenFor(t)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-red-600 px-5 text-sm font-black tracking-wide text-white shadow-sm hover:bg-red-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-red-500/40"
              aria-label={`SOS on ${t.title}`}
            >
              <AlertTriangle className="h-4 w-4" aria-hidden />
              SOS{status.trips.length > 1 ? ` · ${t.title}` : ''}
            </button>
          ))}
        </div>
      </div>
      {openFor ? <SosDialog trip={openFor} status={status} onClose={() => setOpenFor(null)} /> : null}
    </div>
  )
}

function SosDialog({ trip, status, onClose }: { trip: SosStatus['trips'][number]; status: SosStatus; onClose: () => void }) {
  const [note, setNote] = useState('')
  const [phase, setPhase] = useState<'confirm' | 'sending' | 'sent' | 'safe'>('confirm')
  const [result, setResult] = useState<SosResult | null>(null)
  const [hadLocation, setHadLocation] = useState<boolean | null>(null)
  const [closing, setClosing] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  // Keep sending the location every 60s while the alert is open and this dialog is on screen.
  useEffect(() => {
    if (phase !== 'sent' || !result?.id) return
    const id = result.id
    timer.current = setInterval(() => {
      void locate().then((fix) => {
        if (!fix) return
        setHadLocation(true)
        void v1(`/sos/${id}`, { method: 'PUT', body: fix })
      })
    }, 60_000)
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [phase, result?.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && phase === 'confirm') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [phase, onClose])

  async function send() {
    setPhase('sending')
    const fix = await locate()
    setHadLocation(!!fix)
    const r = await v1<SosResult>('/sos', { body: { ...(fix ?? {}), note: note.trim() || null, bookingId: trip.bookingId } })
    if (!r.ok) {
      setPhase('confirm')
      toast.error(`${r.error} Call 112 if it’s urgent.`)
      return
    }
    setResult(r.data)
    setPhase('sent')
  }

  async function safe() {
    if (!result) return
    setClosing(true)
    const r = await v1(`/sos/${result.id}`, { method: 'PUT', body: { status: 'safe' } })
    setClosing(false)
    if (!r.ok) { toast.error(r.error); return }
    if (timer.current) clearInterval(timer.current)
    setPhase('safe')
    toast.success('Glad you’re safe. We told the team.')
  }

  const support = waDigits(result?.supportWhatsapp ?? status.supportWhatsapp)
  const message = result?.message ?? `SOS on ${trip.title}. Please call me.`
  const emergency = result?.emergencyContact ?? status.emergencyContact
  const hostTel = telHref(result?.host?.phone)
  const smsDigits = (emergency?.phone ?? '').replace(/[^\d+]/g, '')

  const action = 'inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-foreground hover:border-primary'

  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="sos-title">
      <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-background p-5 shadow-xl sm:rounded-3xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 id="sos-title" className="flex items-center gap-2 text-lg font-black text-foreground">
            {phase === 'safe' ? <ShieldCheck className="h-5 w-5 text-green-600" aria-hidden /> : <AlertTriangle className="h-5 w-5 text-red-600" aria-hidden />}
            {phase === 'confirm' || phase === 'sending' ? 'Send an SOS?' : phase === 'safe' ? 'Marked safe' : 'SOS sent'}
          </h2>
          {phase !== 'sending' ? (
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1 text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
          ) : null}
        </div>

        {phase === 'confirm' || phase === 'sending' ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              We’ll tell the UnSOLO team, your host on {trip.title} and your emergency contact, with your location if you allow it.
            </p>
            <div className="space-y-1">
              <label htmlFor="sos-note" className="text-xs font-medium text-muted-foreground">What’s happening (optional)</label>
              <Textarea id="sos-note" value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} rows={3} placeholder="For example: I’m lost near the lake" className="resize-none" disabled={phase === 'sending'} />
            </div>
            <button
              type="button"
              onClick={() => void send()}
              disabled={phase === 'sending'}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-red-600 text-base font-black text-white hover:bg-red-700 disabled:opacity-70"
            >
              {phase === 'sending' ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Sending…</> : 'Send SOS'}
            </button>
            <a href="tel:112" className={`${action} w-full`}><Phone className="h-4 w-4" aria-hidden />Call 112 now</a>
          </div>
        ) : null}

        {phase === 'sent' && result ? (
          <div className="space-y-4">
            <ul className="space-y-1.5 rounded-xl bg-secondary/50 p-3 text-sm">
              {notifiedLines(result.notified ?? {}, result).map((l) => (
                <li key={l} className="flex items-start gap-2"><CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-hidden />{l}</li>
              ))}
              <li className="text-xs text-muted-foreground">
                {hadLocation ? 'Your location is shared and updates every minute while this stays open.' : 'We couldn’t get your location. Turn it on so we can find you.'}
              </li>
            </ul>
            <div className="grid grid-cols-2 gap-2">
              <a href="tel:112" className={`${action} col-span-2 border-red-500/50 text-red-700 dark:text-red-400`}><Phone className="h-4 w-4" aria-hidden />Call 112</a>
              {hostTel ? <a href={hostTel} className={action}><Phone className="h-4 w-4" aria-hidden />Call host</a> : null}
              {support ? (
                <a href={`https://wa.me/${support}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer" className={action}>
                  <MessageCircle className="h-4 w-4" aria-hidden />WhatsApp support
                </a>
              ) : null}
              {smsDigits ? (
                <a href={`sms:${smsDigits}?body=${encodeURIComponent(message)}`} className={action}>
                  <MessageSquare className="h-4 w-4" aria-hidden />Text {emergency?.name || 'contact'}
                </a>
              ) : (
                <Link href="/profile/edit#emergency-contact" className={action}>Add emergency contact</Link>
              )}
            </div>
            <button type="button" onClick={() => void safe()} disabled={closing} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-green-600 text-base font-bold text-white hover:bg-green-700 disabled:opacity-70">
              {closing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />}I’m safe
            </button>
          </div>
        ) : null}

        {phase === 'safe' ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">We closed the alert and told the team you’re safe.</p>
            <button type="button" onClick={onClose} className="inline-flex h-11 w-full items-center justify-center rounded-full bg-foreground text-sm font-bold text-background">Done</button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
