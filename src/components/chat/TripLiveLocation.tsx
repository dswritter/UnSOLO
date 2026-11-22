'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Map as MapIcon, Navigation, X } from 'lucide-react'
import { toast } from 'sonner'
import { LazyPinMap, type MapPin } from '@/components/maps/LazyPinMap'
import { v1 } from '@/lib/api/v1-client'

type Share = {
  user: { id: string; username: string; name: string; avatarUrl: string | null }
  lat: number
  lng: number
  accuracy: number | null
  startedAt: string
  updatedAt: string
  expiresAt: string
  mine: boolean
}

const DURATIONS = [
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 h' },
  { minutes: 120, label: '2 h' },
  { minutes: 240, label: '4 h' },
]
const SEND_EVERY_MS = 30_000
const REFRESH_OPEN_MS = 20_000
const REFRESH_CLOSED_MS = 60_000

function ago(iso: string, now: number) {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  if (s < 60) return 'updated just now'
  const m = Math.round(s / 60)
  if (m < 60) return `updated ${m} min ago`
  return `updated ${Math.round(m / 60)} h ago`
}
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })

/**
 * Live location for a trip group: share for 30 min to 4 h while this page is open (sent at most every
 * 30 s), stop any time, and a group map of everyone sharing (refreshed every 20 s while open).
 */
