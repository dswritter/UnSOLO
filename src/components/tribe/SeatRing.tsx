import { useId, type CSSProperties, type ReactNode } from 'react'
import type { Seat, UserLite } from '@/lib/tribe/models'
import { cn } from '@/lib/utils'
import { initials } from './format'

/**
 * Full Circle seat ring: N arc segments around a circular centre (trip photo, organiser face or a tinted disc).
 * Geometry follows docs/revamp/design-system.md → "The seat ring" exactly, so web, Android and iOS draw the same ring.
 */

type SegState = 'taken' | 'you' | 'held' | 'open'
export type RingSeg = { state: SegState; user?: UserLite | null }

const rad = (a: number) => (a * Math.PI) / 180
// Rounded so server- and client-rendered SVG attributes match exactly (no hydration warnings).
const r2 = (v: number) => Math.round(v * 100) / 100
const pol = (cx: number, cy: number, r: number, a: number): [number, number] => [r2(cx + r * Math.cos(rad(a))), r2(cy + r * Math.sin(rad(a)))]
function arcD(cx: number, cy: number, r: number, a0: number, a1: number) {
  const [x0, y0] = pol(cx, cy, r, a0)
  const [x1, y1] = pol(cx, cy, r, a1)
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r.toFixed(2)} ${r.toFixed(2)} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}
const clamp = (lo: number, v: number, hi: number) => Math.max(lo, Math.min(v, hi))

export function ringGeometry(S: number, n: number, withBadge: boolean) {
  const pad = S < 90 ? Math.max(3, S * 0.06) : Math.max(14, S * 0.085)
  const R = S / 2 - pad
  const wT = Math.max(4, S * 0.05)
  const wO = Math.max(2, S * 0.016)
  const nn = Math.max(n, 1)
  const d0 = clamp(12, S * 0.14, ((2 * Math.PI * R) / nn) * 0.6)
  const hostGap = withBadge ? Math.min(150, (2 * Math.asin(Math.min(1, (36 + d0 / 2 + 4) / R)) * 180) / Math.PI) : 0
  const span = 360 - hostGap
  const seg = span / nn
  const gap = Math.min(6, seg * 0.24)
  const start = -90 + hostGap / 2
  const segLen = (2 * Math.PI * R * seg) / 360
  const d = clamp(12, S * 0.12, segLen * 0.5)
  const r0 = Math.max(2, R - wT / 2 - (S < 90 ? Math.max(2, S * 0.05) : Math.max(6, S * 0.045)))
  return { pad, R, wT, wO, span, seg, gap, start, d, r0, cx: S / 2, cy: S / 2 }
}

/** Seats from the API → ring segments. Host/organiser of a hosted trip is the badge, not a seat; requested waits outside. */
export function segsFromSeats(seats: Seat[], { hostIsBadge = true }: { hostIsBadge?: boolean } = {}): { segs: RingSeg[]; waiting: UserLite | null; host: UserLite | null } {
  let host: UserLite | null = null
  let waiting: UserLite | null = null
  const taken: RingSeg[] = []
  const mine: RingSeg[] = []
  let open = 0
  for (const s of seats) {
    if ((s.state === 'host' || s.state === 'organiser') && hostIsBadge) { host = s.user; continue }
    if (s.state === 'host' || s.state === 'organiser') { host = s.user; taken.unshift({ state: 'taken', user: s.user }); continue }
    if (s.state === 'member') taken.push({ state: 'taken', user: s.user })
    else if (s.state === 'you') mine.push({ state: 'you', user: s.user })
    else if (s.state === 'held') mine.push({ state: 'held', user: s.user })
    else if (s.state === 'requested') { waiting = s.user; open++ }
    else open++
  }
  return { segs: [...taken, ...mine, ...Array.from({ length: open }, () => ({ state: 'open' as const }))], waiting, host }
}

export function segsFromCounts(total: number | null | undefined, left: number | null | undefined): RingSeg[] {
  const t = clamp(0, total ?? 0, 60)
  const l = clamp(0, left ?? t, t)
  return Array.from({ length: t }, (_, i) => ({ state: i < t - l ? 'taken' : 'open' }))
}

/** "Be first in the circle · 12 spots open" / "8 of 12 open · 4 going" / "Full · 12/12" */
export function ringCaption(n: number, taken: number): ReactNode {
  if (n <= 0) return null
  if (taken <= 0) return <><strong>Be first in the circle</strong> · {n} spots open</>
  if (taken >= n) return <><strong>Full · {n}/{n}</strong></>
  return <><strong>{n - taken} of {n} open</strong> · {taken} going</>
}
/** The one centre label every trip ring uses: "8/12 spots left", or "12/12 full". */
export function spotsCenter(total: number, left: number, fontSize?: number) {
  const full = left <= 0
  return { big: String(full ? total : left), of: `/${total}`, small: full ? 'full' : left === 1 ? 'spot left' : 'spots left', fontSize }
}
export function ringLabel(n: number, taken: number) {
  return taken >= n ? `Full, ${n} of ${n} spots taken` : `${n - taken} of ${n} spots open`
}

