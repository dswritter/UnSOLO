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
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {items.map(({ icon: Icon, value, label }) => (
        <div
          key={label}
          className="rounded-lg border border-border/80 bg-card/60 px-2 py-2.5 sm:px-3 sm:py-3.5 shadow-sm"
        >
          <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-primary mb-1.5" />
          <p className="text-lg sm:text-xl font-black text-foreground tabular-nums leading-none">{value}</p>
          <p className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5 leading-tight line-clamp-2">{label}</p>
        </div>
      ))}
    </div>
  )
}
