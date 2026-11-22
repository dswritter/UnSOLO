'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, Clock, MapPin, MessageCircle, Phone, Printer, Users } from 'lucide-react'
import { TripDescriptionDisplay } from '@/components/ui/TripDescriptionDisplay'
import { formatPrice } from '@/lib/utils'
import { formatDateRangeFromEdges } from '@/lib/package-trip-calendar'
import { telHref, v1, waDigits } from '@/lib/api/v1-client'

type UserLite = { id: string; username: string; name: string; avatarUrl: string | null }
type Pack = {
  bookingId: string
  status: string
  confirmationCode: string | null
  guests: number
  startDate: string
  endDate: string
  departureTime: string | null
  returnTime: string | null
  totalPaise: number
  paidPaise: number
  balancePaise: number
  specialRequests: string | null
  trip: { slug: string; title: string; place: { name: string } | null; durationDays: number; image: { url: string; thumbUrl: string | null } | null }
  description: string
  includes: string[]
  cancellationPolicy: string | null
  host: { user: UserLite; phone: string | null } | null
  travellers: UserLite[]
  chatRoomId: string | null
  support: { whatsapp: string | null; email: string }
  helplines: { label: string; phone: string }[]
  generatedAt: string
}

const key = (id: string) => `unsolo.tripPack.${id}`

function readSaved(id: string): Pack | null {
  try {
    const raw = localStorage.getItem(key(id))
    return raw ? (JSON.parse(raw) as Pack) : null
  } catch { return null }
}

const longDate = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const savedAt = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="pack-section break-inside-avoid border-t border-border pt-5">
      <h2 className="mb-3 text-lg font-bold text-foreground">{title}</h2>
      {children}
    </section>
  )
}

