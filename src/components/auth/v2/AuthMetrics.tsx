import { Users, Star, Compass, Smile, type LucideIcon } from 'lucide-react'
import { getAuthHeroMetrics, type AuthHeroMetrics } from '@/lib/wander/wanderQueries'
import { cn } from '@/lib/utils'

type Metric = { id: string; value: string; label: string; icon: LucideIcon }

function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M+`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K+`
  return `${n}+`
}

/** Hides unavailable or zero values rather than advertising placeholder numbers. */
export function authMetricItems(m: AuthHeroMetrics): Metric[] {
  const items: Metric[] = []
  if (m.travellers > 0) items.push({ id: 'travellers', value: compact(m.travellers), label: 'Travellers', icon: Users })
  if (m.hosts > 0) items.push({ id: 'hosts', value: compact(m.hosts), label: 'Hosts', icon: Compass })
  if (m.rating !== null && m.reviewCount > 0) {
    items.push({ id: 'rating', value: m.rating.toFixed(1), label: `${m.reviewCount} reviews`, icon: Star })
  }
  if (m.happyPercent > 0) items.push({ id: 'happy', value: `${m.happyPercent}%`, label: 'Happy', icon: Smile })
  return items
}

const ROW = 'flex w-full items-stretch divide-x divide-foreground/10 rounded-2xl border border-foreground/10 bg-card/45 backdrop-blur-md'

export function AuthMetricsRow({ items, className }: { items: Metric[]; className?: string }) {
  if (items.length === 0) return null
  return (
    <ul aria-label="Unsolo community" className={cn(ROW, className)}>
      {items.map(({ id, value, label, icon: Icon }) => (
        <li key={id} className="flex min-w-0 flex-1 flex-col items-center justify-center px-1 py-2 text-center lg:py-3">
          <span className="flex items-center gap-1 text-[15px] font-extrabold leading-none tabular-nums text-foreground lg:text-xl">
            <Icon className="h-3.5 w-3.5 shrink-0 text-primary lg:h-4 lg:w-4" aria-hidden strokeWidth={2.25} />
            {value}
          </span>
          <span className="mt-1 truncate text-[10px] font-medium uppercase tracking-wide text-foreground/60 lg:text-[11px]">
            {label}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function AuthMetricsSkeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn(ROW, 'h-[50px] lg:h-[66px]', className)}>
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="flex flex-1 flex-col items-center justify-center gap-1.5">
          <div className="h-3 w-10 animate-pulse rounded bg-foreground/15" />
          <div className="h-2 w-12 animate-pulse rounded bg-foreground/10" />
        </div>
      ))}
    </div>
  )
}

export async function AuthMetrics({ className }: { className?: string }) {
  let items: Metric[]
  try {
    items = authMetricItems(await getAuthHeroMetrics())
  } catch (error) {
    console.error('Auth metrics unavailable:', error)
    return null
  }
  return <AuthMetricsRow items={items} className={className} />
}