export function SeatRing({
  segs, size = 220, variant = 'trip', women, past, photo, center, badge, waiting, showDots = true, animateYou, spin, className, label,
}: {
  segs: RingSeg[]
  size?: number
  /** `plan`: community plan — hollow circles for open spots, no continuous track. */
  variant?: 'trip' | 'plan'
  women?: boolean
  past?: boolean
  photo?: string | null
  /** Centre label: `big` number, optional tiny `of` ("/12") beside it, and a `small` word under it. */
  center?: { big: string; of?: string; small?: string; fontSize?: number }
  badge?: { user: UserLite | null; label: 'Host' | 'Organiser' } | null
  waiting?: UserLite | null
  /** Faces/initials on taken seats. Off for signed-out viewers (anonymous arcs). */
  showDots?: boolean
  animateYou?: boolean
  spin?: boolean
  className?: string
  label?: string
}) {
  const S = size
  const n = segs.length
  const takenCount = segs.filter((s) => s.state !== 'open').length
  const full = n > 0 && takenCount >= n
  const g = ringGeometry(S, n, !!badge)
  const uid = `r${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const parts: ReactNode[] = []
  const dots: ReactNode[] = []
  const under: ReactNode[] = []
  const defs: ReactNode[] = []

  if (variant === 'trip' && n > 0) {
    under.push(<path key="track" className="fc-ring-track" d={arcD(g.cx, g.cy, g.R, g.start + g.gap / 2, g.start + g.span - g.gap / 2)} strokeWidth={g.wO} fill="none" strokeLinecap="round" />)
  }
  // Trip rings read as a simple progress ring: consecutive taken spots draw as one continuous arc over
  // the thin open track, so a 30-spot trip stays as calm as a 6-spot one. Plans keep one hollow
  // circle per open spot (they are small groups).
  let runStart = -1
  segs.forEach((s, i) => {
    const a0 = g.start + i * g.seg + g.gap / 2
    const a1 = a0 + g.seg - g.gap
    const [px, py] = pol(g.cx, g.cy, g.R, (a0 + a1) / 2)
    const d = arcD(g.cx, g.cy, g.R, a0, a1)
    if (s.state === 'open') {
      if (variant === 'plan') parts.push(<circle key={i} className="fc-ring-planopen" cx={px} cy={py} r={Math.max(5, g.d * 0.34)} strokeWidth={2.5} />)
      return
    }
    if (s.state === 'taken') {
      if (variant === 'trip') {
        if (runStart < 0) runStart = i
        if (segs[i + 1]?.state !== 'taken') {
          const r0 = g.start + runStart * g.seg + g.gap / 2
          parts.push(<path key={i} className="fc-ring-taken" d={arcD(g.cx, g.cy, g.R, r0, a1)} strokeWidth={g.wT} fill="none" strokeLinecap="round" />)
          runStart = -1
        }
      } else {
        parts.push(<path key={i} className="fc-ring-taken" d={d} strokeWidth={g.wT} fill="none" strokeLinecap="round" />)
      }
    } else {
      const len = ((2 * Math.PI * g.R * (a1 - a0)) / 360).toFixed(1)
      const drawCls = animateYou && s.state === 'you' ? 'fc-ring-draw' : undefined
      const style = drawCls ? ({ ['--len' as string]: len } as CSSProperties) : undefined
      under.push(<path key={`u${i}`} className={cn('fc-ring-you-under', drawCls)} style={style} d={d} strokeWidth={g.wT + 3} fill="none" strokeLinecap="round" />)
      parts.push(<path key={i} className={cn(s.state === 'held' ? 'fc-ring-held' : 'fc-ring-you', drawCls)} style={style} d={d} strokeWidth={g.wT} fill="none" strokeLinecap="round" />)
    }
    if (!showDots || g.d < 14) return
    const r = g.d / 2
    const isYou = s.state !== 'taken'
    const u = s.user
    if (u?.avatarUrl) {
      defs.push(<clipPath key={`c${i}`} id={`${uid}c${i}`}><circle cx={px} cy={py} r={r} /></clipPath>)
      dots.push(
        <g key={`d${i}`}>
          <circle className={isYou ? 'fc-ring-you-dot-halo' : 'fc-ring-dot-halo'} cx={px} cy={py} r={r + 2} />
          <image href={u.avatarUrl} x={px - r} y={py - r} width={g.d} height={g.d} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${uid}c${i})`} />
        </g>,
      )
    } else if (u || isYou) {
      const text = isYou ? (u ? initials(u.name) : 'You') : initials(u!.name)
      dots.push(
        <g key={`d${i}`}>
          <circle className={isYou ? 'fc-ring-you-dot-halo' : 'fc-ring-dot-halo'} cx={px} cy={py} r={r + 2} />
          <circle className={isYou ? 'fc-ring-you-dot' : 'fc-ring-dot'} cx={px} cy={py} r={r} />
          <text className={isYou ? 'fc-ring-you-dot-text' : 'fc-ring-dot-text'} x={px} y={py} dy=".35em" textAnchor="middle" fontSize={Math.max(8, g.d * (text === 'You' ? 0.3 : 0.36))}>{text}</text>
        </g>,
      )
    }
  })

  let centre: ReactNode
  if (photo) {
    defs.push(<clipPath key="p" id={`${uid}p`}><circle cx={g.cx} cy={g.cy} r={g.r0} /></clipPath>)
    centre = (
      <>
        <circle className="fc-ring-disc" cx={g.cx} cy={g.cy} r={g.r0} />
        <image href={photo} x={g.cx - g.r0} y={g.cy - g.r0} width={g.r0 * 2} height={g.r0 * 2} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${uid}p)`} />
      </>
    )
  } else {
    centre = <circle className="fc-ring-disc" cx={g.cx} cy={g.cy} r={g.r0} />
  }

  let wait: ReactNode = null
  if (waiting) {
    const [wx, wy] = pol(g.cx, g.cy, g.R + 30, -28)
    wait = (
      <span className="fc-ring-wait" style={{ left: wx - 20, top: wy - 20 }} title={`${waiting.name} · waiting for approval`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {waiting.avatarUrl ? <img src={waiting.avatarUrl} alt="" /> : initials(waiting.name)}
        <i aria-hidden><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg></i>
      </span>
    )
  }

  return (
    <div
      className={cn('fc-ring', full && 'is-full', women && 'is-women', past && 'is-past', spin && 'is-spin', className)}
      style={{ width: S, height: S }}
      role="img"
      aria-label={label ?? (waiting ? `${ringLabel(n, takenCount)}. Your request is waiting for approval` : ringLabel(n, takenCount))}
    >
      <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} aria-hidden>
        <defs>{defs}</defs>
        {centre}
        {under}
        {parts}
        {dots}
      </svg>
      {center && (
        <div className={cn('fc-ring-center', photo && 'on-photo')} style={{ fontSize: center.fontSize ?? S * 0.2 }}>
          <div><b>{center.big}{center.of && <em>{center.of}</em>}</b>{center.small && <span>{center.small}</span>}</div>
        </div>
      )}
      {badge && (
        <span className={cn('fc-ring-badge', badge.label === 'Organiser' && 'is-org')} style={{ top: g.pad - 14 }}>
          {badge.user?.avatarUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={badge.user.avatarUrl} alt="" />
            : <span className="fc-av grid place-items-center text-[10px]">{badge.user ? initials(badge.user.name) : ''}</span>}
          {badge.label}
        </span>
      )}
      {wait}
    </div>
  )
}

/** List progress arc: thin open track + pine fill from 12 o'clock, "k/n" in the middle. */
export function MiniArc({ total, taken, size = 44, women, className }: { total: number; taken: number; size?: number; women?: boolean; className?: string }) {
  const n = Math.max(total, 0)
  if (n === 0) return null
  const k = clamp(0, taken, n)
  const R = size / 2 - 4
  const C = 2 * Math.PI * R
  const c = size / 2
  return (
    <span className={cn('fc-mini', k >= n && 'is-full', women && 'is-women', className)} style={{ width: size, height: size }} role="img" aria-label={`${k} of ${n} spots taken`}>
      <svg width={size} height={size} aria-hidden>
        <circle className="fc-mini-track" cx={c} cy={c} r={R} fill="none" strokeWidth={2} />
        {k > 0 && <circle className="fc-mini-fill" cx={c} cy={c} r={R} fill="none" strokeWidth={5} strokeLinecap="round" strokeDasharray={`${(C * k) / n} ${C}`} transform={`rotate(-90 ${c} ${c})`} />}
      </svg>
      <b>{k}/{n}</b>
    </span>
  )
}

/** Story ring: one arc per story; pine unseen, rule seen, gold for your own. */
export function StoryRing({ count, seen = 0, you, size = 64, children }: { count: number; seen?: number; you?: boolean; size?: number; children?: ReactNode }) {
  const n = Math.max(count, 1)
  const R = size / 2 - 2.5
  const c = size / 2
  const gap = n > 1 ? Math.min(10, 360 / n * 0.18) : 0
  const seg = 360 / n
  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0" aria-hidden>
        {n === 1
          ? <circle className={cn('fc-story-seg', you && 'is-you', seen >= 1 && !you && 'is-seen')} cx={c} cy={c} r={R} fill="none" strokeWidth={3} />
          : Array.from({ length: n }, (_, i) => {
            const a0 = -90 + i * seg + gap / 2
            return <path key={i} className={cn('fc-story-seg', you && 'is-you', i < seen && !you && 'is-seen')} d={arcD(c, c, R, a0, a0 + seg - gap)} fill="none" strokeWidth={3} strokeLinecap="round" />
          })}
      </svg>
      <span className="grid overflow-hidden rounded-full bg-[color:var(--pc-tonal)]" style={{ width: size - 10, height: size - 10 }}>{children}</span>
    </span>
  )
}
