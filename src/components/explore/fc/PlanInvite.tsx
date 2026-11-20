import Link from 'next/link'
import { ArrowRight, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { UserLite } from '@/lib/tribe/models'
import { initials } from '@/components/tribe/format'

const N = 6
const R = 44
const C = 56
const pol = (a: number): [number, number] => [C + R * Math.cos((a * Math.PI) / 180), C + R * Math.sin((a * Math.PI) / 180)]
function arc(a0: number, a1: number) {
  const [x0, y0] = pol(a0)
  const [x1, y1] = pol(a1)
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${R} ${R} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}

/**
 * "Post a plan" invitation. A small plan ring with *you* (gold) at the top and the other seats
 * filling in one by one, on a loop: the picture of what posting a plan does. Links to the composer
 * and to Tribe, where other people's plans live. Motion is CSS only and stops under reduced motion.
 */
export function PlanInvite({ planners = [], planningCount = 0, compact = false, className }: {
  planners?: UserLite[]
  planningCount?: number
  compact?: boolean
  className?: string
}) {
  const seg = 360 / N
  const gap = 10
  return (
    <div className={cn('fc-invite pc-card relative overflow-hidden p-5', className)}>
      <div className={cn('flex gap-5', compact ? 'items-center' : 'flex-col items-start sm:flex-row sm:items-center')}>
        <div className="fc-invite-ring relative shrink-0" aria-hidden>
          <svg width={112} height={112} viewBox="0 0 112 112">
            <circle cx={C} cy={C} r={R - 12} className="fc-invite-disc" />
            {Array.from({ length: N }, (_, i) => {
              const a0 = -90 + i * seg + gap / 2
              const a1 = a0 + seg - gap
              const [mx, my] = pol((a0 + a1) / 2)
              return i === 0 ? (
                <g key={i}>
                  <path d={arc(a0, a1)} className="fc-ring-you-under" strokeWidth={8} fill="none" strokeLinecap="round" />
                  <path d={arc(a0, a1)} className="fc-ring-you" strokeWidth={5.5} fill="none" strokeLinecap="round" />
                </g>
              ) : (
                <g key={i}>
                  <circle cx={mx} cy={my} r={4.5} className="fc-ring-planopen" strokeWidth={2} />
                  <path d={arc(a0, a1)} className="fc-invite-seg" style={{ animationDelay: `${0.5 + i * 0.55}s` }} strokeWidth={5.5} fill="none" strokeLinecap="round" />
                </g>
              )
            })}
          </svg>
          <span className="fc-invite-plus"><Plus className="h-5 w-5" strokeWidth={2.6} /></span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className={cn('leading-tight', compact ? 'text-[18px]' : 'text-[21px]')}>Going somewhere? Post a plan.</h3>
          <p className="mt-1 text-[14px] text-muted-foreground">Travellers heading your way ask to join. No booking, no money.</p>
          <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-2.5">
            <Link href="/tribe/new?kind=plan" className="pc-btn pc-btn-sm"><Plus className="h-4 w-4" aria-hidden />Start a plan</Link>
            <Link href="/tribe" className="group inline-flex items-center gap-2 text-[14px] font-bold">
              {planners.length > 0 && (
                <span className="pc-avstack" aria-hidden>
                  {planners.slice(0, 3).map((u) => (
                    <span key={u.id} className="pc-seat" style={{ ['--s' as string]: '26px', fontSize: 9 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {u.avatarUrl ? <img src={u.avatarUrl} alt="" /> : initials(u.name)}
                    </span>
                  ))}
                </span>
              )}
              <span>{planningCount > 0 ? `${planningCount} planning in Tribe` : 'See plans in Tribe'}</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
