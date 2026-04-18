'use client'

import { useCallback, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { Button } from '@/components/ui/button'
import { Share2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { IndiaStatesMap } from '@/components/profile/IndiaStatesMap'

export type ProfileSharePosterTrip = {
  title: string
  place: string
  date: string
}

export type ProfileSharePosterProps = {
  displayName: string
  username: string
  profileUrl: string
  trips: number
  states: number
  reviews: number
  score: number
  tripsStatHidden: boolean
  statesStatHidden: boolean
  visitedStates: string[]
  statesMapHidden: boolean
  tripsHidden: boolean
  tripsList: ProfileSharePosterTrip[]
}

function statCell(label: string, value: string, hidden?: boolean) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '12px 8px',
        borderRadius: 16,
        background: 'rgba(255,255,255,0.65)',
        border: '1px solid rgba(202,138,4,0.25)',
      }}
    >
      <div style={{ fontSize: 32, fontWeight: 900, color: '#a16207', lineHeight: 1.1 }}>
        {hidden ? '—' : value}
      </div>
      <div style={{ fontSize: 18, color: '#78716c', marginTop: 6, fontWeight: 600 }}>{label}</div>
    </div>
  )
}

export function ProfileSharePosterButton(props: ProfileSharePosterProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)

  const download = useCallback(async () => {
    const node = ref.current
    if (!node) return
    setBusy(true)
    try {
      const dataUrl = await toPng(node, {
        pixelRatio: 1,
        cacheBust: true,
        backgroundColor: '#fffbeb',
        width: 1080,
        height: 1920,
        style: { transform: 'scale(1)' },
      })
      const res = await fetch(dataUrl)
      const blob = await res.blob()
      const file = new File([blob], `unsolo-${props.username}-story.png`, { type: 'image/png' })

      if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `${props.displayName} on UnSOLO`,
          text: `See my travel story on UnSOLO — ${props.profileUrl}`,
        })
        toast.success('Ready to post!')
      } else {
        const a = document.createElement('a')
        a.href = dataUrl
        a.download = `unsolo-${props.username}-story.png`
        a.click()
        toast.success('Poster saved — add it to WhatsApp or Instagram!')
      }
    } catch (e) {
      console.error(e)
      toast.error('Could not create poster. Try again.')
    } finally {
      setBusy(false)
    }
  }, [props.displayName, props.profileUrl, props.username])

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="border-border gap-1.5"
        disabled={busy}
        onClick={() => void download()}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
        Share story
      </Button>

      <div
        ref={ref}
        className="pointer-events-none fixed -left-[10000px] top-0 overflow-hidden"
        style={{
          position: 'relative',
          width: 1080,
          minHeight: 1920,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          boxSizing: 'border-box',
          background: 'linear-gradient(165deg, #fffbeb 0%, #fef3c7 35%, #fde68a 100%)',
          padding: '56px 48px 64px',
          color: '#1c1917',
        }}
        aria-hidden
      >
        <div style={{ position: 'absolute', top: 120, right: -80, fontSize: 280, opacity: 0.07 }}>{'\u{2708}'}</div>
        <div style={{ position: 'absolute', bottom: 400, left: -40, fontSize: 200, opacity: 0.06 }}>{'\u{26F0}'}</div>

        <p style={{ margin: 0, fontSize: 52, fontWeight: 900, letterSpacing: -1 }}>
          <span style={{ color: '#ca8a04' }}>UN</span>
          <span>SOLO</span>
        </p>
        <p style={{ margin: '8px 0 0', fontSize: 22, color: '#78716c', fontWeight: 600 }}>Your next trip starts here</p>

        <p
          style={{
            margin: '48px 0 0',
            fontSize: 44,
            fontWeight: 900,
            lineHeight: 1.15,
          }}
        >
          {props.displayName}
        </p>
        <p style={{ margin: '8px 0 0', fontSize: 28, color: '#78716c' }}>@{props.username}</p>

        <p style={{ margin: '40px 0 16px', fontSize: 24, fontWeight: 800, color: '#57534e' }}>At a glance</p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 14,
          }}
        >
          {statCell('Trips', String(props.trips), props.tripsStatHidden)}
          {statCell('States', String(props.states), props.statesStatHidden)}
          {statCell('Reviews', String(props.reviews))}
          {statCell('Score', String(props.score))}
        </div>

        <p style={{ margin: '36px 0 12px', fontSize: 24, fontWeight: 800, color: '#57534e' }}>
          States explored
        </p>
        {props.statesMapHidden ? (
          <div
            style={{
              height: 300,
              borderRadius: 16,
              background: 'rgba(255,255,255,0.5)',
              border: '1px dashed #d6d3d1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
              color: '#78716c',
            }}
          >
            Map hidden for privacy
          </div>
        ) : (
          <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(202,138,4,0.35)' }}>
            <IndiaStatesMap visitedStates={props.visitedStates} className="max-h-[320px] border-0 bg-white/50" />
          </div>
        )}

        <p style={{ margin: '36px 0 12px', fontSize: 24, fontWeight: 800, color: '#57534e' }}>
          Recent adventures
        </p>
        {props.tripsHidden ? (
          <p style={{ margin: 0, fontSize: 22, color: '#78716c', fontStyle: 'italic' }}>
            Some trips are private on UnSOLO
          </p>
        ) : props.tripsList.length === 0 ? (
          <p style={{ margin: 0, fontSize: 22, color: '#78716c' }}>Booking my next escape…</p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {props.tripsList.slice(0, 6).map((t, i) => (
              <li
                key={i}
                style={{
                  padding: '14px 0',
                  borderBottom: i < Math.min(props.tripsList.length, 6) - 1 ? '1px solid rgba(120,113,108,0.2)' : 'none',
                  fontSize: 24,
                }}
              >
                <span style={{ fontWeight: 800 }}>{t.title}</span>
                <span style={{ display: 'block', fontSize: 20, color: '#57534e', marginTop: 4 }}>
                  {t.place} · {t.date}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div style={{ flex: '1 1 24px', minHeight: 24 }} />

        <div
          style={{
            flex: '0 0 auto',
            paddingTop: 8,
          }}
        >
          <p style={{ margin: 0, fontSize: 22, color: '#44403c', fontWeight: 600 }}>Open my profile</p>
          <p
            style={{
              margin: '10px 0 0',
              fontSize: 26,
              fontWeight: 900,
              color: '#a16207',
              wordBreak: 'break-all',
              lineHeight: 1.3,
            }}
          >
            {props.profileUrl}
          </p>
          <p
            style={{
              margin: '36px 0 0',
              fontSize: 28,
              fontWeight: 900,
              color: '#ca8a04',
              textAlign: 'center',
            }}
          >
            Meet travellers at unsolo.in
          </p>
          <p style={{ margin: '12px 0 0', fontSize: 20, color: '#78716c', textAlign: 'center' }}>
            Book treks, find your tribe, share the stoke.
          </p>
        </div>
      </div>
    </>
  )
}
