'use client'

import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal, flushSync } from 'react-dom'
import { toBlob } from 'html-to-image'
import { Button } from '@/components/ui/button'
import { Share2, Loader2, ChevronDown, X } from 'lucide-react'
import { toast } from 'sonner'
import { IndiaStatesMap } from '@/components/profile/IndiaStatesMap'
import { leaderboardMedalEmoji } from '@/components/leaderboard/RankDisplay'
import { ACHIEVEMENTS } from '@/types'

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
  /** From `platform_settings.share_poster_share_title`; placeholders `{displayName}`, `{profileUrl}` */
  shareTitleTemplate?: string
  /** From `platform_settings.share_poster_share_text`; placeholders `{displayName}`, `{profileUrl}` */
  shareTextTemplate?: string
  /** Achievement keys earned by this user (for poster badges grid). */
  earnedAchievementKeys?: string[]
}

const DEFAULT_SHARE_TITLE_TEMPLATE = '{displayName} on UnSOLO'
const DEFAULT_SHARE_TEXT_TEMPLATE = 'See my travel story on UnSOLO — {profileUrl}'

function interpolateShareCopy(template: string, displayName: string, profileUrl: string): string {
  return template
    .replace(/\{displayName\}/g, displayName)
    .replace(/\{profileUrl\}/g, profileUrl)
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
  const earnedKeys = props.earnedAchievementKeys ?? []
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
            transform: `translate(${14 * s}px, ${-14 * s}px)`,
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
        <div style={{ flex: '0 0 auto', width: mapColW, paddingTop: 22 * s, alignSelf: 'stretch' }}>
          {mapBlock}
        </div>
      </div>

      <p
        style={{
          margin: `${18 * s}px 0 ${10 * s}px`,
          fontSize: 22 * s,
          fontWeight: 800,
          color: '#57534e',
        }}
      >
        Badges
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: `${10 * s}px`,
          marginBottom: `${8 * s}px`,
        }}
      >
        {ACHIEVEMENTS.slice(0, aspect === 'feed' ? 6 : 8).map((a) => {
          const earned = earnedKeys.includes(a.key)
          return (
            <div
              key={a.key}
              style={{
                borderRadius: 12,
                border: earned ? '2px solid rgba(202, 138, 4, 0.45)' : '1px solid rgba(120, 113, 108, 0.35)',
                background: earned ? 'rgba(254, 243, 199, 0.55)' : 'rgba(255,255,255,0.35)',
                padding: `${10 * s}px ${8 * s}px`,
                textAlign: 'center',
                opacity: earned ? 1 : 0.5,
              }}
            >
              <div style={{ fontSize: 30 * s, lineHeight: 1.15, marginBottom: 4 * s }}>
                {earned ? a.icon : '\u{1F512}'}
              </div>
              <div
                style={{
                  fontSize: 20 * s,
                  fontWeight: 800,
                  color: '#44403c',
                  lineHeight: 1.2,
                }}
              >
                {a.name}
              </div>
            </div>
          )
        })}
      </div>

      <p
        style={{
          margin: `${20 * s}px 0 ${12 * s}px`,
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

/** Shared poster canvas for capture (off-screen) or prep preview (inline, scaled by parent). */
const PosterShell = forwardRef<
  HTMLDivElement,
  { posterProps: ProfileSharePosterProps; aspect: PosterAspect; offscreen?: boolean }
>(function PosterShell({ posterProps, aspect, offscreen = true }, ref) {
  const dims = POSTER_DIMS[aspect]
  return (
    <div
      ref={ref}
      className="pointer-events-none overflow-hidden"
      style={{
        ...(offscreen
          ? { position: 'fixed', left: -10000, top: 0 }
          : { position: 'relative' }),
        width: dims.w,
        height: dims.h,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        boxSizing: 'border-box',
        background: 'linear-gradient(165deg, #fffbeb 0%, #fef3c7 35%, #fde68a 100%)',
        padding: `${Math.round(48 * scaleForAspect(aspect))}px ${Math.round(44 * scaleForAspect(aspect))}px ${Math.round(56 * scaleForAspect(aspect))}px`,
        color: '#1c1917',
        margin: 0,
      }}
      aria-hidden
    >
      <PosterBody props={posterProps} aspect={aspect} />
    </div>
  )
})

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

/**
 * `navigator.share` can resolve before the system share sheet has painted (notably Android).
 * Keep the prep overlay up briefly so the sheet has time to appear over our UI.
 */
function delayAfterNativeShareResolves(): Promise<void> {
  if (typeof navigator === 'undefined') return Promise.resolve()
  const ua = navigator.userAgent || ''
  const isAndroid = /Android/i.test(ua)
  const ms = isAndroid ? 900 : 320
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const MENU_PAD = 12
const MENU_WIDTH_PX = 224 // ~14rem
/** Ignore outside-close / Share re-clicks right after menu opens (mobile ghost clicks after overlay unmount). */
const MENU_OPEN_GUARD_MS = 1200

export function ProfileSharePosterButton(props: ProfileSharePosterProps) {
  const ref = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const propsRef = useRef(props)
  propsRef.current = props
  const primeCancelRef = useRef(false)
  const menuOpenGuardUntilRef = useRef(0)

  const [busy, setBusy] = useState(false)
  const [preparingPoster, setPreparingPoster] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [posterAspect, setPosterAspect] = useState<PosterAspect>('story')
  const [posterPortalReady, setPosterPortalReady] = useState(false)
  const [prepScale, setPrepScale] = useState(0.34)
  /** Aspect chosen in the menu; drives prep overlay preview + capture. */
  const [prepAspect, setPrepAspect] = useState<PosterAspect>('story')

  useEffect(() => {
    setPosterPortalReady(true)
  }, [])

  useLayoutEffect(() => {
    if (!preparingPoster) return
    const update = () => {
      const pad = 12
      const vw = window.innerWidth - pad * 2
      const vh = window.innerHeight - pad * 2
      const { w, h } = POSTER_DIMS[prepAspect]
      const s = Math.min(vw / w, vh / h, 0.52)
      setPrepScale(Math.max(0.2, Math.min(s, 0.52)))
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [preparingPoster, prepAspect])

  const primePosterAssets = useCallback(async () => {
    const p = propsRef.current
    await new Promise<void>((resolve) => {
      if (!p.avatarUrl) {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        return
      }
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.referrerPolicy = 'no-referrer'
      img.onload = () => resolve()
      img.onerror = () => resolve()
      img.src = p.avatarUrl
    })
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
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
    menu.style.zIndex = '10050'
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
    const onDocPointerDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node | null
      if (!t) return
      if (menuRef.current?.contains(t) || panelRef.current?.contains(t)) return
      setPanelOpen(false)
    }
    document.addEventListener('mousedown', onDocPointerDown, true)
    document.addEventListener('touchstart', onDocPointerDown, true)
    return () => {
      document.removeEventListener('mousedown', onDocPointerDown, true)
      document.removeEventListener('touchstart', onDocPointerDown, true)
    }
  }, [panelOpen])

  const runCapture = useCallback(async (aspect: PosterAspect) => {
    const node = ref.current
    if (!node) return

    setPanelOpen(false)
    primeCancelRef.current = false
    flushSync(() => {
      setPrepAspect(aspect)
      setPreparingPoster(true)
    })
    await new Promise<void>((r) => requestAnimationFrame(() => r()))
    const MIN_PREP_MS = 650

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

    try {
      await Promise.all([
        primePosterAssets(),
        new Promise<void>((r) => setTimeout(r, MIN_PREP_MS)),
      ])
      if (primeCancelRef.current) return

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
          const titleTpl = (p.shareTitleTemplate?.trim() || DEFAULT_SHARE_TITLE_TEMPLATE)
          const textTpl = (p.shareTextTemplate?.trim() || DEFAULT_SHARE_TEXT_TEMPLATE)
          try {
            await navigator.share({
              files: [file],
              title: interpolateShareCopy(titleTpl, p.displayName, p.profileUrl),
              text: interpolateShareCopy(textTpl, p.displayName, p.profileUrl),
            })
            await delayAfterNativeShareResolves()
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
    } finally {
      setPreparingPoster(false)
    }
  }, [primePosterAssets])

  const menuBtn =
    'flex w-full cursor-pointer items-center rounded-md px-2 py-2 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground'

  const posterPortal =
    posterPortalReady && typeof document !== 'undefined'
      ? createPortal(
          <PosterShell ref={ref} posterProps={props} aspect={posterAspect} />,
          document.body,
        )
      : null

  const handleShareButtonClick = useCallback(() => {
    if (busy || preparingPoster) return
    if (panelOpen) {
      if (Date.now() < menuOpenGuardUntilRef.current) return
      setPanelOpen(false)
      return
    }
    menuOpenGuardUntilRef.current = Date.now() + MENU_OPEN_GUARD_MS
    setPanelOpen(true)
  }, [busy, preparingPoster, panelOpen])

  const cancelPosterPrep = useCallback(() => {
    primeCancelRef.current = true
    setPreparingPoster(false)
  }, [])

  const prepDims = POSTER_DIMS[prepAspect]
  const posterPrepPortal =
    posterPortalReady && preparingPoster && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="fixed inset-0 z-[9999] flex flex-col pointer-events-auto bg-zinc-950/90"
            role="dialog"
            aria-modal="true"
            aria-busy="true"
            aria-label="Getting your poster ready"
          >
            <div className="absolute inset-0 flex items-start justify-center overflow-hidden pt-[max(env(safe-area-inset-top),10px)]">
              <div
                style={{
                  width: prepDims.w * prepScale,
                  height: prepDims.h * prepScale,
                }}
              >
                <div
                  style={{
                    width: prepDims.w,
                    height: prepDims.h,
                    transform: `scale(${prepScale})`,
                    transformOrigin: 'top left',
                  }}
                >
                  <PosterShell posterProps={props} aspect={prepAspect} offscreen={false} />
                </div>
              </div>
            </div>
            <div
              className="absolute inset-0 bg-black/55 backdrop-blur-xl pointer-events-auto"
              aria-hidden
            />
            <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center p-4">
              <div className="pointer-events-auto w-full max-w-sm rounded-xl border border-border/80 bg-card/95 px-4 py-3 shadow-2xl ring-1 ring-foreground/10 backdrop-blur-sm">
                <div className="flex items-start gap-3">
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">Getting your poster ready…</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Preparing your stats, map, and badges for sharing.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={cancelPosterPrep}
                    className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    aria-label="Cancel"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-3 rounded-lg border border-border/60 bg-secondary/30 px-3 py-2.5 text-[11px] text-muted-foreground space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/90">
                    Your stats
                  </p>
                  <div className="flex justify-between gap-4">
                    <span>Trips</span>
                    <span className="font-mono tabular-nums font-medium text-foreground">
                      {props.tripsStatHidden ? '—' : props.trips}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>States</span>
                    <span className="font-mono tabular-nums font-medium text-foreground">
                      {props.statesStatHidden ? '—' : props.states}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>Score</span>
                    <span className="font-mono tabular-nums font-medium text-foreground">{props.score}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null

  const shareMenuPortal =
    panelOpen && !busy && !preparingPoster && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="z-[10050] rounded-lg border border-border bg-card p-1 shadow-lg ring-1 ring-foreground/10 touch-manipulation"
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
          </div>,
          document.body,
        )
      : null

  return (
    <>
      {posterPrepPortal}
      {shareMenuPortal}
      <span className="relative inline-flex shrink-0 align-top">
        <div className="relative" ref={panelRef}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || preparingPoster}
            className="border-border gap-1.5 min-w-[7.5rem]"
            onClick={() => void handleShareButtonClick()}
          >
            {busy || preparingPoster ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Share2 className="h-3.5 w-3.5" />
            )}
            Share
            <ChevronDown className="h-3.5 w-3.5 opacity-70" />
          </Button>
        </div>
      </span>
      {posterPortal}
    </>
  )
}
