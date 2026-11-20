'use client'

import { useId, useState } from 'react'
import { AlertTriangle } from 'lucide-react'

export type Overview = {
  range_days: number
  dau: number; wau: number; mau: number
  signups: number; bookings: number; gmv_paise: number
  posts: Record<string, number> | null
  weekly_posters_pct: number; plan_fill_rate_pct: number; asks_answered_pct: number
  median_first_reply_hours: number | null; reports_per_1k_posts: number
  open_reports: number; overdue_reports: number; plans_converted: number
  platform_split: Record<string, number> | null
  daily: { day: string; active: number; posts: number; bookings: number; signups: number }[]
  top_screens: { screen: string; views: number }[]
  funnel: { trip_viewed: number; seat_tapped: number; paid: number }
}

const fmt = (n: number) => (n >= 1e7 ? `${(n / 1e7).toFixed(1)}Cr` : n >= 1e5 ? `${(n / 1e5).toFixed(1)}L` : n >= 1e4 ? `${(n / 1e3).toFixed(1)}K` : Math.round(n).toLocaleString('en-IN'))
const rupees = (p: number) => `₹${fmt(p / 100)}`

/** Single-series charts use one hue (validated: #1E4FA0 light / #6B93D6 dark); text stays in text tokens. */
export function AnalyticsDashboard({ data }: { data: Overview }) {
  const [table, setTable] = useState(false)
  const posts = data.posts ?? {}
  const totalPosts = Object.values(posts).reduce((a, b) => a + b, 0)
  return (
    <div className="space-y-8" style={{ ['--chart' as string]: 'var(--pc-chart, #1E4FA0)' }}>
      <section aria-label="People">
        <h2 className="mb-3 text-lg">People and money</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Tile label="Active today" value={fmt(data.dau)} />
          <Tile label="Active this week" value={fmt(data.wau)} />
          <Tile label="Active this month" value={fmt(data.mau)} />
          <Tile label={`Sign-ups (${data.range_days} d)`} value={fmt(data.signups)} />
          <Tile label={`Paid bookings (${data.range_days} d)`} value={fmt(data.bookings)} />
          <Tile label={`Booking value (${data.range_days} d)`} value={rupees(data.gmv_paise)} />
        </div>
      </section>

      <section aria-label="Tribe health">
        <h2 className="mb-3 text-lg">Tribe health</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Tile label="Weekly users who post" value={`${data.weekly_posters_pct}%`} hint="Target ≥ 5%" />
          <Tile label="Plan fill rate" value={`${data.plan_fill_rate_pct}%`} hint="≥ 1 approved joiner in 7 days" />
          <Tile label="Asks answered" value={`${data.asks_answered_pct}%`} />
          <Tile label="Median first reply" value={data.median_first_reply_hours == null ? '—' : `${data.median_first_reply_hours} h`} hint="Target < 12 h" />
          <Tile label="Reports per 1,000 posts" value={String(data.reports_per_1k_posts)} hint="Target < 5" />
          <Tile label="Plans turned into trips" value={fmt(data.plans_converted)} />
        </div>
        {(data.open_reports > 0 || data.overdue_reports > 0) && (
          <p className="mt-3 inline-flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-[color:var(--pc-red)]" aria-hidden />
            <span><strong>{data.open_reports}</strong> open reports{data.overdue_reports ? <>, <strong className="text-[color:var(--pc-red)]">{data.overdue_reports} overdue</strong></> : null} · <a className="pc-link" href="/admin/moderation">Open queue</a></span>
          </p>
        )}
      </section>

      <section aria-label="Daily trends">
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-lg">Every day</h2>
          <button type="button" className="pc-btn pc-btn-quiet pc-btn-sm" onClick={() => setTable(!table)} aria-pressed={table}>{table ? 'Show charts' : 'Show as table'}</button>
        </div>
        {table ? <DailyTable rows={data.daily} /> : (
          <div className="grid gap-4 md:grid-cols-2">
            <LineChart title="Active people" rows={data.daily} k="active" />
            <LineChart title="New posts" rows={data.daily} k="posts" />
            <LineChart title="Paid bookings" rows={data.daily} k="bookings" />
            <LineChart title="Sign-ups" rows={data.daily} k="signups" />
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <BarList title="Booking funnel" sub="People, not events" rows={[
          { label: 'Viewed a trip', value: data.funnel.trip_viewed },
          { label: 'Tapped Take a seat', value: data.funnel.seat_tapped },
          { label: 'Paid', value: data.funnel.paid },
        ]} showPct />
        <BarList title="Most viewed screens" rows={data.top_screens.map((s) => ({ label: s.screen.replace(/_/g, ' '), value: s.views }))} />
        <div className="space-y-6">
          <BarList title="Where people use UnSOLO" rows={Object.entries(data.platform_split ?? {}).map(([k, v]) => ({ label: k === 'ios' ? 'iOS' : k === 'android' ? 'Android' : 'Web', value: v }))} />
          <BarList title={`Posts by type (${totalPosts})`} rows={['plan', 'story', 'ask'].map((k) => ({ label: `${k[0].toUpperCase()}${k.slice(1)}s`, value: posts[k] ?? 0 }))} />
        </div>
      </div>
    </div>
  )
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="pc-mono mt-1 text-2xl font-semibold">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

type Row = Overview['daily'][number]

/** Single-series line: 2px stroke, ~10% wash, hairline grid, crosshair + tooltip (pointer and keyboard). */
function LineChart({ title, rows, k }: { title: string; rows: Row[]; k: 'active' | 'posts' | 'bookings' | 'signups' }) {
  const id = useId()
  const [hover, setHover] = useState<number | null>(null)
  const W = 560, H = 180, L = 36, R = 44, T = 12, B = 24
  const vals = rows.map((r) => r[k])
  const max = Math.max(1, ...vals)
  const step = niceStep(max)
  const top = Math.ceil(max / step) * step
  const x = (i: number) => L + (rows.length <= 1 ? 0 : (i * (W - L - R)) / (rows.length - 1))
  const y = (v: number) => T + (H - T - B) * (1 - v / top)
  const d = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const area = `${d}L${x(vals.length - 1)},${y(0)}L${x(0)},${y(0)}Z`
  const ticks = Array.from({ length: Math.floor(top / step) + 1 }, (_, i) => i * step)
  const last = vals.length - 1
  const hi = hover ?? null
  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    setHover(Math.max(0, Math.min(last, Math.round(((px - L) / (W - L - R)) * last))))
  }
  return (
    <figure className="rounded-md border border-border bg-card p-3">
      <figcaption className="mb-1 text-sm font-semibold" id={`${id}-t`}>{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full touch-none" role="img" aria-labelledby={`${id}-t`} tabIndex={0}
        onPointerMove={onMove} onPointerLeave={() => setHover(null)}
        onKeyDown={(e) => { if (e.key === 'ArrowRight') setHover(Math.min(last, (hover ?? -1) + 1)); if (e.key === 'ArrowLeft') setHover(Math.max(0, (hover ?? last + 1) - 1)) }}
        onBlur={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--pc-rule)" strokeWidth={1} />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--pc-ink3)" className="pc-mono">{fmt(t)}</text>
          </g>
        ))}
        {rows.length > 0 && [0, Math.floor(last / 2), last].map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'} fontSize={11} fill="var(--pc-ink3)">{shortDay(rows[i].day)}</text>
        ))}
        <path d={area} fill="var(--chart)" opacity={0.1} />
        <path d={d} fill="none" stroke="var(--chart)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {last >= 0 && <>
          <circle cx={x(last)} cy={y(vals[last])} r={4} fill="var(--chart)" stroke="var(--card)" strokeWidth={2} />
          <text x={x(last) + 8} y={y(vals[last]) + 4} fontSize={12} fill="var(--pc-ink)" className="pc-mono" fontWeight={600}>{fmt(vals[last])}</text>
        </>}
        {hi != null && rows[hi] && <>
          <line x1={x(hi)} x2={x(hi)} y1={T} y2={y(0)} stroke="var(--pc-ink3)" strokeWidth={1} />
          <circle cx={x(hi)} cy={y(vals[hi])} r={4} fill="var(--chart)" stroke="var(--card)" strokeWidth={2} />
        </>}
      </svg>
      <p className="pc-mono h-5 text-xs text-muted-foreground" aria-live="polite">
        {hi != null && rows[hi] ? <><strong className="text-foreground">{fmt(vals[hi])}</strong> · {shortDay(rows[hi].day)}</> : ' '}
      </p>
    </figure>
  )
}

