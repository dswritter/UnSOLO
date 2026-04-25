import { MapPin, CreditCard, Smile } from 'lucide-react'
import type { WanderStats } from '@/lib/wander/wanderQueries'

function fmt(n: number, suffix = '') {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M${suffix}`
  if (n >= 1_000) return `${Math.floor(n / 1_000)}K${suffix}`
  return `${n}${suffix}`
}

export function WanderStatsGrid({ stats }: { stats: WanderStats }) {
  const items = [
    { icon: MapPin, value: fmt(stats.destinations, '+'), label: 'Destinations' },
    { icon: CreditCard, value: fmt(stats.bookings, '+'), label: 'Bookings' },
    { icon: Smile, value: `${stats.happyPercent}%`, label: 'Happy customers' },
  ] as const
  return (
    <div className="flex h-full min-h-[5.25rem] w-full flex-wrap divide-x divide-border/50 rounded-xl border border-border/80 bg-card/60 shadow-sm sm:min-h-0 sm:flex-nowrap">
      {items.map(({ icon: Icon, value, label }) => (
        <div
          key={label}
          className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-2.5 sm:gap-3 sm:px-3 sm:py-3 md:py-3.5"
        >
          <Icon className="h-5 w-5 shrink-0 text-primary sm:h-6 sm:w-6" strokeWidth={1.75} />
          <div className="min-w-0">
            <p className="text-xl font-black tabular-nums leading-none text-foreground sm:text-2xl md:text-[1.65rem]">
              {value}
            </p>
            <p className="mt-1 text-xs font-semibold leading-tight text-muted-foreground sm:text-sm">{label}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
