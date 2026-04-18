'use client'

import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { toBlob } from 'html-to-image'
import { buttonVariants } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Share2, Loader2, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
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
type PosterMode = 'full' | 'compact'

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

function PosterBody({
  props,
  aspect,
  mode,
}: {
  props: ProfileSharePosterProps
  aspect: PosterAspect
  mode: PosterMode
}) {
  const s = scaleForAspect(aspect)
  const full = mode === 'full'
  const avatarSize = Math.round(260 * s)
  const mapColW = aspect === 'feed' ? Math.round(340 * s) : Math.round(400 * s)

  const mapBlock =
    props.statesMapHidden ? (
      <div
        style={{
          minHeight: 260 * s,
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
        <IndiaStatesMap visitedStates={props.visitedStates} forRasterExport className="border-0" />
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

      {full ? (
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
      ) : (
        <div style={{ height: 12 * s }} />
      )}

      {full ? (
        <>
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
                    borderBottom:
                      i < arr.length - 1 ? '1px solid rgba(120,113,108,0.2)' : 'none',
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
        </>
      ) : (
        <div style={{ marginTop: 16 * s }}>
          <PosterLeaderboardBlock rank={props.leaderboardRank} s={s} />
          <div
            style={{
              display: 'flex',
              gap: 36 * s,
              marginTop: 20 * s,
              marginBottom: 16 * s,
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 44 * s, fontWeight: 900, color: '#a16207' }}>
                {props.tripsStatHidden ? '—' : props.trips}
              </div>
              <div style={{ fontSize: 18 * s, color: '#57534e', fontWeight: 600 }}>Trips</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 44 * s, fontWeight: 900, color: '#a16207' }}>
                {props.statesStatHidden ? '—' : props.states}
              </div>
              <div style={{ fontSize: 18 * s, color: '#57534e', fontWeight: 600 }}>States</div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 * s }}>{mapBlock}</div>
        </div>
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

export function ProfileSharePosterButton(props: ProfileSharePosterProps) {
  const ref = useRef<HTMLDivElement>(null)
  const propsRef = useRef(props)
  propsRef.current = props

  const [busy, setBusy] = useState(false)
  const [posterAspect, setPosterAspect] = useState<PosterAspect>('story')
  const [posterMode, setPosterMode] = useState<PosterMode>('full')
  const [captureJob, setCaptureJob] = useState<{
    aspect: PosterAspect
    mode: PosterMode
  } | null>(null)

  const requestCapture = useCallback((aspect: PosterAspect, mode: PosterMode) => {
    setBusy(true)
    setCaptureJob({ aspect, mode })
  }, [])

  useLayoutEffect(() => {
    if (!captureJob) return
    const node = ref.current
    if (!node) {
      setCaptureJob(null)
      setBusy(false)
      return
    }

    const { aspect, mode } = captureJob
    const { w, h } = POSTER_DIMS[aspect]
    const p = propsRef.current
    const aspectSlug = aspect === 'story' ? '9x16' : '4x5'
    const modeSlug = mode === 'full' ? 'full' : 'stats'
    const filename = `unsolo-${p.username}-${modeSlug}-${aspectSlug}.png`

    const styleBackup = {
      position: node.style.position,
      left: node.style.left,
      top: node.style.top,
      width: node.style.width,
      height: node.style.height,
      zIndex: node.style.zIndex,
      pointerEvents: node.style.pointerEvents,
    }

    let cancelled = false

    const run = async () => {
      let movedOnscreen = false
      try {
        await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
        if (cancelled) return

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
        if (cancelled) return

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

        if (cancelled) return

        setPosterAspect(aspect)
        setPosterMode(mode)

        const file = new File([blob], filename, { type: 'image/png' })
        const canTryShare =
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
            if (!cancelled) toast.success('Ready to post!')
            return
          } catch (shareErr: unknown) {
            const name = shareErr instanceof Error ? shareErr.name : ''
            if (name === 'AbortError') {
              return
            }
            console.warn('navigator.share failed, falling back to download', shareErr)
          }
        }

        if (!cancelled) {
          downloadPngBlob(blob, filename)
          toast.success('Poster saved — add it to WhatsApp or Instagram!')
        }
      } catch (e) {
        if (!cancelled) {
          console.error(e)
          toast.error('Could not create poster. Try again.')
        }
      } finally {
        if (movedOnscreen) {
          Object.assign(node.style, styleBackup)
        }
        setCaptureJob(null)
        setBusy(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [captureJob])

  const effectiveAspect = captureJob?.aspect ?? posterAspect
  const effectiveMode = captureJob?.mode ?? posterMode
  const dims = POSTER_DIMS[effectiveAspect]

  return (
    <span className="relative inline-flex shrink-0 align-top">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              disabled={busy}
              className={cn(
                buttonVariants({ variant: 'outline', size: 'sm' }),
                'border-border gap-1.5 min-w-[7.5rem]',
              )}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
              Share
              <ChevronDown className="h-3.5 w-3.5 opacity-70" />
            </button>
          }
        />
        <DropdownMenuContent align="end" className="min-w-[14rem] bg-card border-border z-[300]">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Full poster</DropdownMenuLabel>
          <DropdownMenuItem
            className="cursor-pointer"
            disabled={busy}
            onClick={() => requestCapture('story', 'full')}
          >
            Story 9:16
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer"
            disabled={busy}
            onClick={() => requestCapture('feed', 'full')}
          >
            Feed 4:5
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">Rank, trips & map</DropdownMenuLabel>
          <DropdownMenuItem
            className="cursor-pointer"
            disabled={busy}
            onClick={() => requestCapture('story', 'compact')}
          >
            Story 9:16
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer"
            disabled={busy}
            onClick={() => requestCapture('feed', 'compact')}
          >
            Feed 4:5
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div
        ref={ref}
        className="pointer-events-none overflow-hidden"
        style={{
          position: 'absolute',
          left: -10000,
          top: 0,
          width: dims.w,
          height: dims.h,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          boxSizing: 'border-box',
          background: 'linear-gradient(165deg, #fffbeb 0%, #fef3c7 35%, #fde68a 100%)',
          padding: `${Math.round(48 * scaleForAspect(effectiveAspect))}px ${Math.round(44 * scaleForAspect(effectiveAspect))}px ${Math.round(56 * scaleForAspect(effectiveAspect))}px`,
          color: '#1c1917',
        }}
        aria-hidden
      >
        <PosterBody props={props} aspect={effectiveAspect} mode={effectiveMode} />
      </div>
    </span>
  )
}
