import { Users, MapPin, CreditCard, Heart } from 'lucide-react'
import type { WanderStats } from '@/lib/wander/wanderQueries'

function fmt(n: number, suffix = '') {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M${suffix}`
  if (n >= 1_000) return `${Math.floor(n / 1_000)}K${suffix}`
  return `${n}${suffix}`
}

export function WanderStatsGrid({ stats }: { stats: WanderStats }) {
  const items = [
    { icon: Users, value: fmt(stats.soloTravelers, '+'), label: 'Solo travelers' },
    { icon: MapPin, value: fmt(stats.destinations, '+'), label: 'Destinations' },
    { icon: CreditCard, value: fmt(stats.bookings, '+'), label: 'Bookings' },
    { icon: Heart, value: `${stats.happyPercent}%`, label: 'Happy customers' },
  ] as const
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4">
      {items.map(({ icon: Icon, value, label }) => (
        <div
          key={label}
          className="rounded-xl border border-border/80 bg-card/60 px-3 py-3 sm:px-4 sm:py-4 shadow-sm"
        >
          <Icon className="h-5 w-5 text-primary mb-2" />
          <p className="text-xl sm:text-2xl font-black text-foreground tabular-nums leading-none">{value}</p>
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 leading-snug">{label}</p>
        </div>
      ))}
    </div>
  )
}
