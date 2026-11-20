import Link from 'next/link'
import { ArrowRight, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { UserLite } from '@/lib/tribe/models'
import { initials } from '@/components/tribe/format'

/**
 * "Post a plan" invitation. The whole card opens the plan composer; the Tribe link sits above that
 * stretched link so it stays its own target. The faces are real people planning right now, which is
 * the pull: no decorative ring, no looping motion.
 */
export function PlanInvite({ planners = [], planningCount = 0, compact = false, className }: {
  planners?: UserLite[]
  planningCount?: number
  compact?: boolean
  className?: string
}) {
  return (
    <div className={cn('fc-invite pc-card relative flex flex-col justify-center p-5', className)}>
      <Link href="/tribe/new?kind=plan" className="absolute inset-0 z-[1] rounded-[inherit] focus-visible:outline-none" aria-label="Post a plan" />
      <div className="flex items-start gap-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-foreground text-background" aria-hidden>
          <Plus className="h-5 w-5" strokeWidth={2.6} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className={cn('leading-tight', compact ? 'text-[18px]' : 'text-[21px]')}>Going somewhere? Post a plan.</h3>
          <p className="mt-1 text-[14px] text-muted-foreground">Travellers heading your way ask to join. No booking, no money.</p>
          <Link href="/tribe" className="group relative z-[2] mt-3 inline-flex items-center gap-2 text-[14px] font-bold">
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
  )
}
