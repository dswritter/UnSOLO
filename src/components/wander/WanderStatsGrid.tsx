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
    <div className="wander-frost flex h-full min-h-[5.25rem] w-full flex-wrap rounded-xl sm:min-h-0 sm:flex-nowrap sm:divide-x sm:divide-white/10">
      {items.map(({ icon: Icon, value, label }) => (
        <div
          key={label}
          className="flex min-w-0 flex-1 items-center gap-1.5 px-1.5 py-2 sm:gap-2 sm:px-2.5 sm:py-2.5"
        >
          <Icon
            className="h-7 w-7 shrink-0 text-primary sm:h-8 sm:w-8 md:h-9 md:w-9"
            strokeWidth={1.85}
          />
          <div className="min-w-0">
            <p className="text-lg font-black tabular-nums leading-none text-foreground sm:text-xl md:text-2xl">
              {value}
            </p>
            <p className="mt-0.5 text-[10px] font-bold leading-tight text-muted-foreground sm:text-xs md:text-sm">
              {label}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
