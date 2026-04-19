'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { toBlob } from 'html-to-image'
import { Button } from '@/components/ui/button'
import { Share2, Loader2, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { IndiaStatesMap } from '@/components/profile/IndiaStatesMap'
import { leaderboardMedalEmoji } from '@/components/leaderboard/RankDisplay'

export type ProfileSharePosterTrip = {
  title: string
  place: string
  date: string
}

export type ProfileSharePosterProps = {
  displayName: string
  username: string
  profileUrl: string
  avatarUrl: string | null
  avatarInitials: string
  trips: number
  states: number
  reviews: number
  score: number
  leaderboardRank: number | null
  tripsStatHidden: boolean
  statesStatHidden: boolean
  visitedStates: string[]
  statesMapHidden: boolean
  tripsHidden: boolean
  tripsList: ProfileSharePosterTrip[]
  /** From `platform_settings.share_poster_footer_tagline` */
  footerTagline: string
}

type PosterAspect = 'story' | 'feed'

const POSTER_MAP_SCALE = 1.5

const POSTER_DIMS: Record<PosterAspect, { w: number; h: number }> = {
  story: { w: 1080, h: 1920 },
  feed: { w: 1080, h: 1350 },
}

function scaleForAspect(aspect: PosterAspect): number {
  return aspect === 'feed' ? 0.88 : 1
}

function PosterLeaderboardBlock({
  rank,
  s,
}: {
  rank: number | null
  s: number
}) {
  if (rank == null) {
    return (
      <div style={{ marginTop: 14 * s, display: 'flex', alignItems: 'center', gap: 10 * s }}>
        <span style={{ fontSize: 22 * s, fontWeight: 800, color: '#57534e' }}>Leaderboard</span>
        <span style={{ fontSize: 22 * s, color: '#78716c' }}>—</span>
      </div>
    )
  }
  const medal = leaderboardMedalEmoji(rank)
  return (
    <div
      style={{
        marginTop: 14 * s,
        display: 'flex',
        alignItems: 'center',
        gap: 12 * s,
        flexWrap: 'wrap',
      }}
    >
      <span style={{ fontSize: 22 * s, fontWeight: 800, color: '#57534e' }}>Leaderboard</span>
      {medal ? (
        <span style={{ fontSize: 46 * s, lineHeight: 1 }} aria-hidden>
          {medal}
        </span>
      ) : null}
      <span
        style={{
          fontSize: medal ? 28 * s : 34 * s,
          fontWeight: 900,
          color: '#a16207',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        #{rank}
      </span>
    </div>
  )
}

function StatRow({
  label,
  value,
  hidden,
  s,
}: {
  label: string
  value: string
  hidden?: boolean
  s: number
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 16,
        padding: `${10 * s}px 0`,
        borderBottom: '1px solid rgba(120, 113, 108, 0.18)',
      }}
    >
      <span style={{ fontSize: 21 * s, color: '#57534e', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 28 * s, fontWeight: 900, color: '#a16207', fontVariantNumeric: 'tabular-nums' }}>
        {hidden ? '—' : value}
      </span>
    </div>
  )
}

function PosterBody({ props, aspect }: { props: ProfileSharePosterProps; aspect: PosterAspect }) {
  const s = scaleForAspect(aspect)
  const avatarSize = Math.round(260 * s)
  const mapColW = Math.round(
    (aspect === 'feed' ? 340 * s : 400 * s) * POSTER_MAP_SCALE,
  )
  const mapRasterH = Math.round(320 * POSTER_MAP_SCALE)

  const mapBlock =
    props.statesMapHidden ? (
      <div
        style={{
          minHeight: Math.round(260 * s * POSTER_MAP_SCALE),
          borderRadius: 12,
          border: '1px dashed #d6d3d1',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 20 * s,
          color: '#78716c',
          background: 'rgba(255,255,255,0.35)',
        }}
      >
        Map hidden
      </div>
    ) : (
      <div style={{ width: '100%', maxWidth: mapColW }}>
        <IndiaStatesMap
          visitedStates={props.visitedStates}
          forRasterExport
          rasterMaxHeightPx={mapRasterH}
          className="border-0"
        />
      </div>
    )

  return (
    <>
      <div style={{ position: 'absolute', top: 100 * s, right: -70, fontSize: 260 * s, opacity: 0.07 }}>
        {'\u{2708}'}
      </div>
      <div style={{ position: 'absolute', bottom: 320 * s, left: -36, fontSize: 180 * s, opacity: 0.06 }}>
        {'\u{26F0}'}
      </div>

      <p style={{ margin: 0, fontSize: 48 * s, fontWeight: 900, letterSpacing: -1 }}>
        <span style={{ color: '#ca8a04' }}>UN</span>
        <span>SOLO</span>
      </p>
      <p style={{ margin: `${6 * s}px 0 0`, fontSize: 20 * s, color: '#78716c', fontWeight: 600 }}>
        Your next trip starts here
      </p>

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          marginTop: 28 * s,
          marginBottom: 20 * s,
        }}
      >
        <div
          style={{
            width: avatarSize,
            height: avatarSize,
            borderRadius: '50%',
            overflow: 'hidden',
            border: `${Math.max(4, 5 * s)}px solid rgba(202, 138, 4, 0.45)`,
            boxShadow: '0 12px 40px rgba(0,0,0,0.12)',
            background: 'linear-gradient(145deg, #fef3c7, #fde68a)',
          }}
        >
          {props.avatarUrl ? (
            <img
              src={props.avatarUrl}
              alt=""
              crossOrigin="anonymous"
              referrerPolicy="no-referrer"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: avatarSize * 0.38,
                fontWeight: 900,
                color: '#a16207',
              }}
            >
              {props.avatarInitials}
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 28 * s,
          marginTop: 8 * s,
        }}
      >
        <div style={{ flex: '1 1 0', minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              fontSize: 40 * s,
              fontWeight: 900,
              lineHeight: 1.12,
            }}
          >
            {props.displayName}
          </p>
          <p style={{ margin: `${6 * s}px 0 0`, fontSize: 26 * s, color: '#78716c' }}>@{props.username}</p>

          <PosterLeaderboardBlock rank={props.leaderboardRank} s={s} />

          <p
            style={{
              margin: `${22 * s}px 0 ${10 * s}px`,
              fontSize: 22 * s,
              fontWeight: 800,
              color: '#57534e',
            }}
          >
            At a glance
          </p>
          <div>
            <StatRow label="Trips" value={String(props.trips)} hidden={props.tripsStatHidden} s={s} />
            <StatRow label="States" value={String(props.states)} hidden={props.statesStatHidden} s={s} />
            <StatRow label="Reviews" value={String(props.reviews)} s={s} />
            <StatRow label="Score" value={String(props.score)} s={s} />
            <div style={{ paddingTop: 4 * s, borderBottom: 'none' }} />
          </div>
        </div>
        <div style={{ flex: '0 0 auto', width: mapColW, paddingTop: 4 * s }}>{mapBlock}</div>
      </div>

      <p
        style={{
          margin: `${28 * s}px 0 ${12 * s}px`,
          fontSize: 22 * s,
          fontWeight: 800,
          color: '#57534e',
        }}
      >
        Recent adventures
      </p>
      {props.tripsHidden ? (
        <p style={{ margin: 0, fontSize: 20 * s, color: '#78716c', fontStyle: 'italic' }}>
          Some trips are private on UnSOLO
        </p>
      ) : props.tripsList.length === 0 ? (
        <p style={{ margin: 0, fontSize: 20 * s, color: '#78716c' }}>
          Booking my next escape…
        </p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {props.tripsList.slice(0, aspect === 'feed' ? 3 : 6).map((t, i, arr) => (
            <li
              key={i}
              style={{
                padding: `${12 * s}px 0`,
                borderBottom: i < arr.length - 1 ? '1px solid rgba(120,113,108,0.2)' : 'none',
                fontSize: 22 * s,
              }}
            >
              <span style={{ fontWeight: 800 }}>{t.title}</span>
              <span style={{ display: 'block', fontSize: 18 * s, color: '#57534e', marginTop: 4 }}>
                {t.place} · {t.date}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div style={{ flex: '1 1 16px', minHeight: 16 }} />

      <div style={{ flex: '0 0 auto', paddingTop: 6 * s }}>
        <p style={{ margin: 0, fontSize: 19 * s, color: '#44403c', fontWeight: 600 }}>Open my profile</p>
        <p
          style={{
            margin: `${8 * s}px 0 0`,
            fontSize: 24 * s,
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
            margin: `${28 * s}px 0 0`,
            fontSize: 26 * s,
            fontWeight: 900,
            color: '#ca8a04',
            textAlign: 'center',
          }}
        >
          Meet travellers at unsolo.in
        </p>
        <p
          style={{
            margin: `${10 * s}px 0 0`,
            fontSize: 18 * s,
            color: '#78716c',
            textAlign: 'center',
            lineHeight: 1.35,
          }}
        >
          {props.footerTagline}
        </p>
      </div>
    </>
  )
}

function downloadPngBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** In-app browsers often break `navigator.share` (files) and show a generic error page — download instead. */
function prefersPosterDownloadOverNativeShare(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return /Instagram|FBAN|FBAV|FB_IAB|FB4A|Line\/|MicroMessenger|Twitter|Snapchat/i.test(ua)
}

const MENU_PAD = 12
const MENU_WIDTH_PX = 224 // ~14rem

export function ProfileSharePosterButton(props: ProfileSharePosterProps) {
  const ref = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const propsRef = useRef(props)
  propsRef.current = props

  const [busy, setBusy] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [posterAspect, setPosterAspect] = useState<PosterAspect>('story')
  const [posterPortalReady, setPosterPortalReady] = useState(false)

  useEffect(() => {
    setPosterPortalReady(true)
  }, [])

  const positionShareMenu = useCallback(() => {
    const menu = menuRef.current
    const wrap = panelRef.current
    if (!menu || !wrap) return
    const anchor = wrap.getBoundingClientRect()
    const vw = window.innerWidth
    const maxW = Math.min(MENU_WIDTH_PX, vw - MENU_PAD * 2)
    menu.style.width = `${maxW}px`
    const mw = menu.offsetWidth
    let left = anchor.left
    if (left + mw > vw - MENU_PAD) {
      left = vw - MENU_PAD - mw
    }
    if (left < MENU_PAD) {
      left = MENU_PAD
    }
    menu.style.position = 'fixed'
    menu.style.top = `${anchor.bottom + 4}px`
    menu.style.left = `${left}px`
    menu.style.right = 'auto'
    menu.style.insetInlineStart = 'auto'
  }, [])

  useLayoutEffect(() => {
    if (!panelOpen) return
    positionShareMenu()
    const onReposition = () => positionShareMenu()
    window.addEventListener('resize', onReposition)
    window.addEventListener('scroll', onReposition, true)
    return () => {
      window.removeEventListener('resize', onReposition)
      window.removeEventListener('scroll', onReposition, true)
    }
  }, [panelOpen, positionShareMenu])

  useEffect(() => {
    if (!panelOpen) return
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node | null
      if (t && panelRef.current?.contains(t)) return
      setPanelOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown, true)
    return () => document.removeEventListener('mousedown', onDocMouseDown, true)
  }, [panelOpen])

  const runCapture = useCallback(async (aspect: PosterAspect) => {
    const node = ref.current
    if (!node) return

    setPanelOpen(false)
    const { w, h } = POSTER_DIMS[aspect]
    const p = propsRef.current
    const aspectSlug = aspect === 'story' ? '9x16' : '4x5'
    const filename = `unsolo-${p.username}-${aspectSlug}.png`

    const styleBackup = {
      position: node.style.position,
      left: node.style.left,
      top: node.style.top,
      width: node.style.width,
      height: node.style.height,
      zIndex: node.style.zIndex,
      pointerEvents: node.style.pointerEvents,
    }

    setBusy(true)
    let movedOnscreen = false
    try {
      flushSync(() => {
        setPosterAspect(aspect)
      })

      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))

      Object.assign(node.style, {
        position: 'fixed',
        left: '0',
        top: '0',
        width: `${w}px`,
        height: `${h}px`,
        zIndex: '2147483646',
        pointerEvents: 'none',
      })
      movedOnscreen = true

      await new Promise<void>((r) => requestAnimationFrame(() => r()))

      const blob = await toBlob(node, {
        pixelRatio: 1,
        cacheBust: true,
        backgroundColor: '#fffbeb',
        width: w,
        height: h,
      })
      if (!blob) {
        throw new Error('Empty image')
      }

      const file = new File([blob], filename, { type: 'image/png' })
      const canTryShare =
        !prefersPosterDownloadOverNativeShare() &&
        typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function' &&
        (!navigator.canShare || navigator.canShare({ files: [file] }))

      if (canTryShare) {
        try {
          await navigator.share({
            files: [file],
            title: `${p.displayName} on UnSOLO`,
            text: `See my travel story on UnSOLO — ${p.profileUrl}`,
          })
          return
        } catch (shareErr: unknown) {
          const name = shareErr instanceof Error ? shareErr.name : ''
          if (name === 'AbortError') {
            return
          }
          console.warn('navigator.share failed, falling back to download', shareErr)
        }
      }

      downloadPngBlob(blob, filename)
      toast.success('Poster saved — open it from your downloads or gallery to post.')
    } catch (e) {
      console.error(e)
      toast.error('Could not create poster. Try again in Safari or Chrome.')
    } finally {
      if (movedOnscreen) {
        Object.assign(node.style, styleBackup)
      }
      setBusy(false)
    }
  }, [])

  const dims = POSTER_DIMS[posterAspect]

  const menuBtn =
    'flex w-full cursor-pointer items-center rounded-md px-2 py-2 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground'

  const posterPortal =
    posterPortalReady && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={ref}
            className="pointer-events-none overflow-hidden"
            style={{
              position: 'fixed',
              left: -10000,
              top: 0,
              width: dims.w,
              height: dims.h,
              display: 'flex',
              flexDirection: 'column',
              fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
              boxSizing: 'border-box',
              background: 'linear-gradient(165deg, #fffbeb 0%, #fef3c7 35%, #fde68a 100%)',
              padding: `${Math.round(48 * scaleForAspect(posterAspect))}px ${Math.round(44 * scaleForAspect(posterAspect))}px ${Math.round(56 * scaleForAspect(posterAspect))}px`,
              color: '#1c1917',
              margin: 0,
            }}
            aria-hidden
          >
            <PosterBody props={props} aspect={posterAspect} />
          </div>,
          document.body,
        )
      : null

  return (
    <>
      <span className="relative inline-flex shrink-0 align-top">
        <div className="relative" ref={panelRef}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            className="border-border gap-1.5 min-w-[7.5rem]"
            onClick={() => setPanelOpen((o) => !o)}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
            Share
            <ChevronDown className="h-3.5 w-3.5 opacity-70" />
          </Button>
          {panelOpen && !busy ? (
            <div
              ref={menuRef}
              role="menu"
              className="z-[500] rounded-lg border border-border bg-card p-1 shadow-lg ring-1 ring-foreground/10 touch-manipulation"
            >
              <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Poster size
              </p>
              <button type="button" className={menuBtn} onClick={() => void runCapture('story')}>
                Story 9:16
              </button>
              <button type="button" className={menuBtn} onClick={() => void runCapture('feed')}>
                Feed 4:5
              </button>
            </div>
          ) : null}
        </div>
      </span>
      {posterPortal}
    </>
  )
}
