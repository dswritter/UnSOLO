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
    <div className="wander-frost-panel flex h-full min-h-[5.25rem] w-full min-w-0 flex-wrap overflow-hidden sm:min-h-0 sm:flex-nowrap sm:divide-x sm:divide-white/10">
      {items.map(({ icon: Icon, value, label }) => (
        <div
          key={label}
          className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-2 sm:gap-2 sm:px-2.5 sm:py-2.5"
        >
          <Icon
            className="h-6 w-6 shrink-0 text-primary sm:h-8 sm:w-8 md:h-8 md:w-8"
            strokeWidth={1.85}
          />
          <div className="min-w-0 flex-1 overflow-hidden">
            <p className="text-base font-black tabular-nums leading-none text-foreground sm:text-lg md:text-xl">
              {value}
            </p>
            <p className="mt-0.5 break-words text-[9px] font-bold leading-snug text-muted-foreground sm:text-xs md:text-sm">
              {label}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
