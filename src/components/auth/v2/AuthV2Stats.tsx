import { Users, Star, MapPin, Smile } from 'lucide-react'
import type { WanderRatingHero, WanderStats } from '@/lib/wander/wanderQueries'
import { cn } from '@/lib/utils'

function fmt(n: number, suffix = '') {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M${suffix}`
  if (n >= 1_000) return `${Math.floor(n / 1_000)}K${suffix}`
  return `${n.toLocaleString('en-IN')}${suffix}`
}

type AuthV2StatsProps = {
  stats: WanderStats
  rating: Pick<WanderRatingHero, 'overall' | 'reviewCount'>
  className?: string
}

/**
 * Real marketing stats (same data sources as Wander). Shown in AuthV2Shell on /login and /signup.
 */
export function AuthV2Stats({ stats, rating, className }: AuthV2StatsProps) {
  const trustLabel =
    rating.reviewCount > 0 ? `From ${rating.reviewCount.toLocaleString('en-IN')} reviews` : 'Average rating'

  const items = [
    { id: 'solo' as const, value: fmt(stats.soloTravelers, '+'), label: 'Solo travellers', icon: Users },
    {
      id: 'rating' as const,
      value: rating.overall.toFixed(1),
      valueSuffix: '★' as const,
      label: trustLabel,
      icon: Star,
    },
    { id: 'dest' as const, value: fmt(stats.destinations, '+'), label: 'Destinations', icon: MapPin },
    { id: 'happy' as const, value: `${stats.happyPercent}%`, label: 'Happy customers', icon: Smile },
  ] as const

  return (
    <ul
      className={cn(
        'grid w-full max-w-4xl grid-cols-2 gap-x-4 gap-y-3 sm:flex sm:max-w-none sm:flex-wrap sm:items-center sm:justify-center sm:gap-6 sm:gap-y-3 md:gap-8 md:gap-y-3',
        className,
      )}
    >
      {items.map((row) => {
        const { id, value, label, icon: Icon } = row
        const valueSuffix = 'valueSuffix' in row ? row.valueSuffix : undefined
        return (
        <li
          key={id}
          className="flex min-w-0 items-start gap-2.5 text-white sm:max-w-[10rem] sm:items-center md:max-w-none"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-[#fcba03]">
            <Icon className="h-4 w-4" strokeWidth={2} />
          </div>
          <div className="min-w-0 text-left">
            <p className="text-lg font-black leading-tight text-white sm:text-xl">
              {value}
              {valueSuffix ? (
                <span className="ml-0.5 text-base text-[#fcba03] sm:text-lg">{valueSuffix}</span>
              ) : null}
            </p>
            <p className="text-[10px] font-medium text-white/55 sm:text-xs leading-snug">{label}</p>
          </div>
        </li>
        )
      })}
    </ul>
  )
}