/** Horizontal bars: ≤ 24px thick, 4px rounded data-end, square at the baseline, value at the tip. */
function BarList({ title, sub, rows, showPct }: { title: string; sub?: string; rows: { label: string; value: number }[]; showPct?: boolean }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  const first = rows[0]?.value || 1
  return (
    <section className="rounded-md border border-border bg-card p-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      {rows.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No data yet</p> : (
        <ul className="mt-3 space-y-2">
          {rows.map((r) => (
            <li key={r.label} className="group" tabIndex={0} title={`${r.label}: ${r.value.toLocaleString('en-IN')}`}>
              <div className="mb-0.5 flex justify-between text-xs"><span className="capitalize">{r.label}</span>
                <span className="pc-mono text-muted-foreground">{r.value.toLocaleString('en-IN')}{showPct && first ? ` · ${Math.round((r.value / first) * 100)}%` : ''}</span></div>
              <div className="h-3 w-full">
                <div className="h-3 rounded-r-[4px] bg-[color:var(--chart)] transition-opacity group-hover:opacity-80 group-focus:opacity-80" style={{ width: `${Math.max((r.value / max) * 100, r.value ? 1.5 : 0)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function DailyTable({ rows }: { rows: Row[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="pc-table text-sm">
        <thead><tr><th>Day</th><th className="text-right">Active</th><th className="text-right">Posts</th><th className="text-right">Bookings</th><th className="text-right">Sign-ups</th></tr></thead>
        <tbody>{[...rows].reverse().map((r) => (
          <tr key={r.day}><td>{r.day}</td>{(['active', 'posts', 'bookings', 'signups'] as const).map((k) => <td key={k} className="pc-mono text-right">{r[k]}</td>)}</tr>
        ))}</tbody>
      </table>
    </div>
  )
}

function niceStep(max: number) {
  const raw = max / 4
  const pow = 10 ** Math.floor(Math.log10(raw || 1))
  const n = raw / pow
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow
}
function shortDay(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}