/** GET /api/v1/my/trips/{id}/pack as a printable page, kept on this device for use offline. */
export function TripPack({ bookingId }: { bookingId: string }) {
  const [pack, setPack] = useState<Pack | null>(null)
  const [fromCache, setFromCache] = useState(false)
  const [error, setError] = useState<{ message: string; status: number } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let live = true
    const saved = readSaved(bookingId)
    void v1<Pack>(`/my/trips/${bookingId}/pack`).then((r) => {
      if (!live) return
      setLoading(false)
      if (r.ok) {
        setPack(r.data)
        setFromCache(false)
        try { localStorage.setItem(key(bookingId), JSON.stringify(r.data)) } catch { /* storage full or blocked */ }
        return
      }
      if (r.status === 404 || r.status === 401) {
        try { localStorage.removeItem(key(bookingId)) } catch { /* ignore */ }
        setError({ message: r.error, status: r.status })
        return
      }
      if (saved) { setPack(saved); setFromCache(true) } else setError({ message: r.error, status: r.status })
    })
    return () => { live = false }
  }, [bookingId])

  if (loading && !pack) {
    return <div className="mx-auto max-w-3xl space-y-3 px-4 py-10" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="pc-skel h-24 rounded-2xl" />)}</div>
  }
  if (!pack) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl text-foreground">Trip pack</h1>
        <p className="mt-2 text-muted-foreground">
          {error?.status === 401 ? 'Sign in to see your trip pack.' : error?.status === 404 ? 'We couldn’t find this trip.' : `${error?.message ?? 'Couldn’t load the trip pack.'} Open it once with a connection and it stays on this device.`}
        </p>
        <Link href={error?.status === 401 ? `/login?redirectTo=${encodeURIComponent(`/bookings/${bookingId}/pack`)}` : '/bookings'} className="pc-btn mt-4">
          {error?.status === 401 ? 'Sign in' : 'My trips'}
        </Link>
      </div>
    )
  }

  const p = pack
  const range = p.endDate && p.endDate !== p.startDate ? formatDateRangeFromEdges(p.startDate.slice(0, 10), p.endDate.slice(0, 10)) : longDate(p.startDate)
  const hostTel = telHref(p.host?.phone)
  const supportWa = waDigits(p.support.whatsapp)

  return (
    <div className="trip-pack mx-auto max-w-3xl px-4 py-8 print:max-w-none print:px-0 print:py-0">
      <style>{`
        @media print {
          @page { margin: 14mm; }
          body * { visibility: hidden; }
          .trip-pack, .trip-pack * { visibility: visible; }
          .trip-pack { position: absolute; inset: 0 auto auto 0; width: 100%; color: #000; background: #fff; }
          .trip-pack a { color: #000; text-decoration: none; }
          .trip-pack .no-print { display: none !important; }
          .trip-pack .pack-section { break-inside: avoid; border-color: #ccc; }
        }
      `}</style>

      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href="/bookings" className="text-sm text-muted-foreground hover:text-foreground">← My trips</Link>
        <button type="button" onClick={() => window.print()} className="pc-btn"><Printer className="h-4 w-4" aria-hidden />Save as PDF / Print</button>
      </div>

      {fromCache ? (
        <p className="no-print mb-4 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          You’re offline. This is the copy saved on {savedAt(p.generatedAt)}.
        </p>
      ) : null}

      <header className="space-y-2">
        <p className="pc-eyebrow">Trip pack</p>
        <h1 className="text-3xl leading-tight text-foreground">{p.trip.title}</h1>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {p.trip.place?.name ? <span className="flex items-center gap-1"><MapPin className="h-4 w-4" aria-hidden />{p.trip.place.name}</span> : null}
          <span className="flex items-center gap-1"><CalendarDays className="h-4 w-4" aria-hidden />{range}</span>
          <span className="flex items-center gap-1"><Users className="h-4 w-4" aria-hidden />{p.guests} {p.guests === 1 ? 'guest' : 'guests'}</span>
        </div>
        <div className="no-print flex flex-wrap gap-2 pt-2">
          <Link href={`/packages/${encodeURIComponent(p.trip.slug)}`} className="pc-btn pc-btn-outline">View trip</Link>
          {p.chatRoomId ? <Link href={`/community/${p.chatRoomId}`} className="pc-btn pc-btn-outline"><MessageCircle className="h-4 w-4" aria-hidden />Group chat</Link> : null}
        </div>
      </header>

      <div className="mt-6 space-y-6">
        <Section title="Your booking">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-muted-foreground">Booking code</dt><dd className="font-mono text-base font-bold text-foreground">{p.confirmationCode ?? '—'}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Status</dt><dd className="capitalize text-foreground">{p.status.replace(/_/g, ' ')}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Guests</dt><dd className="text-foreground">{p.guests}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Starts</dt><dd className="text-foreground">{longDate(p.startDate)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Ends</dt><dd className="text-foreground">{longDate(p.endDate)}</dd></div>
          </dl>
          {p.specialRequests ? <p className="mt-3 text-sm text-muted-foreground"><span className="font-medium text-foreground">Your requests: </span>{p.specialRequests}</p> : null}
        </Section>

        {p.departureTime || p.returnTime ? (
          <Section title="Timings">
            <ul className="space-y-1 text-sm text-foreground">
              {p.departureTime ? <li className="flex items-center gap-2"><Clock className="h-4 w-4 text-muted-foreground" aria-hidden />Departure: {p.departureTime}</li> : null}
              {p.returnTime ? <li className="flex items-center gap-2"><Clock className="h-4 w-4 text-muted-foreground" aria-hidden />Return: {p.returnTime}</li> : null}
            </ul>
          </Section>
        ) : null}

        <Section title="Payment">
          <dl className="grid grid-cols-3 gap-4 text-sm">
            <div><dt className="text-xs text-muted-foreground">Total</dt><dd className="font-bold text-foreground">{formatPrice(p.totalPaise)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Paid</dt><dd className="text-foreground">{formatPrice(p.paidPaise)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Balance</dt><dd className={p.balancePaise > 0 ? 'font-bold text-amber-700 dark:text-amber-400' : 'text-foreground'}>{formatPrice(p.balancePaise)}</dd></div>
          </dl>
        </Section>

        {p.host ? (
          <Section title="Your host">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-foreground">{p.host.user.name || p.host.user.username}</p>
                {p.host.phone ? <p className="text-sm text-muted-foreground">{p.host.phone}</p> : <p className="text-sm text-muted-foreground">Phone not shared yet</p>}
              </div>
              {hostTel ? <a href={hostTel} className="pc-btn no-print"><Phone className="h-4 w-4" aria-hidden />Call host</a> : null}
            </div>
          </Section>
        ) : null}

        {p.description.trim() ? (
          <Section title="The plan">
            <TripDescriptionDisplay className="text-sm text-foreground">{p.description}</TripDescriptionDisplay>
          </Section>
        ) : null}

        {p.includes.length ? (
          <Section title="What’s included">
            <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
              {p.includes.map((i) => <li key={i}>{i}</li>)}
            </ul>
          </Section>
        ) : null}

        {p.travellers.length ? (
          <Section title={`Travelling with you (${p.travellers.length})`}>
            <ul className="flex flex-wrap gap-2 text-sm">
              {p.travellers.map((t) => (
                <li key={t.id} className="rounded-full bg-secondary px-3 py-1 text-foreground">
                  <Link href={`/profile/${encodeURIComponent(t.username)}`}>{t.name || t.username}</Link>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        <Section title="Helplines">
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            {p.helplines.map((h) => (
              <li key={h.phone}>
                <a href={`tel:${h.phone}`} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 hover:border-primary">
                  <span className="text-foreground">{h.label}</span>
                  <span className="font-mono font-bold text-foreground">{h.phone}</span>
                </a>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="UnSOLO support">
          <ul className="space-y-1 text-sm text-foreground">
            {supportWa ? (
              <li>WhatsApp: <a href={`https://wa.me/${supportWa}`} target="_blank" rel="noopener noreferrer" className="pc-link">+{supportWa}</a></li>
            ) : null}
            <li>Email: <a href={`mailto:${p.support.email}`} className="pc-link">{p.support.email}</a></li>
          </ul>
        </Section>

        {p.cancellationPolicy ? (
          <Section title="Cancellation policy">
            <p className="whitespace-pre-line text-sm text-muted-foreground">{p.cancellationPolicy}</p>
          </Section>
        ) : null}

        <p className="pt-2 text-xs text-muted-foreground">Saved {savedAt(p.generatedAt)}. Booking {p.bookingId.slice(0, 8)}.</p>
      </div>
    </div>
  )
}
