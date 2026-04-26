import type { LucideIcon } from 'lucide-react'
import { Users, Star, MapPin, Smile } from 'lucide-react'
import { cn } from '@/lib/utils'

const ITEMS: {
  value: string
  valueSuffix?: string
  label: string
  icon: LucideIcon
}[] = [
  { value: '50K+', label: 'Solo travellers', icon: Users },
  { value: '4.8', valueSuffix: '★', label: 'Trusted by users', icon: Star },
  { value: '100+', label: 'Destinations', icon: MapPin },
  { value: '92%', label: 'Happy users', icon: Smile },
]

export function AuthV2Stats({ className }: { className?: string }) {
  return (
    <ul
      className={cn(
        'grid w-full max-w-md grid-cols-2 gap-x-6 gap-y-4 sm:flex sm:max-w-none sm:flex-wrap sm:items-center sm:gap-8',
        className,
      )}
    >
      {ITEMS.map(({ value, valueSuffix, label, icon: Icon }) => (
        <li key={label} className="flex min-w-0 items-start gap-2.5 text-white sm:items-center">
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
            <p className="text-[11px] font-medium text-white/55 sm:text-xs">{label}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}