export function TripLiveLocation({ roomId }: { roomId: string }) {
  const [shares, setShares] = useState<Share[]>([])
  const [mapOpen, setMapOpen] = useState(false)
  const [picking, setPicking] = useState(false)
  const [starting, setStarting] = useState(false)
  const [myUntil, setMyUntil] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const watchId = useRef<number | null>(null)
  const lastSent = useRef(0)
  const pending = useRef<GeolocationPosition | null>(null)
  const sendTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const apply = useCallback((items: Share[]) => {
    setShares(items)
    setNow(Date.now())
    const mine = items.find((s) => s.mine)
    setMyUntil((cur) => (mine ? mine.expiresAt : cur && Date.parse(cur) > Date.now() ? cur : null))
  }, [])

  const load = useCallback(async () => {
    const r = await v1<{ items: Share[] }>(`/chats/${roomId}/live-location`)
    if (r.ok) apply(r.data.items)
  }, [roomId, apply])

  useEffect(() => {
    let live = true
    const tick = () => { void v1<{ items: Share[] }>(`/chats/${roomId}/live-location`).then((r) => { if (live && r.ok) apply(r.data.items) }) }
    tick()
    const t = setInterval(tick, mapOpen ? REFRESH_OPEN_MS : REFRESH_CLOSED_MS)
    return () => { live = false; clearInterval(t) }
  }, [roomId, apply, mapOpen])

  const stopWatch = useCallback(() => {
    if (watchId.current != null && typeof navigator !== 'undefined') navigator.geolocation?.clearWatch(watchId.current)
    watchId.current = null
    if (sendTimer.current) clearTimeout(sendTimer.current)
    sendTimer.current = null
    pending.current = null
  }, [])

  const flush = useCallback(() => {
    sendTimer.current = null
    const pos = pending.current
    if (!pos) return
    pending.current = null
    lastSent.current = Date.now()
    void v1<{ expiresAt: string }>(`/chats/${roomId}/live-location`, {
      method: 'PUT',
      body: { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) },
    }).then((r) => {
      if (r.ok) setMyUntil(r.data.expiresAt)
      else if (r.status === 400) { stopWatch(); setMyUntil(null) } // the share ended
    })
  }, [roomId, stopWatch])

  const startWatch = useCallback(() => {
    if (watchId.current != null || typeof navigator === 'undefined' || !navigator.geolocation) return
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        pending.current = pos
        const wait = SEND_EVERY_MS - (Date.now() - lastSent.current)
        if (wait <= 0) flush()
        else if (!sendTimer.current) sendTimer.current = setTimeout(flush, wait)
      },
      () => { /* keep the last position; the share still ends on time */ },
      { enableHighAccuracy: true, maximumAge: 15_000 },
    )
  }, [flush])

  // Keep sending while you're sharing and this page is open; stop when the time is up.
  useEffect(() => {
    if (!myUntil) { stopWatch(); return }
    const left = Date.parse(myUntil) - Date.now()
    if (left <= 0) { stopWatch(); return }
    startWatch()
    const t = setTimeout(() => { stopWatch(); setMyUntil(null); void load() }, left)
    return () => clearTimeout(t)
  }, [myUntil, startWatch, stopWatch, load])

  useEffect(() => () => stopWatch(), [stopWatch])

  function start(minutes: number) {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { toast.error('This browser can’t share location'); return }
    setStarting(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const r = await v1<{ expiresAt: string }>(`/chats/${roomId}/live-location`, {
          method: 'PUT',
          body: { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy), minutes },
        })
        setStarting(false)
        if (!r.ok) { toast.error(r.error); return }
        lastSent.current = Date.now()
        setPicking(false)
        setMyUntil(r.data.expiresAt)
        toast.success('Sharing your live location with the group')
        void load()
      },
      () => { setStarting(false); toast.error('Allow location access to share where you are') },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 10_000 },
    )
  }

  async function stop() {
    stopWatch()
    setMyUntil(null)
    const r = await v1(`/chats/${roomId}/live-location`, { method: 'DELETE' })
    if (!r.ok) toast.error(r.error)
    void load()
  }

  const pins = useMemo<MapPin[]>(() => shares.map((s) => ({
    id: s.user.id,
    lat: s.lat,
    lng: s.lng,
    title: s.mine ? 'You' : s.user.name || s.user.username,
    subtitle: ago(s.updatedAt, now),
    meta: `Until ${clock(s.expiresAt)}`,
    href: s.mine ? null : `/profile/${encodeURIComponent(s.user.username)}`,
    linkLabel: 'View profile',
    color: s.mine ? '#2563eb' : '#0f5132',
    glyph: (s.user.name || s.user.username).split(/\s+/).map((w) => w[0]).join('').slice(0, 2),
  })), [shares, now])

  const others = shares.filter((s) => !s.mine).length
  const btn = 'inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[13px] font-semibold text-foreground hover:border-primary disabled:opacity-60'

  return (
    <div className="shrink-0 border-b border-border/60 bg-[color:var(--pc-paper,transparent)] px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        {myUntil ? (
          <>
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-blue-700 dark:text-blue-400">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-500 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" /></span>
              Sharing until {clock(myUntil)}
            </span>
            <button type="button" onClick={() => void stop()} className={btn}><X className="h-3.5 w-3.5" aria-hidden />Stop</button>
          </>
        ) : picking ? (
          <>
            <span className="text-[13px] text-muted-foreground">Share for</span>
            {DURATIONS.map((d) => (
              <button key={d.minutes} type="button" onClick={() => start(d.minutes)} disabled={starting} className={btn}>{d.label}</button>
            ))}
            {starting ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Starting" /> : null}
            <button type="button" onClick={() => setPicking(false)} disabled={starting} className="text-[13px] text-muted-foreground hover:text-foreground">Cancel</button>
          </>
        ) : (
          <button type="button" onClick={() => setPicking(true)} className={btn}><Navigation className="h-3.5 w-3.5" aria-hidden />Share live location</button>
        )}
        <button type="button" onClick={() => setMapOpen((o) => !o)} aria-expanded={mapOpen} className={`${btn} ml-auto`}>
          <MapIcon className="h-3.5 w-3.5" aria-hidden />Group map{others ? ` · ${others} sharing` : ''}
        </button>
      </div>
      {myUntil ? <p className="mt-1 text-[11px] text-muted-foreground">Keep this page open to keep your location up to date.</p> : null}
      {mapOpen ? (
        <div className="mt-2 overflow-hidden rounded-xl border border-border">
          {shares.length ? (
            <LazyPinMap pins={pins} style={{ height: 300 }} ariaLabel="Group map of live locations" />
          ) : (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No one is sharing right now.</p>
          )}
          {shares.length ? (
            <ul className="divide-y divide-border text-[13px]">
              {shares.map((s) => (
                <li key={s.user.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                  <span className="truncate font-medium text-foreground">{s.mine ? 'You' : s.user.name || s.user.username}</span>
                  <span className="shrink-0 text-muted-foreground">{ago(s.updatedAt, now)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
